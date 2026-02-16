import io
import logging
import os
import re
import json
from typing import List, Dict, Tuple, Optional
import fitz  # PyMuPDF
import tiktoken
import pytesseract
from concurrent.futures import ThreadPoolExecutor
from pdf2image import convert_from_bytes
from PIL import Image

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rag-utils")

# Constants
CHUNK_SIZE = 600  # Smaller chunks for better granularity
CHUNK_OVERLAP = 100  # Moderate overlap for context continuity


def count_tokens(text: str) -> int:
    """Count tokens using tiktoken (cl100k_base)"""
    enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))


# =============================================================================
# TOC EXTRACTION — 3-tier fallback: PyMuPDF → Docling → Groq LLM
# =============================================================================

def extract_toc(doc: fitz.Document) -> Dict[int, str]:
    """
    Extract Table of Contents to map Page Number -> Chapter Name.
    Tier 1: PyMuPDF metadata TOC (fastest, most reliable when available)
    """
    toc_map = {}
    
    # Try metadata TOC first
    toc = doc.get_toc()
    if toc:
        logger.info(f"Found Metadata TOC with {len(toc)} entries")
        for level, title, page in toc:
            if title.strip():  # Skip empty titles
                toc_map[page] = title.strip()
        return toc_map
        
    return {}


def extract_toc_from_text(doc: fitz.Document) -> Dict[int, str]:
    """
    Tier 1.5: Parse TOC directly from page text using multiple regex patterns.
    Handles formats from various Nepali curriculum textbooks:
      - Science: numbered list (1 / Scientific Learning / 1)
      - Computer: three-line (Unit 1.1 / Title / Page)
      - English: multi-column table (unit_num / title / ... / page_num)
      - Maths: page-range (1 / Sets / 1 – 25)
      - Optional Math: two-line (Unit 1: Algebra / 1)
    """
    toc_map = {}
    
    pages_to_scan = min(10, len(doc))
    skip_words = {
        'contents', 'unit', 'topic', 'page', 's.n.', 'page no', 'sn',
        'title', 'reading', 'speaking', 'listening', 'grammar', 'writing',
        'project', 'work', 'project work', 'vocabulary', 'section one',
        'section two', 'section one: language development', 'section two: literature',
        'table of contents', 'preface'
    }
    
    for page_idx in range(pages_to_scan):
        text = doc[page_idx].get_text()
        if not text.strip():
            continue
        
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        
        text_lower = text.lower()
        is_toc_page = (
            'contents' in text_lower 
            or text_lower.count('unit') >= 3
            or text_lower.count('chapter') >= 3
            or text_lower.count('lesson') >= 3
        )
        
        if not is_toc_page:
            continue
        
        logger.info(f"Found potential TOC on page {page_idx + 1}")
        
        # ------- Pattern 1: Unit/Chapter label + Title + Page (3-line) -------
        i = 0
        while i < len(lines) - 1:
            line = lines[i]
            
            unit_match = re.match(
                r'^(Unit\s+\d+\.?\d*|Chapter\s+\d+|Lesson\s+\d+)\s*$',
                line, re.IGNORECASE
            )
            
            if unit_match and i + 2 < len(lines):
                unit_label = unit_match.group(1).strip()
                title = lines[i + 1].strip()
                page_str = lines[i + 2].strip()
                
                if title and not title[0].isdigit() and page_str.isdigit():
                    page_num = int(page_str)
                    if 1 <= page_num <= 999:
                        toc_map[page_num] = f"{unit_label}: {title}"
                        i += 3
                        continue
            
            # ------- Pattern 2: Unit+Title inline + Page -------
            unit_inline = re.match(
                r'^(Unit\s+\d+\.?\d*|Chapter\s+\d+)\s+(.+?)\s*$',
                line, re.IGNORECASE
            )
            if unit_inline and i + 1 < len(lines):
                unit_label = unit_inline.group(1).strip()
                title = unit_inline.group(2).strip()
                page_str = lines[i + 1].strip()
                
                if title and page_str.isdigit():
                    page_num = int(page_str)
                    if 1 <= page_num <= 999:
                        toc_map[page_num] = f"{unit_label}: {title}"
                        i += 2
                        continue
            
            # ------- Pattern 3: Inline "Title ... PageNum" -------
            inline_match = re.match(r'^(.+?)\s{2,}(\d{1,3})\s*$', line)
            if inline_match:
                title = inline_match.group(1).strip()
                page_num = int(inline_match.group(2))
                if title and 1 <= page_num <= 999 and len(title) > 3:
                    toc_map[page_num] = title
                    i += 1
                    continue
            
            # Skip header/column-label words
            if line.lower() in skip_words:
                i += 1
                continue
            
            # ------- Pattern 4: Numbered list (Science) -------
            # bare number + title + page_number
            if re.match(r'^\d{1,2}$', line) and i + 2 < len(lines):
                unit_num = line
                title_line = lines[i + 1].strip()
                page_str = lines[i + 2].strip()
                
                if (title_line 
                    and not re.match(r'^\d+$', title_line) 
                    and title_line.lower() not in skip_words
                    and page_str.isdigit()):
                    page_num = int(page_str)
                    if 1 <= page_num <= 999:
                        toc_map[page_num] = f"Unit {unit_num}: {title_line}"
                        i += 3
                        continue
                
                # ------- Pattern 5: Page-range format (Maths) -------
                # bare_number + title + "start – end" or "start-end"
                range_match = re.match(r'^(\d{1,3})\s*[–\-]\s*\d{1,3}$', page_str)
                if (title_line 
                    and not re.match(r'^\d+$', title_line)
                    and title_line.lower() not in skip_words
                    and range_match):
                    page_num = int(range_match.group(1))
                    if 1 <= page_num <= 999:
                        toc_map[page_num] = f"Chapter {unit_num}: {title_line}"
                        i += 3
                        continue
            
            i += 1
    
    # ------- Pattern 6: Multi-column table TOC (English textbooks) -------
    # These have: unit_num, title (possibly multi-word/multi-line), then lots of 
    # column data, then page_num just before the next unit_num.
    # Strategy: collect all lines from TOC pages, find sequences of 
    # (unit_number, title_text, ..., page_number)
    if not toc_map:
        toc_map = _parse_multicolumn_toc(doc, pages_to_scan, skip_words)
    
    if toc_map:
        logger.info(f"Text-based parser extracted {len(toc_map)} TOC entries")
    
    return toc_map


