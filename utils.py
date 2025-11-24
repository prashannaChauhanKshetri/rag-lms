# utils.py
import io
import logging
from typing import List, Dict, Tuple
from pypdf import PdfReader
from langchain.text_splitter import RecursiveCharacterTextSplitter

logger = logging.getLogger("rag-utils")

def process_pdf(content: bytes) -> List[Dict]:
    """
    Extract text from PDF bytes and split into chunks with metadata (page number).
    Returns a list of dicts: {"text": "...", "page": 1}
    """
    try:
        reader = PdfReader(io.BytesIO(content))
    except Exception as e:
        raise RuntimeError(f"PdfReader initialization failed: {e}")
    
    # Configure splitter: 1000 chars ~ 200-250 words, good for MiniLM
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        separators=["\n\n", "\n", ". ", " ", ""]
    )
    
    all_chunks = []
    
    for i, page in enumerate(reader.pages):
        try:
            page_text = page.extract_text()
            if not page_text:
                continue
                
            # Split this page's text
            page_chunks = splitter.split_text(page_text)
            
            # Create metadata for each chunk
            for chunk in page_chunks:
                all_chunks.append({
                    "text": chunk,
                    "page": i + 1  # 1-based page number
                })
                
        except Exception as e:
            logger.warning(f"Failed to extract page {i}: {e}")
            
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
