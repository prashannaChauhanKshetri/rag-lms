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
CHUNK_SIZE = 600       # Moderate chunks — balanced for retrieval precision
CHUNK_OVERLAP = 120    # Overlap preserves cross-boundary context
MAX_ATOMIC_TOKENS = 1200  # Max size for "keep intact" sections (code, glossary)


def count_tokens(text: str) -> int:
    """Count tokens using tiktoken (cl100k_base)"""
    enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))


# =============================================================================
# FORMULA RECONSTRUCTION — Fix fractions mangled by PDF text extraction
# =============================================================================

# Tokens that can be part of a math expression (numerator or denominator)
_MATH_EXPR = re.compile(
    r'^[\w\s\d\.\+\-\*×÷±²³√∆∑∫πθαβγδϕψλ°∠∩∪⊂⊃≤≥≠≈'
    r'(){}sincostandlogcoseccotseclnexp,]+$',
    re.UNICODE
)


def reconstruct_fractions(text: str) -> str:
    """
    Reconstruct fractions that PyMuPDF splits across lines.

    PyMuPDF extracts PDF fractions as:
        AB          →  AB/AC
        AC

        sinθ = p    →  sinθ = p/h
        h

        6           →  6/10
        10

    Strategy: when a short math-like line is followed by another short
    math-like line (and no blank line between), combine them with '/'.
    """
    lines = text.split('\n')
    result = []
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Skip empty lines
        if not stripped:
            result.append(line)
            i += 1
            continue

        # Check if this line + next line form a fraction pattern
        if i + 1 < len(lines):
            next_stripped = lines[i + 1].strip()

            if (next_stripped
                and _is_fraction_pair(stripped, next_stripped)):
                # Combine as fraction
                # Handle "sinθ = p" / "h" → "sinθ = p/h"
                # Handle "AB" / "AC" → "AB/AC"
                # Handle "p" / "h  =" → "p/h  ="
                if '=' in stripped and '=' not in next_stripped:
                    # "expr = num" / "denom" → "expr = num/denom"
                    eq_pos = stripped.rfind('=')
                    before_eq = stripped[:eq_pos + 1].strip()
                    numerator = stripped[eq_pos + 1:].strip()
                    # Check if next line has trailing content
                    parts = re.split(r'(\s{2,})', next_stripped, maxsplit=1)
                    denominator = parts[0].strip()
                    trailing = ''.join(parts[1:]).strip() if len(parts) > 1 else ''
                    combined = f"{before_eq} {numerator}/{denominator}"
                    if trailing:
                        combined += f" {trailing}"
                    result.append(combined)
                elif '=' in next_stripped and '=' not in stripped:
                    # "num" / "denom = rest" → "num/denom = rest"
                    parts = re.split(r'\s*=\s*', next_stripped, maxsplit=1)
                    denominator = parts[0].strip()
                    rest = parts[1].strip() if len(parts) > 1 else ''
                    combined = f"{stripped}/{denominator}"
                    if rest:
                        combined += f" = {rest}"
                    result.append(combined)
                else:
                    # Simple fraction: "num" / "denom"
                    result.append(f"{stripped}/{next_stripped}")
                i += 2
                continue

        result.append(line)
        i += 1

    return '\n'.join(result)


def _is_fraction_pair(top: str, bottom: str) -> bool:
    """
    Check if two adjacent lines likely form a fraction.

    Criteria:
    - Both lines are short (< 30 chars each for the math part)
    - At least one is very short (< 10 chars) — typical for single variables
    - Both contain math-like content (numbers, variables, operators)
    - Neither looks like a list item, heading, or prose
    """
    # Extract just the math part (before/after = signs)
    top_math = top.split('=')[-1].strip() if '=' in top else top
    bottom_math = bottom.split('=')[0].strip() if '=' in bottom else bottom

    # Length check: at least one part must be very short
    if len(top_math) > 25 or len(bottom_math) > 25:
        return False
    if len(top_math) > 10 and len(bottom_math) > 10:
        return False

    # Both must look like math expressions
    if not _MATH_EXPR.match(top_math) or not _MATH_EXPR.match(bottom_math):
        return False

    # Reject: list items (a., b., 1., 2.), headings, prose
    if re.match(r'^[a-z]\.\s|^\d+\.\s|^[A-Z][a-z]{5,}', top):
        return False
    if re.match(r'^[a-z]\.\s|^\d+\.\s|^[A-Z][a-z]{5,}', bottom):
        return False

    # Reject: if both are multi-word prose (> 3 words each)
    if len(top.split()) > 3 and len(bottom.split()) > 3:
        return False

    # Reject: single Greek/math symbol over a capitalized word (table, not fraction)
    # e.g. "α" / "Alpha", "θ" / "theta", "π" / "pi"
    if len(top_math) <= 2 and re.match(r'^[A-Z][a-z]+$', bottom_math):
        return False
    if len(bottom_math) <= 2 and re.match(r'^[A-Z][a-z]+$', top_math):
        return False

    # Reject: page numbers (bare 1-3 digit numbers that look like page nums)
    if re.match(r'^\d{1,3}$', top) and re.match(r'^\d{1,3}$', bottom):
        # Could be a fraction like 6/10, or page numbers
        # Allow if both are small numbers (likely fraction)
        if int(top) <= 100 and int(bottom) <= 100:
            return True
        return False

    return True


# =============================================================================
# SECTION DETECTION — Identify structural boundaries in textbook pages
# =============================================================================