def _parse_multicolumn_toc(
    doc: fitz.Document, pages_to_scan: int, skip_words: set
) -> Dict[int, str]:
    """
    Parse multi-column table TOCs (common in English textbooks).
    The raw text pattern is:
        unit_num (1) → title lines → page_num (1) → unit_num (2) → title → page_num (13) → ...
    Strategy: first collect all bare numbers, then pair them as (unit, page) based on sequence.
    """
    # Collect all lines from TOC pages (including continuation pages)
    all_lines = []
    prev_was_toc = False
    for page_idx in range(pages_to_scan):
        text = doc[page_idx].get_text()
        text_lower = text.lower()
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        
        is_toc_page = 'contents' in text_lower or text_lower.count('unit') >= 2
        
        # Also include continuation pages: right after a TOC page,
        # with lots of bare numbers (table structure)
        if not is_toc_page and prev_was_toc:
            bare_nums = sum(1 for l in lines if re.match(r'^\d{1,3}$', l))
            if bare_nums >= 3:
                is_toc_page = True
        
        if is_toc_page:
            all_lines.extend(lines)
            prev_was_toc = True
        else:
            prev_was_toc = False
    
    if not all_lines:
        return {}
    
    # Find all bare number positions and the text between them
    num_positions = []  # [(index, value)]
    for i, line in enumerate(all_lines):
        if re.match(r'^\d{1,3}$', line) and line.lower() not in skip_words:
            num_positions.append((i, int(line)))
    
    if len(num_positions) < 2:
        return {}
    
    # Identify unit↔page pairs:
    # Unit numbers are sequential (1, 2, 3...) and smaller
    # Page numbers are larger and appear between unit numbers
    # Pattern: unit_1, page_1, unit_2, page_2, ...
    
    entries = []  # (unit_num, title, page_num)
    
    # Find the starting unit (usually 1)
    ni = 0
    while ni < len(num_positions) and num_positions[ni][1] != 1:
        ni += 1
    
    if ni >= len(num_positions):
        return {}
    
    expected_unit = 1
    while ni < len(num_positions):
        idx, val = num_positions[ni]
        
        if val != expected_unit:
            ni += 1
            continue
        
        # Found unit number - collect title lines until next bare number
        # Limit to first ~5 words (title column in multi-column tables is short)
        title_parts = []
        title_word_count = 0
        for j in range(idx + 1, len(all_lines)):
            line = all_lines[j].strip()
            if re.match(r'^\d{1,3}$', line):
                break
            if line.lower() not in skip_words and len(line) >= 2:
                title_parts.append(line)
                title_word_count += len(line.split())
         # Limit to first ~3 words (title column is short: "Travel and holidays")
                if title_word_count >= 3:
                    break
        
        title = ' '.join(title_parts) if title_parts else None
        
        # Find the page number: next bare number after title that is NOT the next unit
        page_num = None
        for nj in range(ni + 1, len(num_positions)):
            candidate_num = num_positions[nj][1]
            if candidate_num == expected_unit + 1:
                # This is the next unit, so the page_num was the one before this
                break
            # Could be page number (must be >= 1)
            if candidate_num >= 1:
                page_num = candidate_num
        
        if title and page_num is not None:
            entries.append((expected_unit, f"Unit {expected_unit}: {title}", page_num))
        
        expected_unit += 1
        ni += 1
    
    # Build toc_map
    toc_map = {}
    for unit_num, title, page_num in entries:
        toc_map[page_num] = title
    
    return toc_map


