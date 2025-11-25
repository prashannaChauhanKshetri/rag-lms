import io
import logging
import re
from typing import List, Dict, Tuple, Optional
import fitz  # PyMuPDF
import tiktoken
import pytesseract
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
    if not toc_map:
        # Fallback for Grade 10 Science
        toc_map = {
            1: "Scientific Learning",
            15: "Classification of Living Beings",
            59: "Honey Bee",
            73: "Heredity",
            111: "Physiological Structure and Life Process",
            142: "Nature and Environment",
            167: "Motion and Force",
            197: "Pressure",
            224: "Heat",
            242: "Wave",
            302: "Electricity and Magnetism",
            328: "Universe",
            339: "Information and Communication Technology",
            363: "Classification of Elements",
            381: "Chemical Reaction",
            395: "Gases",
            415: "Metal and Not metals",
            426: "Hydrocarbon and its Compounds",
            442: "Chemicals used in Daily Life"
        }
        logger.info("Using fallback TOC mapping")

    chunks = []
    
    # Convert to images for OCR if needed (lazy loading would be better but keeping it simple)
    # We'll convert on demand to save memory
    
    for page_num, page in enumerate(doc):
        real_page_num = page_num + 1
        
        # Try text extraction
        text = page.get_text()
        print(f"DEBUG: Page {real_page_num} text len: {len(text)}")
        
        # OCR Fallback
        if len(text.strip()) < 50:
            print(f"DEBUG: Page {real_page_num} triggering OCR...")
            logger.info(f"Page {real_page_num} has little text ({len(text.strip())} chars). Attempting OCR...")
            try:
                # Render page to image
                pix = page.get_pixmap(dpi=300)
                img_data = pix.tobytes("png")
                image = Image.open(io.BytesIO(img_data))
                text = pytesseract.image_to_string(image)
                print(f"DEBUG: Page {real_page_num} OCR result len: {len(text)}")
                logger.info(f"OCR extracted {len(text)} chars from Page {real_page_num}")
            except Exception as e:
                print(f"DEBUG: Page {real_page_num} OCR failed: {e}")
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
    Build prompt with structure awareness.
    """
    system_prompt = """You are an intelligent educational assistant. 
Answer the student's question based ONLY on the provided textbook excerpts.
If the answer is not in the text, say "I cannot find the answer in the provided documents."
Cite the Chapter and Page number for every fact you mention.
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
