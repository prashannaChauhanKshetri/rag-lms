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
CHUNK_SIZE = 1000  # Tokens
CHUNK_OVERLAP = 100

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
    """Find the chapter/unit title that applies to `page_num` using `toc_map`.

    Behavior:
    - `toc_map` is expected as {start_page: title, ...} where keys may be int or str.
    - Returns the title for the largest `start_page` that is <= `page_num`.
    - Returns "Unknown" if `toc_map` is empty or no matching start_page is found.
    """
    if not toc_map:
        return "Unknown"

    current_chapter = "Unknown"
    max_page = -1

    for start_page, title in toc_map.items():
        try:
            sp = int(start_page)
        except Exception:
            # Skip malformed keys
            continue

        if sp <= page_num and sp > max_page:
            max_page = sp
            current_chapter = title

    return current_chapter

import pytesseract
from concurrent.futures import ThreadPoolExecutor

def extract_toc_with_docling(pdf_bytes: bytes) -> Dict[int, str]:
    """
    Use Docling to extract TOC from first 10 pages.
    Returns: Dict mapping page numbers to chapter/unit titles
    """
    try:
        from docling.document_converter import DocumentConverter
        
        logger.info("Extracting TOC with Docling (first 10 pages only)...")
        
        # Extract only first 10 pages to a temp PDF
        import tempfile
        import os
        
        # Open the full PDF and extract first 10 pages
        full_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages_to_extract = min(10, len(full_doc))
        
        # Create a new PDF with only first 10 pages
        small_doc = fitz.open()
        for i in range(pages_to_extract):
            small_doc.insert_pdf(full_doc, from_page=i, to_page=i)
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
            small_doc.save(tmp.name)
            tmp_path = tmp.name
        
        small_doc.close()
        full_doc.close()
        
        try:
            # Process only the small 10-page PDF
            converter = DocumentConverter()
            result = converter.convert(tmp_path)
            
            # Parse TOC from markdown output
            toc_map = {}
            md_content = result.document.export_to_markdown()
            
            # Look for table-formatted TOC (Docling outputs tables in markdown)
            # Pattern: | Unit | Topic | Page |
            lines = md_content.split('\n')
            in_toc_table = False
            
            for line in lines:
                # Detect TOC table header
                if '| Unit' in line or '| Topic' in line or '| Page' in line:
                    in_toc_table = True
                    continue
                
                # Skip separator line
                if in_toc_table and line.startswith('|--'):
                    continue
                    
                # Parse TOC rows
                if in_toc_table and line.startswith('|'):
                    parts = [p.strip() for p in line.split('|') if p.strip()]
                    if len(parts) >= 2:
                        try:
                            # Try to find page number (usually last column)
                            page_num = int(parts[-1])
                            # Title is usually middle columns
                            title = ' '.join(parts[:-1]).strip()
                            if title and page_num > 0:
                                toc_map[page_num] = title
                        except (ValueError, IndexError):
                            pass
                
                # End of table
                if in_toc_table and not line.startswith('|') and line.strip():
                    in_toc_table = False
            
            # Also look for ## headers as section markers
            current_page = 1
            for line in lines[:200]:  # Check first ~200 lines
                if line.startswith('## ') and not line.startswith('## ©'):
                    section_title = line[3:].strip()
                    if section_title and section_title not in ['Contents', 'Preface']:
                        if current_page not in toc_map:
                            toc_map[current_page] = section_title
            
            logger.info(f"Docling extracted {len(toc_map)} TOC entries")
            return toc_map
            
        finally:
            os.unlink(tmp_path)  # Clean up temp file
            
    except ImportError:
        logger.warning("Docling not installed. Falling back to PyMuPDF TOC.")
        return {}
    except Exception as e:
        logger.error(f"Docling TOC extraction failed: {e}")
        return {}