def extract_toc_from_chapter_pages(
    doc: fitz.Document, meta_toc: Dict[int, str]
) -> Dict[int, str]:
    """
    Tier 1.75: When we have page numbers from PyMuPDF meta TOC but titles are
    just numbers/gibberish, scan the actual chapter start pages to find
    'Unit N' or 'Chapter N' headers with titles.
    
    Handles English textbooks where the format is:
        Unit  N
        Getting started  (skip this)
        <some content>
        Actual Topic Title
    """
    if not meta_toc:
        return {}
    
    # Common section headers to skip (not unit titles)
    section_headers = {
        'getting started', 'reading i', 'reading ii', 'reading',
        'look at the picture', 'before you read', 'answer',
        'discuss', 'listening', 'speaking', 'writing', 'grammar',
        'project work', 'vocabulary'
    }
    
    toc_map = {}
    for page_num in sorted(meta_toc.keys()):
        if page_num < 1 or page_num > len(doc):
            continue
        
        # Search the target page and also the next page (sometimes offset by 1)
        pages_to_check = [page_num - 1]
        if page_num < len(doc):
            pages_to_check.append(page_num)
        
        found = False
        for pg_idx in pages_to_check:
            page_text = doc[pg_idx].get_text()
            lines = [l.strip() for l in page_text.split('\n') if l.strip()]
            
            for idx, line in enumerate(lines):
                # Match "Unit N", "Unit  N", "Chapter N", "Lesson N"
                match = re.match(
                    r'^(Unit\s+\d+\.?\d*|Chapter\s+\d+|Lesson\s+\d+)\s*$',
                    line, re.IGNORECASE
                )
                if not match:
                    # Also match split format: "Unit" on one line, number on next
                    if re.match(r'^(Unit|Chapter|Lesson)$', line, re.IGNORECASE) and idx + 1 < len(lines):
                        next_l = lines[idx + 1].strip()
                        if re.match(r'^\d+\.?\d*$', next_l):
                            match = True
                            label = f"{line} {next_l}"
                            search_start = idx + 2
                        else:
                            continue
                    else:
                        continue
                
                if match is True:
                    pass  # label and search_start already set
                else:
                    label = match.group(1).strip()
                    search_start = idx + 1
                
                # Now search for the actual title (skip section headers)
                for j in range(search_start, min(search_start + 10, len(lines))):
                    candidate = lines[j].strip()
                    # Skip: numbers, short lines, section headers
                    if not candidate or len(candidate) < 3:
                        continue
                    if re.match(r'^\d+$', candidate):
                        continue
                    if candidate.lower() in section_headers:
                        continue
                    if any(candidate.lower().startswith(sh) for sh in section_headers):
                        continue
                    # Skip lines that are clearly content (questions, etc.)
                    if candidate.lower().startswith(('a.', 'b.', 'c.', 'look at', 'what do', 'how do', 'answer')):
                        continue
                    # This is likely the unit title
                    toc_map[page_num] = f"{label}: {candidate}"
                    found = True
                    break
                
                if found:
                    break
            if found:
                break
    
    if toc_map:
        logger.info(f"Chapter-page scanner found {len(toc_map)} entries with titles")
    
    return toc_map


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
            continue

        if sp <= page_num and sp > max_page:
            max_page = sp
            current_chapter = title

    return current_chapter