# Regex patterns for detecting section boundaries across all book formats
_SECTION_PATTERNS = {
    # ── Exercises (must be checked FIRST — they contain sub-patterns) ──
    'exercise': re.compile(
        r'^\s*(?:Exercises?|Exercise\s+\d|अभ्यास)\s*$',
        re.IGNORECASE | re.MULTILINE
    ),
    'exercise_qa': re.compile(
        r'^\s*\d+\.\s*(?:Answer the following|Write (?:short|long) (?:notes?|answers?)|'
        r'Give (?:reasons?|appropriate)|Explain|Differentiate|Define|Describe|'
        r'उत्तर दिनुहोस्|संक्षिप्त उत्तर)',
        re.IGNORECASE | re.MULTILINE
    ),
    'exercise_mcq': re.compile(
        r'^\s*\d+\.\s*(?:Choose the correct|Tick the (?:correct|best)|'
        r'Select the (?:correct|right)|Multiple choice|सही उत्तर छान)',
        re.IGNORECASE | re.MULTILINE
    ),
    'exercise_fitb': re.compile(
        r'^\s*\d+\.\s*(?:Fill in the blank|रिक्त ठाउँ भर)',
        re.IGNORECASE | re.MULTILINE
    ),
    'exercise_fullform': re.compile(
        r'^\s*\d+\.\s*(?:Write the full form|पूरा नाम लेख)',
        re.IGNORECASE | re.MULTILINE
    ),
    'exercise_technical_terms': re.compile(
        r'^\s*\d+\.\s*(?:Give appropriate technical term|'
        r'Write the technical term|प्राविधिक शब्द)',
        re.IGNORECASE | re.MULTILINE
    ),
    # ── Code programs ──
    'code_program': re.compile(
        r'^\s*(?:Program\s*#?\s*\d+|Lab\s+Activit(?:y|ies)|'
        r'कार्यक्रम\s*#?\s*\d+)\s*$',
        re.IGNORECASE | re.MULTILINE
    ),
    # ── Glossary / Technical Terms ──
    'glossary': re.compile(
        r'^\s*(?:Technical\s+Terms?|Glossary|शब्दावली|प्राविधिक शब्दहरू)\s*$',
        re.IGNORECASE | re.MULTILINE
    ),
    # ── Activities (Science books) ──
    'activity': re.compile(
        r'^\s*(?:Activity\s+\d+\.?\d*|क्रियाकलाप\s+\d+\.?\d*)\s+',
        re.IGNORECASE | re.MULTILINE
    ),
    # ── Worked examples (Math books) ──
    'example': re.compile(
        r'^\s*(?:Example\s+\d+|उदाहरण\s+\d+)\s*$',
        re.IGNORECASE | re.MULTILINE
    ),
    # ── Project Work ──
    'project': re.compile(
        r'^\s*(?:Project\s+(?:Work|Idea)|परियोजना\s+कार्य)\s*$',
        re.IGNORECASE | re.MULTILINE
    ),

    # ── English reading passages (story/poem + comprehension questions) ──
    'reading': re.compile(
        r'^\s*(?:Reading\s+(?:I{1,3}|[12])|Reading)\s*$',
        re.IGNORECASE | re.MULTILINE
    ),

    # ── English language-skill sections ──
    'comprehension': re.compile(
        r'^\s*(?:Comprehension)\s*$',
        re.IGNORECASE | re.MULTILINE
    ),
    'vocabulary': re.compile(
        r'^\s*(?:Working\s+with\s+words?|Vocabulary)\s*$',
        re.IGNORECASE | re.MULTILINE
    ),
    'critical_thinking': re.compile(
        r'^\s*(?:Critical\s+thinking)\s*$',
        re.IGNORECASE | re.MULTILINE
    ),
    'grammar': re.compile(
        r'^\s*(?:Grammar(?:\s+[IV]+)?)\s*$',
        re.IGNORECASE | re.MULTILINE
    ),
    'writing': re.compile(
        r'^\s*(?:Writing(?:\s+[IV]+)?)\s*$',
        re.IGNORECASE | re.MULTILINE
    ),
    'speaking': re.compile(
        r'^\s*(?:Speaking(?:\s+[IV]+)?)\s*$',
        re.IGNORECASE | re.MULTILINE
    ),
    'listening': re.compile(
        r'^\s*(?:Listening(?:\s+[IV]+)?)\s*$',
        re.IGNORECASE | re.MULTILINE
    ),
}

# Patterns for extracting headings from text
_HEADING_PATTERNS = [
    # "Unit 1.1  Networking and Telecommunication" or "Unit 1  Algebra"
    re.compile(r'^(?:Unit\s+\d+\.?\d*|Chapter\s+\d+|Lesson\s+\d+|'
               r'अध्याय\s*[\d१२३४५६७८९०]+|पाठ\s*[\d१२३४५६७८९०]+|'
               r'एकाइ\s*[\d१२३४५६७८९०]+)\s+(.+)', re.IGNORECASE),
    # "1.2.3 Digital Citizenship" or "a. Simplex Mode" or "A. Pteridophyta"
    re.compile(r'^\d+\.[\d.]*\s+[A-Z\u0900-\u097F]'),
    re.compile(r'^[a-zA-A]\.\s+[A-Z\u0900-\u097F]'),
    # "Data Communication Mode" (standalone bold heading — short line, capitalized)
    re.compile(r'^[A-Z\u0900-\u097F][A-Za-z\u0900-\u097F\s]{3,60}$'),
]

# Code block markers (QBASIC / C)
_CODE_MARKERS = re.compile(
    r'(?:^(?:REM|CLS|INPUT|PRINT|FOR|NEXT|IF|THEN|ELSE|END\s*(?:IF|SUB|FUNCTION)?|'
    r'DO|LOOP|WHILE|WEND|DIM|DECLARE|CALL|SUB|FUNCTION|SELECT\s+CASE|'
    r'#include|int\s+main|printf|scanf|void|return)\b)',
    re.IGNORECASE | re.MULTILINE
)


