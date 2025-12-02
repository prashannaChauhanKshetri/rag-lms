import io
import logging

import re
import json # Added for TOC parsing
from typing import List, Dict, Tuple, Optional
import fitz  # PyMuPDF
import tiktoken

import ollama  # Replaced pytesseract
from pdf2image import convert_from_bytes
from PIL import Image

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rag-utils")

# Constants
CHUNK_SIZE = 384  # Tokens
CHUNK_OVERLAP = 50

def count_tokens(text: str) -> int:
    """Count tokens using tiktoken (cl100k_base)"""
    enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))

def extract_toc(doc: fitz.Document) -> Dict[int, str]:
    """
    Extract Table of Contents to map Page Number -> Chapter Name.
    """
    toc_map = {}
    
    # Try metadata TOC first
    toc = doc.get_toc()
    if toc:
        logger.info(f"Found Metadata TOC with {len(toc)} entries")
        for level, title, page in toc:
            toc_map[page] = title
        return toc_map
        
    return {}

def extract_toc_with_qwen(doc: fitz.Document) -> Dict[int, str]:
    """
    Use Qwen3-VL-4B to read the Table of Contents from the first 10 pages.
    """
    logger.info("Attempting AI-powered TOC extraction with Qwen3-VL...")
    toc_map = {}
    
    # Scan first 5 pages (usually TOC is here) - Reduced from 10 to save RAM
    for i in range(min(5, len(doc))):
        try:
            page = doc[i]
            text = page.get_text().lower()
            
            # Heuristic: If page 1-3, scan it regardless (often TOC is early). 
            # For pages 4-10, require keywords.
            if i > 2:
                if "content" not in text and "index" not in text and "chapter" not in text and "unit" not in text:
                    continue
                
            logger.info(f"Scanning Page {i+1} for TOC...")
            pix = page.get_pixmap(dpi=150)
            img_data = pix.tobytes("png")
            
            response = ollama.chat(
                model='qwen3-vl:4b',
                messages=[{
                    'role': 'user',
                    'content': 'Analyze this Table of Contents image. Extract the structure (Unit/Chapter/Lesson/Section) Name and its Starting Page Number. \nFormat: JSON {PageNumber: "Title"}. \nExample: {"1": "Unit 1: Algebra", "15": "Chapter 2: Geometry", "30": "Lesson 5: History", "162": "3. Trigonometry"}. \nLook for: "Unit", "Chapter", "Lesson", "Section", "Part", or numbered lists followed by a title. Works for any language (English, Nepali, etc.). Ignore dots/lines.',
                    'images': [img_data]
                }],
                options={'keep_alive': 0}  # Unload immediately to free RAM
            )
            
            content = response['message']['content']
            # Clean up code blocks if present
            content = content.replace("```json", "").replace("```", "").strip()
            
            try:
                page_toc = json.loads(content)
                if page_toc:
                    # Convert keys to int and update map
                    for p, title in page_toc.items():
                        try:
                            toc_map[int(p)] = title
                        except:
                            pass
            except json.JSONDecodeError:
                pass # Qwen didn't output valid JSON
                
        except Exception as e:
            logger.error(f"Error scanning page {i+1} for TOC: {e}")
            
    if toc_map:
        logger.info(f"AI extracted {len(toc_map)} chapters: {toc_map}")
    else:
        logger.warning("AI could not find a Table of Contents.")
        
    return toc_map

def get_chapter_for_page(page_num: int, toc_map: Dict[int, str]) -> str:
    """Find the chapter for a given page number"""
    current_chapter = "Unknown"
    max_page = -1
    
    for start_page, title in toc_map.items():
        if start_page <= page_num and start_page > max_page:
            max_page = start_page
            current_chapter = title
            
    return current_chapter