def extract_toc_with_docling(pdf_bytes: bytes) -> Dict[int, str]:
    """
    Tier 2: Use Docling to extract TOC from first 10 pages.
    Improved: Handles multiple table formats, header patterns, and nested structures.
    Returns: Dict mapping page numbers to chapter/unit titles
    """
    try:
        from docling.document_converter import DocumentConverter
        
        logger.info("Extracting TOC with Docling (first 10 pages only)...")
        
        import tempfile
        
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
            
            lines = md_content.split('\n')
            in_toc_table = False
            
            for line in lines:
                # Detect TOC table header (flexible matching)
                lower_line = line.lower()
                if any(keyword in lower_line for keyword in [
                    '| unit', '| topic', '| page', '| chapter', '| lesson',
                    '| content', '| title', '| s.n', '| sn'
                ]):
                    in_toc_table = True
                    continue
                
                # Skip separator line
                if in_toc_table and (line.startswith('|--') or line.startswith('| --')):
                    continue
                    
                # Parse TOC rows
                if in_toc_table and line.startswith('|'):
                    parts = [p.strip() for p in line.split('|') if p.strip()]
                    if len(parts) >= 2:
                        try:
                            # Try to find page number (usually last column or a numeric column)
                            page_num = None
                            title_parts = []
                            
                            for part in parts:
                                # Check if this part is a page number
                                clean = re.sub(r'[^\d]', '', part)
                                if clean and clean.isdigit() and 1 <= int(clean) <= 999:
                                    if page_num is None:  # Take first valid page number
                                        page_num = int(clean)
                                else:
                                    # Skip pure numbers that are S.N. columns
                                    if not (part.isdigit() and int(part) < 30):
                                        title_parts.append(part)
                            
                            if page_num and title_parts:
                                title = ' - '.join(title_parts).strip()
                                # Clean up title
                                title = re.sub(r'\s+', ' ', title)
                                if title and len(title) > 2:
                                    toc_map[page_num] = title
                        except (ValueError, IndexError):
                            pass
                
                # End of table
                if in_toc_table and not line.startswith('|') and line.strip():
                    in_toc_table = False
            
            # Also look for ## headers as section markers (improved)
            for line in lines[:200]:
                if line.startswith('## ') and not line.startswith('## ©'):
                    section_title = line[3:].strip()
                    if section_title and section_title not in ['Contents', 'Preface', 'Table of Contents']:
                        # Don't overwrite TOC entries from table parsing
                        pass
            
            logger.info(f"Docling extracted {len(toc_map)} TOC entries")
            return toc_map
            
        finally:
            os.unlink(tmp_path)  # Clean up temp file
            
    except ImportError:
        logger.warning("Docling not installed. Falling back to Groq TOC extraction.")
        return {}
    except Exception as e:
        logger.error(f"Docling TOC extraction failed: {e}")
        return {}


def extract_toc_with_groq(pdf_bytes: bytes) -> Dict[int, str]:
    """
    Tier 3: Use Groq LLM to extract TOC from first 5 pages via OCR text.
    Handles non-standard textbook layouts that Docling can't parse.
    Returns: Dict mapping page numbers to chapter/unit titles
    """
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        logger.warning("GROQ_API_KEY not set. Cannot use Groq TOC extraction.")
        return {}
    
    try:
        logger.info("Extracting TOC with Groq LLM (first 5 pages)...")
        
        # Extract text from first 5 pages
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages_to_check = min(10, len(doc))
        
        first_pages_text = ""
        for i in range(pages_to_check):
            page = doc[i]
            text = page.get_text()
            if text.strip():
                first_pages_text += f"\n--- PAGE {i+1} ---\n{text}"
            else:
                # OCR fallback for scanned pages
                try:
                    pix = page.get_pixmap(dpi=200)
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    text = pytesseract.image_to_string(img)
                    if text.strip():
                        first_pages_text += f"\n--- PAGE {i+1} ---\n{text}"
                except Exception:
                    pass
        
        doc.close()
        
        if not first_pages_text.strip():
            logger.warning("No text found in first 5 pages for Groq TOC extraction")
            return {}
        
        # Truncate to avoid token limits
        if len(first_pages_text) > 8000:
            first_pages_text = first_pages_text[:8000]
        
        # Call Groq LLM
        from groq import Groq
        client = Groq(api_key=groq_api_key)
        
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": """You are a TOC extraction expert. Extract the Table of Contents from the given textbook pages.
Return ONLY valid JSON in this exact format (no markdown, no explanation):
{"toc": [{"page": <page_number>, "title": "<chapter/unit title>"}]}