def detect_sections(text: str) -> List[Dict]:
    """
    Split a chapter's combined text into typed sections.

    Returns a list of dicts:
        {"text": str, "section_type": str, "heading": str}

    Section types: content, reading, exercise, exercise_mcq, exercise_fitb,
                   exercise_fullform, exercise_qa, exercise_technical_terms,
                   code_program, glossary, activity, example, project,
                   comprehension, vocabulary, critical_thinking, grammar,
                   writing, speaking, listening
    """
    if not text or not text.strip():
        return []

    lines = text.split('\n')
    sections = []
    current_section = {"lines": [], "section_type": "content", "heading": ""}

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Check if this line starts a new section
        new_section_type = None
        new_heading = stripped

        # ── Exercise header ──
        if _SECTION_PATTERNS['exercise'].match(stripped):
            new_section_type = 'exercise'
            # Look ahead to detect exercise sub-type
            lookahead = '\n'.join(lines[i+1:i+6])
            if _SECTION_PATTERNS['exercise_mcq'].search(lookahead):
                pass  # Sub-types will be detected on their own lines

        # ── Exercise sub-types ──
        elif _SECTION_PATTERNS['exercise_mcq'].match(stripped):
            new_section_type = 'exercise_mcq'
        elif _SECTION_PATTERNS['exercise_fitb'].match(stripped):
            new_section_type = 'exercise_fitb'
        elif _SECTION_PATTERNS['exercise_fullform'].match(stripped):
            new_section_type = 'exercise_fullform'
        elif _SECTION_PATTERNS['exercise_technical_terms'].match(stripped):
            new_section_type = 'exercise_technical_terms'
        elif _SECTION_PATTERNS['exercise_qa'].match(stripped):
            new_section_type = 'exercise_qa'

        # ── Code program ──
        elif _SECTION_PATTERNS['code_program'].match(stripped):
            new_section_type = 'code_program'

        # ── Glossary ──
        elif _SECTION_PATTERNS['glossary'].match(stripped):
            new_section_type = 'glossary'

        # ── Activity ──
        elif _SECTION_PATTERNS['activity'].match(stripped):
            new_section_type = 'activity'

        # ── Worked example ──
        elif _SECTION_PATTERNS['example'].match(stripped):
            new_section_type = 'example'

        # ── Project ──
        elif _SECTION_PATTERNS['project'].match(stripped):
            new_section_type = 'project'

        # ── English reading passages ──
        elif _SECTION_PATTERNS['reading'].match(stripped):
            new_section_type = 'reading'

        # ── English language-skill sections ──
        elif _SECTION_PATTERNS['comprehension'].match(stripped):
            new_section_type = 'comprehension'
        elif _SECTION_PATTERNS['vocabulary'].match(stripped):
            new_section_type = 'vocabulary'
        elif _SECTION_PATTERNS['critical_thinking'].match(stripped):
            new_section_type = 'critical_thinking'
        elif _SECTION_PATTERNS['grammar'].match(stripped):
            new_section_type = 'grammar'
        elif _SECTION_PATTERNS['writing'].match(stripped):
            new_section_type = 'writing'
        elif _SECTION_PATTERNS['speaking'].match(stripped):
            new_section_type = 'speaking'
        elif _SECTION_PATTERNS['listening'].match(stripped):
            new_section_type = 'listening'

        if new_section_type:
            # Save the current section if non-empty
            section_text = '\n'.join(current_section['lines']).strip()
            if section_text and len(section_text) > 20:
                current_section['text'] = section_text
                del current_section['lines']
                sections.append(current_section)

            # Start new section
            current_section = {
                "lines": [line],
                "section_type": new_section_type,
                "heading": new_heading
            }
        else:
            current_section['lines'].append(line)

            # Try to extract heading for content sections
            if current_section['section_type'] == 'content' and not current_section['heading']:
                for pat in _HEADING_PATTERNS[:3]:  # Only unit/subsection patterns
                    if pat.match(stripped) and len(stripped) < 80:
                        current_section['heading'] = stripped
                        break

        i += 1

    # Don't forget last section
    section_text = '\n'.join(current_section['lines']).strip()
    if section_text and len(section_text) > 20:
        current_section['text'] = section_text
        del current_section['lines']
        sections.append(current_section)

    return sections


def _is_atomic_section(section_type: str) -> bool:
    """Check if a section type should be kept intact (not split by sliding window)."""
    return section_type in (
        'code_program', 'glossary', 'activity', 'example', 'project',
        'exercise_mcq', 'exercise_fitb', 'exercise_fullform',
        'exercise_technical_terms',
        'comprehension', 'vocabulary', 'critical_thinking', 'grammar',
        'writing', 'speaking', 'listening',
    )


def _extract_heading_from_text(text: str) -> str:
    """Extract the first heading-like line from a text block."""
    for line in text.split('\n')[:5]:
        stripped = line.strip()
        if not stripped or len(stripped) < 3:
            continue
        for pat in _HEADING_PATTERNS:
            if pat.match(stripped) and len(stripped) < 100:
                return stripped
    return ""


def _extract_reading_title(section_text: str) -> str:
    """
    Extract the story/passage title from a reading section.

    English textbook reading sections look like:
        Reading I
        Look at the picture and answer the questions.
        a. What do you think...
        b. Are you planning...
        Poon Hill Yoga Trek in Nepal        <-- THIS is the title
        The Poon Hill Yoga Trek provides...

    Strategy: skip "Reading I/II", skip instructions/questions (lines starting
    with a-z. or "Look at"), find the first short capitalized line.
    """
    skip_patterns = re.compile(
        r'^(?:Reading\s|Look\s|Before\s|Answer\s|Discuss|What\s|How\s|Who\s|'
        r'Getting\s+started|Pronunciation|Extra\s+bit|'
        r'[a-z]\.\s|[a-z]\)\s|\d+\.\s|English\s+\d|^\d+$)',
        re.IGNORECASE
    )
    for line in section_text.split('\n')[:20]:
        stripped = line.strip()
        if not stripped or len(stripped) < 4 or len(stripped) > 80:
            continue
        if skip_patterns.match(stripped):
            continue
        # A title line: starts with uppercase, not too long, not a question
        if stripped[0].isupper() and not stripped.endswith('?'):
            return stripped
    return ""


# =============================================================================
# PREETI FONT DETECTION — Legacy Nepali PDFs use ASCII-mapped Devanagari fonts
# =============================================================================

_PREETI_FONT_NAMES = {'preeti', 'preetibold', 'sun', 'kantipur', 'fontasy'}


