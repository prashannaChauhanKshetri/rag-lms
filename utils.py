# utils.py
import io
import logging
from typing import List, Dict, Tuple
from pypdf import PdfReader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from multiprocessing import Pool, cpu_count
import pytesseract
from pdf2image import convert_from_bytes
from PIL import Image

logger = logging.getLogger("rag-utils")

def extract_text_with_ocr(page_image: Image.Image) -> str:
    """Extract text from image using Tesseract OCR"""
    try:
        text = pytesseract.image_to_string(page_image, lang='eng')
        return text
    except Exception as e:
        logger.error(f"OCR error: {e}")
        return ""

def process_single_page(args: tuple) -> Dict:
    """Process a single page (for multiprocessing)"""
    page_num, page_content, use_ocr, pdf_bytes = args
    
    if not use_ocr:
        # Direct text extraction
        return {"text": page_content, "page": page_num}
    else:
        # OCR path: convert PDF page to image and OCR it
        try:
            images = convert_from_bytes(
                pdf_bytes,
                first_page=page_num,
                last_page=page_num,
                dpi=200  # Balance between quality and speed
            )
            if images:
                text = extract_text_with_ocr(images[0])
                return {"text": text, "page": page_num}
        except Exception as e:
            logger.error(f"OCR failed for page {page_num}: {e}")
        return {"text": "", "page": page_num}

def process_pdf(content: bytes) -> List[Dict]:
    """
    Extract text from PDF bytes with OCR fallback.
    Uses parallel processing for OCR pages.
    Returns a list of dicts: {"text": "...", "page": 1}
    """
    try:
        reader = PdfReader(io.BytesIO(content))
    except Exception as e:
        raise RuntimeError(f"PdfReader initialization failed: {e}")
    
    total_pages = len(reader.pages)
    logger.info(f"Processing {total_pages} pages")
    
    # First pass: identify which pages need OCR
    pages_needing_ocr = []
    text_pages = []
    
    for i, page in enumerate(reader.pages):
        page_num = i + 1
        try:
            page_text = page.extract_text() or ""
            
            # If page has< 50 chars, it likely needs OCR
            if len(page_text.strip()) < 50:
                pages_needing_ocr.append((page_num, page_text, True, content))
            else:
                text_pages.append({"text": page_text, "page": page_num})
                
        except Exception as e:
            logger.warning(f"Failed to extract page {page_num}: {e}")
            pages_needing_ocr.append((page_num, "", True, content))
    
    logger.info(f"Text extraction: {len(text_pages)} pages, OCR needed: {len(pages_needing_ocr)} pages")
    
    # Second pass: parallel OCR for scanned pages
    ocr_results = []
    if pages_needing_ocr:
        num_processes = min(4, cpu_count())  # Use 4 cores max
        logger.info(f"Starting parallel OCR with {num_processes} processes...")
        
        with Pool(processes=num_processes) as pool:
            ocr_results = pool.map(process_single_page, pages_needing_ocr)
    
    # Combine all pages and sort by page number
    all_pages = text_pages + ocr_results
    all_pages.sort(key=lambda x: x["page"])
    
    # Filter out empty pages
    all_pages = [p for p in all_pages if len(p["text"].strip()) > 0]
    
    # Configure splitter: 1000 chars ~ 200-250 words
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        separators=["\n\n", "\n", ". ", " ", ""]
    )
    
    all_chunks = []
    
    for page_data in all_pages:
        page_num = page_data["page"]
        page_text = page_data["text"]
        
        # Split this page's text
        page_chunks = splitter.split_text(page_text)
        
        # Create metadata for each chunk
        for chunk in page_chunks:
            all_chunks.append({
                "text": chunk,
                "page": page_num
            })
    
    logger.info(f"Created {len(all_chunks)} total chunks")
    return all_chunks

def build_system_user_prompt(context_docs: List[Dict], question: str) -> Tuple[str, str]:
    system_prompt = (
        "You are an expert educational AI tutor. Use ONLY the provided textbook excerpts to answer the student's question. "
        "If the answer is not in the excerpts, say 'I cannot find this information in the provided text.' "
        "ALWAYS cite the page number for every fact you mention, e.g. (Page 12). "
        "Explain concepts clearly and simply, suitable for a student."
    )
    
    context_blocks = []
    for d in context_docs:
        src = d.get("source", "unknown")
        page = d.get("page", "?")
        txt = d.get("text", "")
        
        # Format: [Source: book.pdf | Page: 12]
        header = f"[Source: {src} | Page: {page}]"
        context_blocks.append(f"{header}\n{txt}")
        
    context_text = "\n\n---\n\n".join(context_blocks)
    
    user_prompt = (
        f"Textbook Excerpts:\n{context_text}\n\n"
        f"Student Question: {question}\n\n"
        "Answer with page citations:"
    )
    
    return system_prompt, user_prompt