Rules:
- Include ALL chapters, units, lessons, and major sections
- Use the ACTUAL page numbers shown in the TOC, not the PDF page numbers
- If no TOC is found, return {"toc": []}
- Clean up titles (remove extra whitespace, numbering artifacts)"""
                },
                {
                    "role": "user",
                    "content": f"Extract the Table of Contents from these textbook pages:\n\n{first_pages_text}"
                }
            ],
            temperature=0.1,
            max_tokens=2048
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # Parse JSON response
        # Handle potential markdown code blocks in response
        if result_text.startswith("```"):
            result_text = re.sub(r'^```\w*\n?', '', result_text)
            result_text = re.sub(r'\n?```$', '', result_text)
        
        toc_data = json.loads(result_text)
        toc_entries = toc_data.get("toc", [])
        
        toc_map = {}
        for entry in toc_entries:
            page = entry.get("page")
            title = entry.get("title", "").strip()
            if page and title:
                try:
                    toc_map[int(page)] = title
                except (ValueError, TypeError):
                    pass
        
        logger.info(f"Groq LLM extracted {len(toc_map)} TOC entries")
        return toc_map
        
    except Exception as e:
        logger.error(f"Groq TOC extraction failed: {e}")
        return {}


# =============================================================================
# PDF PROCESSING — Hybrid: Docling (TOC) + Tesseract (OCR)
# =============================================================================

def process_pdf(pdf_bytes: bytes) -> List[Dict]:
    """
    HYBRID PDF Processor with improved chunking and TOC support.
    
    Pipeline:
    1. TOC extraction: PyMuPDF metadata → Docling → Groq LLM (3-tier fallback)
    2. Text extraction: PyMuPDF text layer → Tesseract OCR (parallel)
    3. Cross-page chunking: Concatenate all text, then chunk with sliding window
    4. TOC summary chunk: Dedicated searchable chunk with all chapters/units
    5. Chapter tagging: Each chunk tagged with its chapter from TOC
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    logger.info(f"Processing PDF with {len(doc)} pages")
    
    # ─── STEP 1: Extract TOC (multi-tier with quality check) ───
    toc_map = extract_toc(doc)  # Tier 1: PyMuPDF metadata
    
    # Quality check: PyMuPDF may return messy internal bookmark names
    # (e.g. "Unit-1, algebra final correction") or pure numbers ("0","1","2")
    def assess_toc_quality(toc):
        if len(toc) < 5:
            return "low"
        # Check for pure-number titles (e.g. "0", "1", "2")
        numeric_count = sum(1 for t in toc.values() if re.match(r'^\d+$', t.strip()))
        if numeric_count > len(toc) * 0.5:
            return "low"
        # Check for messy bookmark artifacts
        noise_words = ['edited', 'correction', 'repaired', 'final', 'corrected', 'copy']
        noisy_count = sum(1 for t in toc.values() 
                         if any(nw in t.lower() for nw in noise_words))
        if noisy_count > len(toc) * 0.3:
            return "low"
        return "good"
    
    toc_quality = assess_toc_quality(toc_map)
    
    # Always try text parser if PyMuPDF quality is low
    if toc_quality == "low":
        logger.info(f"PyMuPDF TOC quality is low ({len(toc_map)} entries). Trying text parser...")
        text_toc = extract_toc_from_text(doc)  # Tier 1.5: Text-based regex parser
        if len(text_toc) > 0 and assess_toc_quality(text_toc) != "low":
            toc_map = text_toc
            toc_quality = "good"
        elif len(text_toc) > len(toc_map):
            toc_map = text_toc
            toc_quality = assess_toc_quality(toc_map)
    
    # Tier 1.75: If we have page numbers from meta but bad titles, scan those pages
    if toc_quality == "low" and toc_map:
        logger.info(f"Trying chapter-page scanner on {len(toc_map)} known page numbers...")
        page_toc = extract_toc_from_chapter_pages(doc, toc_map)
        # Accept if at least 5 titled entries found (quality over quantity)
        if len(page_toc) >= 5:
            toc_map = page_toc
            toc_quality = assess_toc_quality(toc_map)
    
    if toc_quality == "low":
        logger.info(f"Text parser found {len(toc_map)} entries. Trying Docling...")
        docling_toc = extract_toc_with_docling(pdf_bytes)  # Tier 2: Docling
        if len(docling_toc) > len(toc_map):
            toc_map = docling_toc
            toc_quality = assess_toc_quality(toc_map)
    
    if toc_quality == "low":
        logger.info(f"TOC still has only {len(toc_map)} entries. Trying Groq LLM...")
        groq_toc = extract_toc_with_groq(pdf_bytes)  # Tier 3: Groq LLM
        if len(groq_toc) > len(toc_map):
            toc_map = groq_toc
    
    if toc_map:
        logger.info(f"Final TOC with {len(toc_map)} chapters/units: {list(toc_map.values())[:8]}...")
    else:
        logger.warning("No TOC found via any extraction method — chunks will not have chapter tags")
    
    # ─── STEP 2: Extract text from all pages ───
    page_texts = {}  # {page_num: text}
    scan_pages = []  # Queue for OCR
    
    for i, page in enumerate(doc):
        real_page_num = i + 1
        text = page.get_text()
        
        if text.strip():
            page_texts[real_page_num] = text
        else:
            scan_pages.append((real_page_num, page))
    
    # Parallel OCR for scanned pages
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
        
        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(ocr_page, scan_pages))
        
        for p_num, text in results:
            if text.strip():
                page_texts[p_num] = text
        
        logger.info(f"OCR Complete. Extracted text from {len(results)} pages.")
    
    # ─── STEP 3: Cross-page chunking with chapter awareness ───
    chunks = []
    
    # Build ordered list of (page_num, text) sorted by page
    ordered_pages = sorted(page_texts.items())
    
    # Group pages by chapter for chapter-aware chunking
    chapter_groups = {}  # {chapter_name: [(page_num, text), ...]}
    for page_num, text in ordered_pages:
        chapter = get_chapter_for_page(page_num, toc_map)
        if chapter not in chapter_groups:
            chapter_groups[chapter] = []
        chapter_groups[chapter].append((page_num, text))
    
    # Chunk within each chapter group (preserves chapter boundaries)
    for chapter, pages in chapter_groups.items():
        # Concatenate all page texts in this chapter
        combined_text = ""
        page_boundaries = []  # Track where each page's text starts
        
        for page_num, text in pages:
            page_boundaries.append({
                "page": page_num,
                "start_char": len(combined_text),
                "end_char": len(combined_text) + len(text)
            })
            combined_text += text + "\n\n"
        
        if not combined_text.strip():
            continue
        
        # Split the combined chapter text into chunks
        chapter_chunks = split_text_by_tokens(combined_text, CHUNK_SIZE, CHUNK_OVERLAP)
        
        # Map each chunk back to its source page(s)
        char_pos = 0
        for chunk_text in chapter_chunks:
            if not chunk_text.strip():
                continue
            
            # Find which page this chunk primarily belongs to
            chunk_start = combined_text.find(chunk_text[:100])  # Find by first 100 chars
            if chunk_start == -1:
                chunk_start = char_pos
            
            primary_page = pages[0][0]  # Default to first page of chapter
            for boundary in page_boundaries:
                if boundary["start_char"] <= chunk_start < boundary["end_char"]:
                    primary_page = boundary["page"]
                    break
            
            chunks.append({
                "text": chunk_text,
                "page": primary_page,
                "chapter": chapter,
                "section_type": "content",
                "token_count": count_tokens(chunk_text),
                "original_text": chunk_text
            })
            char_pos = chunk_start + len(chunk_text)
    
    # Sort by page number
    chunks.sort(key=lambda x: x['page'])
    
    # Filter and merge small chunks
    chunks = filter_and_merge_small_chunks(chunks, min_size=100)
    
    # ─── STEP 4: Create dedicated TOC summary chunk ───
    if toc_map:
        toc_text = "Table of Contents — Chapters and Units in this textbook:\n\n"
        for page_num, title in sorted(toc_map.items()):
            toc_text += f"• {title} (starts on Page {page_num})\n"
        toc_text += f"\nTotal: {len(toc_map)} chapters/units"
        
        toc_chunk = {
            "text": toc_text,
            "page": 1,
            "chapter": "Table of Contents",
            "section_type": "toc",
            "token_count": count_tokens(toc_text),
            "original_text": toc_text
        }
        chunks.insert(0, toc_chunk)  # Put TOC first
        logger.info(f"Created dedicated TOC chunk with {len(toc_map)} entries")
    
    logger.info(f"Final chunk count: {len(chunks)}")
    logger.info(f"Chapters detected: {set(c['chapter'] for c in chunks)}")
    return chunks