def _is_preeti_encoded(doc: fitz.Document) -> bool:
    """Detect if a PDF's content pages use Preeti/legacy Nepali fonts.

    Many Nepali textbooks use Preeti only for cover pages while content is in
    standard fonts (English math/science books). We check a content page (page 10+)
    to see if it has Preeti fonts AND no Unicode Devanagari in extracted text.
    """
    has_preeti = False
    for page_idx in range(min(5, len(doc))):
        for font in doc[page_idx].get_fonts():
            basefont = (font[3] or '').lower()
            if '+' in basefont:
                basefont = basefont.split('+', 1)[1]
            if any(pf in basefont for pf in _PREETI_FONT_NAMES):
                has_preeti = True
                break
        if has_preeti:
            break

    if not has_preeti:
        return False

    # Check content pages — if they have Unicode Devanagari or readable English,
    # text extraction is fine and OCR is not needed.
    _common_english = {'the', 'and', 'is', 'of', 'in', 'to', 'for', 'are', 'that', 'with'}
    for check_page in [min(10, len(doc) - 1), min(20, len(doc) - 1)]:
        text = doc[check_page].get_text()
        if not text.strip():
            continue
        devanagari_count = sum(1 for c in text if '\u0900' <= c <= '\u097F')
        if devanagari_count > 10:
            return False
        # Check for readable English (not Preeti gibberish)
        words = set(text.lower().split())
        english_hits = len(words & _common_english)
        if english_hits >= 3:
            return False

    logger.info("Detected Preeti-encoded PDF (no Devanagari on content pages) — will use OCR")
    return True


# Devanagari digit → ASCII digit
_DEVANAGARI_DIGIT_MAP = str.maketrans('०१२३४५६७८९', '0123456789')


def _devanagari_to_int(s: str) -> Optional[int]:
    """Convert Devanagari or mixed digit string to int. e.g. '१६' → 16, '2' → 2"""
    s = s.strip().translate(_DEVANAGARI_DIGIT_MAP)
    if s.isdigit():
        return int(s)
    return None