def process_pdf(pdf_bytes: bytes) -> List[Dict]:
    """
    Process PDF with structure awareness AND OCR fallback.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    logger.info(f"Processing PDF with {len(doc)} pages")
    
    # 1. Extract TOC
    toc_map = extract_toc(doc)
    
    # 2. If Metadata TOC failed, try AI TOC
    if not toc_map:
        toc_map = extract_toc_with_qwen(doc)
        
    # 3. Fallback (Last Resort)
    # 3. Fallback (Last Resort)
    if not toc_map:
        # REMOVED hardcoded fallback to prevent hallucinations
        logger.warning("No TOC found. Proceeding without structure awareness.")

    chunks = []
    
    # --- SYNTHETIC TOC CHUNK ---
    # Create a perfect text chunk so the LLM knows the structure
    if toc_map:
        toc_text = "Table of Contents / Structure of this Document:\n"
        sorted_pages = sorted(toc_map.keys())
        for p in sorted_pages:
            toc_text += f"- Page {p}: {toc_map[p]}\n"
            
        chunks.append({
            "text": toc_text,
            "page": 1,
            "chapter": "Table of Contents",
            "section_type": "structure",
            "token_count": count_tokens(toc_text),
            "original_text": toc_text
        })
        logger.info("Added Synthetic TOC Chunk")
    # ---------------------------
    
    # Convert to images for OCR if needed (lazy loading would be better but keeping it simple)
    # We'll convert on demand to save memory
    
    for page_num, page in enumerate(doc):
        real_page_num = page_num + 1
        
        # Try text extraction
        text = page.get_text()
        # print(f"DEBUG: Page {real_page_num} text len: {len(text)}")
        
        # OCR Fallback
        if len(text.strip()) < 50:
            # print(f"DEBUG: Page {real_page_num} triggering OCR (Qwen3-VL)...")
            logger.info(f"Page {real_page_num} has little text ({len(text.strip())} chars). Attempting OCR with Qwen3-VL...")
            try:
                # Render page to image
                pix = page.get_pixmap(dpi=150)
                img_data = pix.tobytes("png")
                
                # Use Qwen3-VL-4B for OCR
                response = ollama.chat(
                    model='qwen3-vl:4b',
                    messages=[{
                        'role': 'user',
                        'content': 'Extract all text from this image. Use Markdown formatting for headers (e.g. # Chapter 1, ## Section). Output ONLY the text.',
                        'images': [img_data]
                    }],
                    options={'keep_alive': 0}  # Unload immediately to free RAM
                )
                text = response['message']['content']
                
                # print(f"DEBUG: Page {real_page_num} OCR result len: {len(text)}")
                logger.info(f"OCR extracted {len(text)} chars from Page {real_page_num}")
            except Exception as e:
                # print(f"DEBUG: Page {real_page_num} OCR failed: {e}")
                logger.error(f"OCR failed for Page {real_page_num}: {e}")
        
        # Determine Chapter
        chapter = get_chapter_for_page(real_page_num, toc_map)
        
        # Determine Section Type
        section_type = "content"
        lower_text = text.lower()
        if "exercise" in lower_text or "questions" in lower_text or "answer the following" in lower_text:
            section_type = "exercise"
            
        # Split into chunks
        page_chunks = split_text_by_tokens(text, CHUNK_SIZE, CHUNK_OVERLAP)
        
        for chunk_text in page_chunks:
            chunks.append({
                "text": chunk_text,
                "page": real_page_num,
                "chapter": chapter,
                "section_type": section_type,
                "token_count": count_tokens(chunk_text),
                "original_text": chunk_text
            })
            
    logger.info(f"Created {len(chunks)} structured chunks")
    return chunks

def split_text_by_tokens(text: str, chunk_size: int, overlap: int) -> List[str]:
    """Split text into chunks of max `chunk_size` tokens"""
    if not text:
        return []
        
    enc = tiktoken.get_encoding("cl100k_base")
    tokens = enc.encode(text)
    
    chunks = []
    start = 0
    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunk_tokens = tokens[start:end]
        chunk_text = enc.decode(chunk_tokens)
        chunks.append(chunk_text)
        
        if end == len(tokens):
            break
            
        start += (chunk_size - overlap)
        
    return chunks

def build_system_user_prompt(context_docs: List[Dict], question: str) -> Tuple[str, str]:
    """
    Build prompt with structure awareness and Teacher Persona.
    """
    system_prompt = """You are an expert and friendly teacher. 
Your goal is to help the student understand the concept using the provided educational material (Textbooks, Tutorials, Questions).

Guidelines:
1. **Be Teacher-like:** Don't just dump facts. Explain them simply. Use analogies if helpful.
2. **Context First:** Answer based ONLY on the provided excerpts.
3. **Structure Aware:** If asked about chapters, units, or the first topic, refer to the "Table of Contents" section if available.
4. **Cite Sources:** Always mention the Unit/Chapter and Page number (e.g., "As discussed in Unit 1, Page 5...").
5. **Encourage:** If the concept is hard, encourage the student.
6. **Honesty:** If the answer is not in the text, say "I couldn't find that specific topic in our material, but I can explain the general concept if you like."
"""
    
    context_str = ""
    current_chapter = None
    
    for doc in context_docs:
        chapter = doc.get("chapter", "Unknown Chapter")
        page = doc.get("page", "?")
        section = doc.get("section_type", "content")
        text = doc.get("text", "").strip()
        
        if chapter != current_chapter:
            context_str += f"\n\n--- CHAPTER: {chapter} ---\n"
            current_chapter = chapter
            
        type_label = "[EXERCISE]" if section == "exercise" else "[TEXT]"
        context_str += f"\n{type_label} (Page {page}):\n{text}\n"

    user_prompt = f"""Context from Textbook:
{context_str}

Student Question: {question}

Answer:"""

    return system_prompt, user_prompt