def filter_and_merge_small_chunks(chunks: List[Dict], min_size: int = 100) -> List[Dict]:
    """
    Remove tiny chunks and merge small adjacent chunks.
    Improved: Merges across adjacent pages within same chapter.
    """
    filtered = []
    i = 0
    
    while i < len(chunks):
        current = chunks[i]
        
        # Skip tiny administrative chunks (headers/footers from early pages)
        if current['token_count'] < 50 and current['page'] < 5:
            i += 1
            continue
        
        # Try to merge small chunks from same chapter
        if current['token_count'] < min_size and i + 1 < len(chunks):
            next_chunk = chunks[i + 1]
            
            # Merge if same chapter (even if different pages)
            if next_chunk['chapter'] == current['chapter']:
                merged_tokens = current['token_count'] + next_chunk['token_count']
                
                # Only merge if combined size is reasonable
                if merged_tokens <= CHUNK_SIZE:
                    merged = {
                        'text': current['text'] + "\n\n" + next_chunk['text'],
                        'page': current['page'],  # Keep first page reference
                        'chapter': current['chapter'],
                        'section_type': 'content',
                        'token_count': merged_tokens,
                        'original_text': current['original_text'] + "\n\n" + next_chunk['original_text']
                    }
                    filtered.append(merged)
                    i += 2  # Skip both chunks
                    continue
        
        # Keep normal chunks as-is
        filtered.append(current)
        i += 1
    
    return filtered