def process_pdf(pdf_bytes: bytes) -> List[Dict]:
    """
    HYBRID PDF Processor: Docling (TOC) + Tesseract (OCR)
    
    1. Docling extracts TOC from first 10 pages (~30s)
    2. Tesseract does fast parallel OCR for all pages (~60s)
    3. Chunks are tagged with chapter/unit from TOC
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    logger.info(f"Processing PDF with {len(doc)} pages")
    
    # STEP 1: Extract TOC with Docling (or fallback to PyMuPDF)
    toc_map = extract_toc(doc)  # Try PyMuPDF metadata first
    if not toc_map:
        toc_map = extract_toc_with_docling(pdf_bytes)  # Try Docling
    
    if toc_map:
        logger.info(f"TOC found with {len(toc_map)} chapters/units")
    else:
        logger.warning("No TOC found - chunks will not have chapter tags")
    
    # STEP 2: Fast text extraction + Parallel OCR
    chunks = []
    scan_pages = []  # Queue for OCR
    
    # FAST PASS: Check all pages for text first
    for i, page in enumerate(doc):
        real_page_num = i + 1
        text = page.get_text()
        
        if text.strip():
            # Has text layer - Process immediately (FAST PATH)
            chapter = get_chapter_for_page(real_page_num, toc_map)
            page_chunks = split_text_by_tokens(text, CHUNK_SIZE, CHUNK_OVERLAP)
            for chunk_text in page_chunks:
                chunks.append({
                    "text": chunk_text,
                    "page": real_page_num,
                    "chapter": chapter,
                    "section_type": "content",
                    "token_count": count_tokens(chunk_text),
                    "original_text": chunk_text
                })
        else:
            # Scanned - Queue for parallel OCR
            scan_pages.append((real_page_num, page))
    
    # PARALLEL OCR for scanned pages only
    if scan_pages:
        logger.info(f"Detected {len(scan_pages)} scanned pages. Starting Parallel Tesseract OCR...")
        
        def ocr_page(args):
            p_num, p_obj = args
            try:
                pix = p_obj.get_pixmap(dpi=150)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                text = pytesseract.image_to_string(img)
                return p_num, text
            except Exception as e:
                logger.error(f"OCR failed for Page {p_num}: {e}")
                return p_num, ""
        
        # 8 parallel workers (safe for 8-core Mac)
        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(ocr_page, scan_pages))
        
        # Process OCR results with chapter tagging
        for p_num, text in results:
            if not text.strip(): continue
            chapter = get_chapter_for_page(p_num, toc_map)
            page_chunks = split_text_by_tokens(text, CHUNK_SIZE, CHUNK_OVERLAP)
            for chunk_text in page_chunks:
                chunks.append({
                    "text": chunk_text,
                    "page": p_num,
                    "chapter": chapter,
                    "section_type": "content",
                    "token_count": count_tokens(chunk_text),
                    "original_text": chunk_text
                })
        
        logger.info(f"OCR Complete. Extracted text from {len(results)} pages.")
    
    # Sort by page number
    chunks.sort(key=lambda x: x['page'])
    logger.info(f"Created {len(chunks)} chunks from {len(doc)} pages")
    logger.info(f"Chapters detected: {set(c['chapter'] for c in chunks)}")
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
        # Ensure we don't get stuck if tokens are empty
        if len(tokens) == 0: break
        
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
    Build prompt with Teacher Persona.
    """
    system_prompt = """You are an expert and friendly teacher. 
Your goal is to help the student understand the concept using the provided educational material.

Guidelines:
1. **Be Teacher-like:** Explain simply. Use analogies.
2. **Context First:** Answer based ONLY on the provided excerpts.
3. **Cite Sources:** Mention the Page number if available (e.g., "On Page 5...").
4. **Honesty:** If the answer is not in the text, say so.
"""
    
    context_str = ""
    for doc in context_docs:
        page = doc.get("page", "?")
        text = doc.get("text", "").strip()
        context_str += f"\n[Page {page}]:\n{text}\n"

    user_prompt = f"""Context from Textbook:
{context_str}

Student Question: {question}

Answer:"""

    return system_prompt, user_prompt