def _parse_nepali_toc_from_texts(ocr_pages: Dict[int, str], max_pages: int = 999) -> Dict[int, str]:
    """
    Parse TOC from OCR'd Nepali text (Unicode Devanagari).
    Handles एकाइ-एक/दुई/तीन and पाठ १/२/३ patterns.
    """
    toc_map = {}

    # Nepali ordinal words → unit number
    _ordinals = {
        'एक': 1, 'दुई': 2, 'दुर्ड': 2, 'तीन': 3, 'चार': 4, 'पाँच': 5,
        'पांच': 5, 'छ': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10,
    }

    unit_num = 0
    unit_title = ""

    for page_idx in sorted(ocr_pages.keys()):
        text = ocr_pages[page_idx]
        if not text.strip():
            continue

        # Check if this looks like a TOC page
        if not (
            'विषय' in text or 'एकाइ' in text or 'पाठ' in text
            or text.count('पाठ') >= 2
        ):
            continue

        lines = [l.strip() for l in text.split('\n') if l.strip()]

        i = 0
        while i < len(lines):
            line = lines[i]

            # ── Unit header: एकाइ-एक, एकाइ -पाँच, etc. ──
            unit_match = re.match(
                r'एकाइ\s*[-–—]\s*(\S+)', line
            )
            # Also handle OCR variant with space before dash
            if not unit_match:
                unit_match = re.match(
                    r'[डइए]काइ\s*[-–—]\s*(\S+)', line
                )
            if unit_match:
                ordinal = unit_match.group(1).strip()
                if ordinal in _ordinals:
                    unit_num = _ordinals[ordinal]
                else:
                    unit_num += 1

                # Extract unit title — may be on same line or next line
                # Same line: "एकाइ-एक हामी र हाम्रो समाज १-१४"
                after_unit = re.sub(r'^[डइए]?काइ\s*[-–—]\s*\S+\s*', '', line).strip()
                if after_unit:
                    # Remove trailing page range like १-१४ or garbled OCR ranges
                    after_unit = re.sub(r'\s*[\d०-९a-zA-Z&]+-[\d०-९a-zA-Z]+\s*$', '', after_unit).strip()
                    if after_unit:
                        unit_title = after_unit
                elif i + 1 < len(lines):
                    # Title on next line
                    next_line = lines[i + 1]
                    # Remove trailing page range
                    next_line = re.sub(r'\s*[\d०-९]+-[\d०-९]+\s*$', '', next_line).strip()
                    if next_line and not re.match(r'^पाठ\s', next_line):
                        unit_title = next_line
                        i += 1

                # Skip page range line if present
                if i + 1 < len(lines) and re.match(r'^[\d०-९]+-[\d०-९]+$', lines[i + 1].strip()):
                    i += 1

                i += 1
                continue

            # ── Lesson: पाठ १, पाठ २, पाठ3, etc. ──
            lesson_match = re.match(
                r'पाठ\s*([\d०-९]+)\s*(.*)', line
            )
            if lesson_match:
                lesson_num = _devanagari_to_int(lesson_match.group(1))
                rest = lesson_match.group(2).strip()

                title = None
                page_num = None

                if rest:
                    # Inline: "पाठ १ समाजको उत्पत्ति र विकासक्रम २"
                    # Try to split off trailing Devanagari/ASCII page number
                    title_page = re.match(r'^(.+?)\s+([\d०-९]+)\s*$', rest)
                    if title_page:
                        title = title_page.group(1).strip()
                        page_num = _devanagari_to_int(title_page.group(2))
                    else:
                        # Page number garbled by OCR — keep title, skip page
                        # Remove trailing garbage (2-3 non-Devanagari chars)
                        title = re.sub(r'\s+[a-zA-Z]{1,4}\s*$', '', rest).strip()
                elif i + 1 < len(lines):
                    title = lines[i + 1]
                    i += 1
                    if i + 1 < len(lines):
                        page_num = _devanagari_to_int(lines[i + 1])
                        if page_num:
                            i += 1

                if lesson_num and title:
                    label = f"एकाइ {unit_num} पाठ {lesson_num}" if unit_num else f"पाठ {lesson_num}"
                    if page_num and 1 <= page_num <= max_pages:
                        toc_map[page_num] = f"{label}: {title}"
                    else:
                        # No valid page number — store with estimated page
                        # (will be placed correctly by chapter boundary logic)
                        pass

                i += 1
                continue

            i += 1

    if toc_map:
        logger.info(f"Nepali OCR TOC parser extracted {len(toc_map)} entries")
    return toc_map


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
        'table of contents', 'preface',
        # Nepali/Devanagari equivalents
        'विषय सूची', 'विषय-सूची', 'अनुक्रमणिका', 'सामग्री', 'भूमिका',
        'पृष्ठ', 'शीर्षक', 'क्र.सं.', 'क्रमांक',
    }
    
    # ── Pre-scan: detect multi-column table TOC (English textbooks) ──
    # If column headers like "Reading", "Speaking", "Grammar" appear on a TOC
    # page, this is a horizontal table — skip line-by-line patterns 4/5 which
    # would greedily absorb column data into the title.
    _multicolumn_headers = {'reading', 'speaking', 'listening', 'grammar', 'writing'}
    is_multicolumn_toc = False
    for page_idx in range(pages_to_scan):
        text = doc[page_idx].get_text()
        text_lower = text.lower()
        if 'contents' in text_lower or len(re.findall(r'\bunit\b', text_lower)) >= 3:
            header_hits = sum(1 for h in _multicolumn_headers if h in text_lower)
            if header_hits >= 3:
                is_multicolumn_toc = True
                logger.info(f"Detected multi-column table TOC on page {page_idx + 1}")
                break

    # If multi-column table detected, parse it directly and skip line patterns
    if is_multicolumn_toc:
        toc_map = _parse_multicolumn_toc(doc, pages_to_scan, skip_words)
        if toc_map:
            logger.info(f"Text-based parser extracted {len(toc_map)} TOC entries (multicolumn)")
            return toc_map

    for page_idx in range(pages_to_scan):
        text = doc[page_idx].get_text()
        if not text.strip():
            continue

        lines = [line.strip() for line in text.split('\n') if line.strip()]

        text_lower = text.lower()
        is_toc_page = (
            'contents' in text_lower
            or len(re.findall(r'\bunit\b', text_lower)) >= 3
            or text_lower.count('chapter') >= 3
            or text_lower.count('lesson') >= 3
            # Devanagari TOC keywords
            or 'विषय सूची' in text or 'विषय-सूची' in text
            or 'अनुक्रमणिका' in text or 'सामग्री' in text
            or text.count('अध्याय') >= 3
            or text.count('पाठ') >= 3
            or text.count('एकाइ') >= 3
            or text.count('इकाइ') >= 3
        )

        if not is_toc_page:
            continue

        logger.info(f"Found potential TOC on page {page_idx + 1}")

        # ------- Pattern 1: Unit/Chapter label + Title + Page (3-line) -------
        i = 0
        while i < len(lines) - 1:
            line = lines[i]
            
            unit_match = re.match(
                r'^(Unit\s+\d+\.?\d*|Chapter\s+\d+|Lesson\s+\d+|'
                r'अध्याय\s*[\d१२३४५६७८९०]+|पाठ\s*[\d१२३४५६७८९०]+|'
                r'एकाइ\s*[\d१२३४५६७८९०]+|इकाइ\s*[\d१२३४५६७८९०]+)\s*$',
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
                r'^(Unit\s+\d+\.?\d*|Chapter\s+\d+|'
                r'अध्याय\s*[\d१२३४५६७८९०]+|पाठ\s*[\d१२३४५६७८९०]+|'
                r'एकाइ\s*[\d१२३४५६७८९०]+|इकाइ\s*[\d१२३४५६७८९०]+)\s+(.+?)\s*$',
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
            
            # ------- Pattern 4 & 5: Numbered list / Page-range -------
            # Handles:
            #   "1" or "1." → title (may wrap across lines) → page or range
            # Math TOC:  "1." / "Sets" / "1 – 24"
            # Science:   "1"  / "Scientific Learning" / "1"
            # Multi-line: "10." / "Highest Common Factor and Lowest Common" / "Multiple" / "197 – 213"
            num_match = re.match(r'^(\d{1,2})\.?$', line)
            if num_match and i + 2 < len(lines):
                unit_num = num_match.group(1)

                # Collect title lines — may span multiple lines
                # First line after the number MUST be a title (non-numeric)
                title_parts = []
                j = i + 1
                while j < len(lines):
                    candidate = lines[j].strip()
                    # Stop at a bare page number (1-3 digits, e.g. "442", "15")
                    if re.match(r'^\d{1,3}$', candidate) and title_parts:
                        break
                    # Stop at a page range ("1 – 24", "214– 235")
                    if re.match(r'^\d{1,3}\s*[–\-]\s*\d{1,3}$', candidate):
                        break
                    # Stop at the next entry number with dot ("10.")
                    if re.match(r'^\d{1,2}\.$', candidate):
                        break
                    if candidate and candidate.lower() not in skip_words:
                        title_parts.append(candidate)
                    j += 1

                title_line = ' '.join(title_parts)
                page_str = lines[j].strip() if j < len(lines) else ''
                lines_consumed = j - i + 1

                if title_line and not re.match(r'^\d+$', title_line):
                    # Pattern 4: bare page number (Science books)
                    if page_str.isdigit():
                        page_num = int(page_str)
                        if 1 <= page_num <= 999:
                            toc_map[page_num] = f"Unit {unit_num}: {title_line}"
                            i += lines_consumed
                            continue

                    # Pattern 5: page range "1 – 24" or "214– 235" (Math books)
                    range_match = re.match(r'^(\d{1,3})\s*[–\-]\s*\d{1,3}$', page_str)
                    if range_match:
                        page_num = int(range_match.group(1))
                        if 1 <= page_num <= 999:
                            toc_map[page_num] = title_line
                            i += lines_consumed
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

    PyMuPDF extracts horizontal tables column-by-column, producing text like:
        1 → Travel and → holidays → Poon Hill Yoga → ... → 1 → 2 → Health and → ...

    Algorithm:
    1. Collect all lines from TOC pages (including continuation pages)
    2. Find sequential unit numbers (1, 2, 3, ...) among bare-number lines
    3. For each unit: title = first few non-number words after unit number
    4. Page number = LAST bare number before the next unit number
    """
    # ── Collect all lines from TOC pages ──
    all_lines = []
    prev_was_toc = False
    for page_idx in range(pages_to_scan):
        text = doc[page_idx].get_text()
        text_lower = text.lower()
        lines = [l.strip() for l in text.split('\n') if l.strip()]

        is_toc_page = (
            'contents' in text_lower
            or len(re.findall(r'\bunit\b', text_lower)) >= 2
            or 'विषय सूची' in text or 'विषय-सूची' in text
            or 'अनुक्रमणिका' in text
            or text.count('अध्याय') >= 2 or text.count('पाठ') >= 2
            or text.count('एकाइ') >= 2 or text.count('इकाइ') >= 2
        )

        # Continuation pages: right after a TOC page, with bare numbers
        # but NOT actual content pages (which have long prose lines)
        if not is_toc_page and prev_was_toc:
            bare_nums = sum(1 for l in lines if re.match(r'^\d{1,3}$', l))
            long_lines = sum(1 for l in lines if len(l) > 60)
            if bare_nums >= 3 and long_lines < 3:
                is_toc_page = True

        if is_toc_page:
            all_lines.extend(lines)
            prev_was_toc = True
        else:
            prev_was_toc = False

    if not all_lines:
        return {}

    # ── Find all bare number positions ──
    num_positions = []  # [(line_index, value)]
    for i, line in enumerate(all_lines):
        if re.match(r'^\d{1,3}$', line):
            num_positions.append((i, int(line)))

    if len(num_positions) < 4:
        return {}

    # ── Identify sequential unit number positions ──
    # Unit numbers appear in order: 1, 2, 3, ..., N
    # Find the first occurrence of each expected unit number
    unit_positions = []  # [(line_index, unit_number)]
    expected = 1
    for idx, val in num_positions:
        if val == expected:
            unit_positions.append((idx, val))
            expected += 1
            if expected > 25:  # safety cap
                break

    if len(unit_positions) < 2:
        return {}

    # ── For each unit, extract title and page number ──
    # Words that indicate the start of a non-title column (Reading, Speaking, etc.)
    # These help us stop collecting title words early
    # Generic column header words that mark end of the Title column
    # These are the same across ALL English textbook TOC tables
    _column_stop_words = {
        'reading', 'speaking', 'listening', 'grammar', 'writing',
        'project', 'getting', 'look', 'before', 'discuss',
        'pronunciation', 'comprehension', 'vocabulary', 'critical',
    }

    entries = []
    for u_idx in range(len(unit_positions)):
        u_line_idx, u_num = unit_positions[u_idx]

        # Boundary: everything between this unit and the next
        if u_idx + 1 < len(unit_positions):
            next_u_line_idx = unit_positions[u_idx + 1][0]
        else:
            next_u_line_idx = len(all_lines)

        # Title: collect non-number, non-skip lines after unit number.
        # Strategy: grab words while they look like part of a title phrase.
        # Stop after 2+ words UNLESS the accumulated text ends with a
        # connector (and/of/the/or/,) — connectors signal the title continues.
        # This handles both short titles ("Family", "Sports") and long ones
        # ("Family, market and public place", "Global warming and climate change").
        _connectors = {'and', 'of', 'the', 'or', 'in', 'for', 'with'}
        title_parts = []
        word_count = 0
        for j in range(u_line_idx + 1, min(u_line_idx + 15, next_u_line_idx)):
            line = all_lines[j].strip()
            # Stop at any bare number
            if re.match(r'^\d{1,3}$', line):
                break
            line_lower = line.lower()
            if line_lower in skip_words:
                continue
            # Stop if this line starts a non-title column
            first_word = line_lower.split()[0] if line_lower.split() else ''
            if first_word in _column_stop_words and word_count >= 1:
                break
            if len(line) >= 2:
                # If we have 2+ words, check if we should keep collecting.
                # Continue if: previous text ends with connector/comma,
                # OR current line starts with connector (e.g. "and public")
                # OR previous text contains a comma (list-style title like
                # "Family, market and public place")
                if word_count >= 2:
                    prev_text = ' '.join(title_parts).lower()
                    last_word = prev_text.split()[-1].rstrip(',') if prev_text.split() else ''
                    ends_with_comma = prev_text.rstrip().endswith(',')
                    has_comma = ',' in prev_text
                    # Continue only if previous text actively signals continuation:
                    # ends with connector word, ends with comma, or is an
                    # incomplete comma-list (has comma but no "and" yet)
                    comma_list_incomplete = (
                        has_comma and ' and ' not in prev_text
                        and word_count < 5
                    )
                    continues = (
                        last_word in _connectors
                        or ends_with_comma
                        or comma_list_incomplete
                    )
                    if not continues:
                        break
                title_parts.append(line)
                word_count += len(line.split())
                if word_count >= 6:  # hard cap
                    break

        title = ' '.join(title_parts) if title_parts else None

        # Page number: LAST bare number between this unit and the next unit
        page_num = None
        for idx, val in num_positions:
            if u_line_idx < idx < next_u_line_idx:
                page_num = val  # keep overwriting — last one wins

        if title and page_num is not None:
            entries.append((u_num, f"Unit {u_num}: {title}", page_num))

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
        'project work', 'vocabulary',
        # Nepali equivalents
        'सुरु गरौं', 'पढौं', 'लेखौं', 'बोलौं', 'सुनौं', 'व्याकरण',
        'परियोजना कार्य', 'शब्द भण्डार',
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
                # Match "Unit N", "Unit  N", "Chapter N", "Lesson N", Devanagari equivalents
                match = re.match(
                    r'^(Unit\s+\d+\.?\d*|Chapter\s+\d+|Lesson\s+\d+|'
                    r'अध्याय\s*[\d१२३४५६७८९०]+|पाठ\s*[\d१२३४५६७८९०]+|'
                    r'एकाइ\s*[\d१२३४५६७८९०]+|इकाइ\s*[\d१२३४५६७८९०]+)\s*$',
                    line, re.IGNORECASE
                )
                if not match:
                    # Also match split format: "Unit" on one line, number on next
                    if re.match(r'^(Unit|Chapter|Lesson|अध्याय|पाठ|एकाइ|इकाइ)$', line, re.IGNORECASE) and idx + 1 < len(lines):
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
                    text = pytesseract.image_to_string(img, lang='nep+eng')
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

    # ─── Preeti font check: force OCR for legacy Nepali PDFs ───
    force_ocr = _is_preeti_encoded(doc)

    # ─── STEP 1: Extract TOC (multi-tier with quality check) ───
    if force_ocr:
        logger.info("OCR-ing first pages for TOC extraction (Preeti PDF)...")
        ocr_pages = {}
        for pi in range(min(10, len(doc))):
            pix = doc[pi].get_pixmap(dpi=300)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            ocr_pages[pi] = pytesseract.image_to_string(img, lang='nep+eng', config='--psm 6')
        toc_map = _parse_nepali_toc_from_texts(ocr_pages, max_pages=len(doc))
    else:
        toc_map = extract_toc(doc)  # Tier 1: PyMuPDF metadata
    
    # Quality check: PyMuPDF may return messy internal bookmark names
    # (e.g. "Unit-1, algebra final correction") or pure numbers ("0","1","2")
    def assess_toc_quality(toc):
        if len(toc) < 5:
            return "low"
        titles = list(toc.values())
        # Check for pure-number titles (e.g. "0", "1", "2")
        numeric_count = sum(1 for t in titles if re.match(r'^\d+$', t.strip()))
        if numeric_count > len(toc) * 0.5:
            return "low"
        # Check for .pdf extension — internal filename-based bookmarks
        if any('.pdf' in t.lower() for t in titles):
            return "low"
        # Check for code-like titles: letter-digit or digit-letter concatenation
        # e.g. "sci8", "8unit", "unit625", "cls8" — auto-generated bookmark names
        code_count = sum(1 for t in titles if re.search(r'[a-zA-Z]\d|\d[a-zA-Z]', t))
        if code_count > len(toc) * 0.4:
            return "low"
        # Check for suspiciously many short titles (< 5 chars avg) — likely codes
        avg_len = sum(len(t) for t in titles) / len(titles)
        if avg_len < 8:
            return "low"
        # Check for messy bookmark artifacts
        noise_words = ['edited', 'correction', 'repaired', 'final', 'corrected', 'copy']
        noisy_count = sum(1 for t in titles
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
            toc_quality = assess_toc_quality(toc_map)

    # Tier 4: For scanned Nepali books, try OCR-based Nepali TOC parsing
    if toc_quality == "low" and not force_ocr:
        # Check if first pages are scanned (no text)
        first_page_text = doc[0].get_text().strip() if len(doc) > 0 else ""
        if not first_page_text:
            logger.info("Scanned PDF with low TOC — trying OCR-based Nepali TOC parser...")
            ocr_pages = {}
            for pi in range(min(10, len(doc))):
                pix = doc[pi].get_pixmap(dpi=300)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                ocr_pages[pi] = pytesseract.image_to_string(img, lang='nep+eng', config='--psm 6')
            nepali_toc = _parse_nepali_toc_from_texts(ocr_pages, max_pages=len(doc))
            if len(nepali_toc) > len(toc_map):
                toc_map = nepali_toc

    if toc_map:
        logger.info(f"Final TOC with {len(toc_map)} chapters/units: {list(toc_map.values())[:8]}...")
    else:
        logger.warning("No TOC found via any extraction method — chunks will not have chapter tags")
    
    # ─── STEP 2: Extract text from all pages (parallel) ───
    num_pages = len(doc)
    page_texts = {}
    scan_indices = []  # page indices (0-based) that need OCR

    if force_ocr:
        # Preeti-encoded PDFs: skip PyMuPDF text (it's ASCII gibberish), OCR everything
        logger.info("Preeti font detected — forcing OCR for all pages")
        scan_indices = list(range(num_pages))
    else:
        def _extract_text_range(args):
            """Extract text from a range of pages in an independent fitz doc instance."""
            start, end, pdf_bytes_local = args
            d = fitz.open(stream=pdf_bytes_local, filetype="pdf")
            results = []
            for idx in range(start, end):
                results.append((idx + 1, d[idx].get_text()))
            d.close()
            return results

        # Split pages into worker-sized chunks for parallel text extraction
        num_workers = min(8, num_pages)
        chunk_size_pages = max(1, (num_pages + num_workers - 1) // num_workers)
        ranges = [(i, min(i + chunk_size_pages, num_pages), pdf_bytes)
                  for i in range(0, num_pages, chunk_size_pages)]

        with ThreadPoolExecutor(max_workers=num_workers) as executor:
            for batch in executor.map(_extract_text_range, ranges):
                for p_num, text in batch:
                    if text.strip():
                        page_texts[p_num] = text
                    else:
                        scan_indices.append(p_num - 1)  # 0-based for OCR

    # Parallel OCR for scanned pages (or all pages if force_ocr)
    if scan_indices:
        logger.info(f"Detected {len(scan_indices)} scanned pages. Starting Parallel Tesseract OCR...")

        def ocr_page(page_idx):
            try:
                d = fitz.open(stream=pdf_bytes, filetype="pdf")
                pix = d[page_idx].get_pixmap(dpi=150)
                d.close()
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                text = pytesseract.image_to_string(img, lang='nep+eng')
                return page_idx + 1, text
            except Exception as e:
                logger.error(f"OCR failed for Page {page_idx + 1}: {e}")
                return page_idx + 1, ""

        with ThreadPoolExecutor(max_workers=8) as executor:
            for p_num, text in executor.map(ocr_page, scan_indices):
                if text.strip():
                    page_texts[p_num] = text

        logger.info(f"OCR Complete. Extracted text from {len(scan_indices)} pages.")

    # ─── STEP 2.5: Reconstruct fractions in extracted text ───
    # PyMuPDF splits fractions across lines (numerator/denominator on separate lines)
    # Run twice to catch cascading fractions (e.g. "= p" / "h" / "=" / ...)
    for p_num in page_texts:
        page_texts[p_num] = reconstruct_fractions(
            reconstruct_fractions(page_texts[p_num])
        )

    # ─── STEP 3: Section-aware chunking with chapter boundaries ───
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

    # Chunk within each chapter group using section detection
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

        # Detect structural sections (exercises, code, glossary, etc.)
        sections = detect_sections(combined_text)

        if not sections:
            # Fallback: treat entire chapter as one content section
            sections = [{"text": combined_text, "section_type": "content", "heading": ""}]

        # Process each detected section
        for section in sections:
            section_text = section['text']
            section_type = section['section_type']
            section_heading = section.get('heading', '')
            section_tokens = count_tokens(section_text)

            if not section_text.strip():
                continue

            # Find which page this section primarily belongs to
            sec_start = combined_text.find(section_text[:80])
            primary_page = pages[0][0]
            if sec_start >= 0:
                for boundary in page_boundaries:
                    if boundary["start_char"] <= sec_start < boundary["end_char"]:
                        primary_page = boundary["page"]
                        break

            # Atomic sections: keep intact if under MAX_ATOMIC_TOKENS
            if _is_atomic_section(section_type) and section_tokens <= MAX_ATOMIC_TOKENS:
                chunks.append({
                    "text": section_text,
                    "page": primary_page,
                    "chapter": chapter,
                    "section_type": section_type,
                    "heading": section_heading,
                    "token_count": section_tokens,
                    "original_text": section_text
                })
            # Large atomic sections: split but keep section_type tag
            elif _is_atomic_section(section_type):
                sub_chunks = split_text_by_tokens(section_text, CHUNK_SIZE, CHUNK_OVERLAP)
                for ci, sub_text in enumerate(sub_chunks):
                    if not sub_text.strip():
                        continue
                    sub_heading = section_heading if ci == 0 else f"{section_heading} (cont.)"
                    # Map each sub-chunk back to its correct source page
                    chunk_start = combined_text.find(sub_text[:80])
                    chunk_page = primary_page
                    if chunk_start >= 0:
                        for boundary in page_boundaries:
                            if boundary["start_char"] <= chunk_start < boundary["end_char"]:
                                chunk_page = boundary["page"]
                                break
                    chunks.append({
                        "text": sub_text,
                        "page": chunk_page,
                        "chapter": chapter,
                        "section_type": section_type,
                        "heading": sub_heading,
                        "token_count": count_tokens(sub_text),
                        "original_text": sub_text
                    })
            # Content / reading / exercise_qa: use sliding window with heading extraction
            else:
                # For reading sections, extract the story/passage title once
                # so all sub-chunks carry it (e.g. "Poon Hill Yoga Trek in Nepal")
                reading_title = None
                if section_type == 'reading':
                    reading_title = _extract_reading_title(section_text)

                sub_chunks = split_text_by_tokens(section_text, CHUNK_SIZE, CHUNK_OVERLAP)
                char_pos = 0
                for sub_text in sub_chunks:
                    if not sub_text.strip():
                        continue

                    # Map back to source page
                    chunk_start = combined_text.find(sub_text[:80])
                    if chunk_start == -1:
                        chunk_start = char_pos

                    chunk_page = primary_page
                    for boundary in page_boundaries:
                        if boundary["start_char"] <= chunk_start < boundary["end_char"]:
                            chunk_page = boundary["page"]
                            break

                    # Extract heading: reading title > section heading > auto-detect
                    chunk_heading = reading_title or section_heading or _extract_heading_from_text(sub_text)

                    chunks.append({
                        "text": sub_text,
                        "page": chunk_page,
                        "chapter": chapter,
                        "section_type": section_type,
                        "heading": chunk_heading,
                        "token_count": count_tokens(sub_text),
                        "original_text": sub_text
                    })
                    char_pos = chunk_start + len(sub_text)

    # Sort by page number
    chunks.sort(key=lambda x: x['page'])

    # Filter and merge small chunks (now section-type aware)
    chunks = filter_and_merge_small_chunks(chunks, min_size=80)
    
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


def filter_and_merge_small_chunks(chunks: List[Dict], min_size: int = 80) -> List[Dict]:
    """
    Remove tiny chunks and merge small adjacent chunks.
    Section-type aware: only merges chunks of the SAME section_type and chapter.
    Greedy merge for 'example' chunks: keeps absorbing consecutive small examples
    until the combined size reaches CHUNK_SIZE (reduces 337 → ~100 for Math books).
    """
    filtered = []
    i = 0

    while i < len(chunks):
        current = chunks[i]

        # Skip tiny administrative chunks (headers/footers from early pages)
        if current['token_count'] < 40 and current['page'] < 5:
            i += 1
            continue

        cur_type = current.get('section_type', 'content')
        cur_chapter = current['chapter']

        # Greedy merge for small example chunks (Math books produce many tiny ones)
        if cur_type == 'example' and current['token_count'] < CHUNK_SIZE:
            merged_text = current['text']
            merged_orig = current['original_text']
            merged_tokens = current['token_count']
            merged_heading = current.get('heading', '')
            merged_page = current['page']
            j = i + 1

            while j < len(chunks):
                nxt = chunks[j]
                if (nxt.get('section_type') != 'example'
                        or nxt['chapter'] != cur_chapter):
                    break
                combined = merged_tokens + nxt['token_count']
                if combined > CHUNK_SIZE:
                    break
                merged_text += "\n\n" + nxt['text']
                merged_orig += "\n\n" + nxt['original_text']
                merged_tokens = combined
                if not merged_heading:
                    merged_heading = nxt.get('heading', '')
                j += 1

            filtered.append({
                'text': merged_text,
                'page': merged_page,
                'chapter': cur_chapter,
                'section_type': 'example',
                'heading': merged_heading,
                'token_count': merged_tokens,
                'original_text': merged_orig,
            })
            i = j
            continue

        # Standard pair-merge for other small chunks (same chapter + type)
        if current['token_count'] < min_size and i + 1 < len(chunks):
            next_chunk = chunks[i + 1]

            same_chapter = next_chunk['chapter'] == cur_chapter
            same_type = next_chunk.get('section_type') == cur_type

            if same_chapter and same_type:
                merged_tokens = current['token_count'] + next_chunk['token_count']

                if merged_tokens <= CHUNK_SIZE:
                    merged = {
                        'text': current['text'] + "\n\n" + next_chunk['text'],
                        'page': current['page'],
                        'chapter': cur_chapter,
                        'section_type': cur_type,
                        'heading': current.get('heading') or next_chunk.get('heading', ''),
                        'token_count': merged_tokens,
                        'original_text': current['original_text'] + "\n\n" + next_chunk['original_text']
                    }
                    filtered.append(merged)
                    i += 2
                    continue

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