def split_text_by_tokens(text: str, chunk_size: int, overlap: int) -> List[str]:
    """Split text into chunks of max `chunk_size` tokens with overlap"""
    if not text:
        return []
        
    enc = tiktoken.get_encoding("cl100k_base")
    tokens = enc.encode(text)
    
    if len(tokens) == 0:
        return []
    
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


# =============================================================================
# PROMPT BUILDING — Teacher persona with chapter context
# =============================================================================

def build_system_user_prompt(context_docs: List[Dict], question: str) -> Tuple[str, str]:
    """
    Build prompt with Teacher Persona.
    Improved: Includes chapter metadata and handles structural queries.
    """
    
    # Detect structural query type
    is_structural = any(k in question.lower() for k in [
        "chapter", "unit", "table of contents", "toc", "topics",
        "syllabus", "index", "what are the", "list all", "how many units",
        "how many chapters"
    ])
    
    system_prompt = """You are an expert and friendly teacher. 
Your goal is to help the student understand the concept using the provided educational material.

Guidelines:
1. **Be Teacher-like:** Explain simply. Use analogies when helpful.
2. **Context First:** Answer based ONLY on the provided excerpts.
3. **Cite Sources:** Mention the chapter and page number if available (e.g., "In Unit 1: Number System, Page 5...").
4. **Honesty:** If the answer is not in the text, say so clearly.
5. **Structural Questions:** If the student asks about chapters, units, or the table of contents, list ALL chapters/units found in the provided excerpts with their page numbers in a clear, numbered format.
6. **Be Comprehensive:** When listing items (chapters, topics, etc.), include ALL items from the context — do not summarize or skip any.
"""
    
    if is_structural:
        system_prompt += """
IMPORTANT: The student is asking a structural question about the book's organization.
List ALL chapters/units/topics with page numbers in a clear numbered list format.
Do NOT say "chapters are not explicitly listed" if there is a Table of Contents excerpt in the context.
"""
    
    context_str = ""
    for doc in context_docs:
        page = doc.get("page", "?")
        text = doc.get("text", "").strip()
        chapter = doc.get("chapter", "")
        
        # Build header with chapter info
        if chapter and chapter not in ["Unknown", ""]:
            header = f"[Chapter: {chapter} | Page {page}]"
        else:
            header = f"[Page {page}]"
        
        context_str += f"\n{header}:\n{text}\n"

    user_prompt = f"""Context from Textbook:
{context_str}

Student Question: {question}

Answer:"""

    return system_prompt, user_prompt
