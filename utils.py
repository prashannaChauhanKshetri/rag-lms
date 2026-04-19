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
# Legacy globals — retained as safe fallbacks for any call-sites that still
# reference them. Per-section sizes are driven by CHUNK_CONFIG below.
CHUNK_SIZE = 900       # Default fallback (content-heavy sections)
CHUNK_OVERLAP = 180    # 20% overlap — preserves cross-boundary context
MAX_ATOMIC_TOKENS = 2000  # Max size for "keep intact" sections (raised from 1200)

# ── Per-section-type chunk sizes (RAGAS improvement: chunking overhaul) ──
# Textbook topics often exceed 600 tokens; a single worked example or a full
# experiment description commonly runs 800–1500 tokens. Per-type sizes let
# content-heavy sections stay coherent while keeping exercise items tight.
CHUNK_CONFIG: Dict[str, Dict[str, int]] = {
    # Content-heavy sections: bigger windows preserve topic coherence
    "content":      {"size": 1000, "overlap": 200},  # 20% overlap
    "reading":      {"size": 900,  "overlap": 150},

    # Worked examples / proofs: must stay together — big atomic limit
    "example":      {"size": 1200, "overlap": 200},

    # Exercises: medium — one Q+A typically fits in ~400–500 tokens
    "exercise":              {"size": 500, "overlap": 100},
    "exercise_qa":           {"size": 500, "overlap": 100},
    "exercise_mcq":          {"size": 400, "overlap": 80},
    "exercise_fitb":         {"size": 400, "overlap": 80},
    "exercise_fullform":     {"size": 400, "overlap": 0},
    "exercise_technical_terms": {"size": 400, "overlap": 0},

    # Atomic / specialized sections: large size so they stay intact
    "code_program":     {"size": 1500, "overlap": 0},
    "glossary":         {"size": 1500, "overlap": 0},
    "activity":         {"size": 800,  "overlap": 100},
    "project":          {"size": 800,  "overlap": 100},
    "comprehension":    {"size": 600,  "overlap": 100},
    "vocabulary":       {"size": 600,  "overlap": 100},
    "critical_thinking":{"size": 600,  "overlap": 100},
    "grammar":          {"size": 700,  "overlap": 100},
    "writing":          {"size": 700,  "overlap": 100},
    "speaking":         {"size": 500,  "overlap": 80},
    "listening":        {"size": 500,  "overlap": 80},

    # Formula+example merged sections (see Step 4a)
    "formula_with_example": {"size": 1500, "overlap": 200},
}


def _chunk_params(section_type: str) -> Tuple[int, int]:
    """Return (size, overlap) tokens for a given section_type.
    Falls back to (CHUNK_SIZE, CHUNK_OVERLAP) for unknown types.
    """
    cfg = CHUNK_CONFIG.get(section_type)
    if cfg is None:
        return CHUNK_SIZE, CHUNK_OVERLAP
    return cfg["size"], cfg["overlap"]


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
    # Matches: `Exercise`, `Exercises`, `Exercise 1`, `Exercise 1.2`,
    # `Exercise 13.4`, `Miscellaneous Exercise`, `अभ्यास`, `अभ्यास १`.
    # Rejects: inline references like "See Exercise 1.2 above" (must be
    # a standalone line due to ^...\s*$ anchors).
    'exercise': re.compile(
        r'^\s*(?:'
        r'Exercises?|'
        r'Exercise\s+\d+(?:\.\d+)?|'
        r'Miscellaneous\s+Exercise(?:\s+\d+(?:\.\d+)?)?|'
        r'अभ्यास(?:\s*[\d०-९]+(?:\.[\d०-९]+)?)?'
        r')\s*$',
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

    # Fallback: literature-anthology TOC (e.g. Nepali grade-9 reader).
    # Only runs when the एकाइ/पाठ parser above returned nothing — this
    # preserves behavior for all existing Nepali textbooks that use the
    # standard unit/lesson TOC format.
    if not toc_map:
        lit_map = _parse_nepali_literature_toc(ocr_pages, max_pages=max_pages)
        if lit_map:
            toc_map = lit_map

    if toc_map:
        logger.info(f"Nepali OCR TOC parser extracted {len(toc_map)} entries")
    return toc_map


# ── Nepali literature genres (used as TOC anchors, not unit markers) ──
_NEPALI_LITERATURE_GENRES = (
    'कविता', 'कथा', 'निबन्ध', 'जीवनी', 'संवाद', 'निवेदन',
    'नियात्रा', 'वक्तृता', 'लोककथा', 'गीत', 'नाटक', 'चिठी', 'पाठ',
)
_NEPALI_GENRE_RE = re.compile(
    r'^(.+?)\s+(' + '|'.join(_NEPALI_LITERATURE_GENRES) + r')(?:\s+(\S+))?\s*$'
)


def _normalize_for_match(s: str) -> str:
    """Lowercase + strip punctuation/whitespace for fuzzy title matching."""
    return re.sub(r'[^\w\u0900-\u097F]+', ' ', s.lower()).strip()


def _strip_unit_prefix(title: str) -> str:
    """Strip leading 'Unit N:' / 'Chapter N:' / 'एकाइ N:' etc. from a TOC title."""
    return re.sub(
        r'^(?:Unit|Chapter|Lesson|Section|अध्याय|पाठ|एकाइ|इकाइ)\s*'
        r'[\d०-९]+(?:\.[\d०-९]+)?\s*[:\.\-]?\s*',
        '',
        title,
        flags=re.IGNORECASE,
    ).strip()


def _detect_page_offset(
    page_texts: Dict[int, str],
    max_pages_to_scan: int = 30,
) -> int:
    """Detect a constant offset between printed book-page numbers and
    physical PDF page indices.

    Many textbooks print a page number at the top of each page (e.g.
    `"25 Mathematics Grade 9"` at the top of physical page 31). When these
    mismatch, every chapter in a TOC that uses book-page numbers will be
    off by the same amount.

    Strategy:
      - Scan the first `max_pages_to_scan` physical pages.
      - For each, extract candidate page numbers from the top 2 lines
        (patterns like `^\\d{1,3}\\s` or `Mathematics Grade \\d \\d+`).
      - Compute offset = physical_page - printed_page for each match.
      - Return the mode (most common offset) if ≥3 pages agree, else 0.
    """
    if not page_texts:
        return 0

    offsets: List[int] = []
    pages_scanned = 0

    for phys_page in sorted(page_texts.keys()):
        if pages_scanned >= max_pages_to_scan:
            break
        pages_scanned += 1

        text = page_texts.get(phys_page, "")
        if not text:
            continue

        # Look at the first 3 non-empty lines
        lines = [ln.strip() for ln in text.split("\n") if ln.strip()][:3]
        if not lines:
            continue

        for ln in lines:
            # Pattern A: bare page number at line start, followed by space/end
            m = re.match(r"^(\d{1,3})(?:\s|$)", ln)
            if m:
                printed = int(m.group(1))
                if 1 <= printed <= 500:
                    offsets.append(phys_page - printed)
                    break
            # Pattern B: book title + bare number at end of line
            m = re.search(
                r"(?:Grade|Class|Mathematics|Science|English|Nepali)\s+"
                r"(?:\d+\s*)?(\d{1,3})\s*$",
                ln,
                re.IGNORECASE,
            )
            if m:
                printed = int(m.group(1))
                if 1 <= printed <= 500:
                    offsets.append(phys_page - printed)
                    break

    if len(offsets) < 3:
        return 0

    # Return the mode if it appears in ≥50% of samples
    from collections import Counter
    mode, mode_count = Counter(offsets).most_common(1)[0]
    if mode_count >= len(offsets) * 0.5 and mode != 0:
        return mode
    return 0


def _validate_and_correct_toc_pages(
    toc_map: Dict[int, str],
    page_texts: Dict[int, str],
    max_drift: int = 10,
) -> Dict[int, str]:
    """Correct TOC page numbers that drifted from their physical pages.

    Many scanned textbooks print front-matter pages (cover, copyright,
    preface) that aren't counted in the book's own page numbers. The OCR'd
    TOC then says "Chapter 1 — page 1" but the chapter actually starts on
    physical page 4 or 5.

    Safety invariants (hard — tested against grade-9 science and grade-10
    social, which previously collapsed chapters):

      1. **Order preservation**: corrected pages must be in the same
         relative order as the input. A chapter listed earlier in the TOC
         cannot be mapped to a later physical page than a chapter listed
         after it.
      2. **No collisions**: two TOC entries cannot map to the same physical
         page after correction. When a collision would occur, the earlier
         entry keeps its corrected slot and later entries fall back to
         their original pages.
      3. **Unique title match**: the title must appear on exactly one
         page within the drift window. Titles that match 2+ nearby pages
         are ambiguous and skipped (keep original).
      4. **No-change fallback**: if correction would violate any invariant
         or damage more entries than it fixes, the original map is kept.

    Returns a new dict — does not mutate the input.
    """
    if not toc_map or not page_texts:
        return toc_map

    def find_title_on_page(phys_page: int, title_norm: str) -> bool:
        text = page_texts.get(phys_page, "")
        if not text:
            return False
        head = text[:800]  # check top 800 chars — titles usually appear early
        return title_norm in _normalize_for_match(head)

    # Walk entries in original TOC order
    ordered_entries = sorted(
        toc_map.items(),
        key=lambda kv: int(kv[0]) if str(kv[0]).lstrip("-").isdigit() else 0,
    )

    # For each entry, decide: keep original, or propose a corrected page
    proposals: List[Tuple[int, int, str]] = []  # (orig_page, proposed_page, title)
    for toc_page, title in ordered_entries:
        try:
            tp = int(toc_page)
        except (ValueError, TypeError):
            continue

        short = _strip_unit_prefix(title)
        if not short or len(short) < 4:
            proposals.append((tp, tp, title))
            continue

        short_norm = _normalize_for_match(short)

        # Already correct → keep
        if find_title_on_page(tp, short_norm):
            proposals.append((tp, tp, title))
            continue

        # Scan the full drift window and collect ALL matching pages.
        # Ambiguity (2+ matches) is treated as a no-correction signal.
        matches: List[int] = []
        for delta in range(1, max_drift + 1):
            for candidate in (tp - delta, tp + delta):
                if candidate < 1 or candidate not in page_texts:
                    continue
                if find_title_on_page(candidate, short_norm):
                    matches.append(candidate)
            if len(matches) >= 2:
                break

        if len(matches) == 1:
            proposals.append((tp, matches[0], title))
        else:
            # 0 matches or 2+ ambiguous matches → keep original
            proposals.append((tp, tp, title))

    # ── Invariant 1: enforce monotonic ordering of proposed pages ──
    # Walk proposals in order. If a proposal would put a chapter at or
    # before the previous chapter's proposed page, revert it to the
    # original page (or max of original / prev+1, whichever is valid).
    for i in range(1, len(proposals)):
        prev_proposed = proposals[i - 1][1]
        orig_page, prop_page, title = proposals[i]
        if prop_page <= prev_proposed:
            # Order violated — revert to original if original is still > prev
            if orig_page > prev_proposed:
                proposals[i] = (orig_page, orig_page, title)
            else:
                # Original also violates — keep original (accept slight
                # chapter overlap rather than lose the chapter entirely)
                proposals[i] = (orig_page, orig_page, title)

    # ── Invariant 2: no two proposed pages collide ──
    # If two chapters end up on the same physical page, revert the later
    # one to its original page. Run a second pass because reverting may
    # re-collide; keep iterating until stable.
    for _ in range(3):  # 3 passes is enough for any realistic case
        seen: Dict[int, int] = {}  # proposed_page -> index
        collided = False
        for i, (orig_page, prop_page, title) in enumerate(proposals):
            if prop_page in seen:
                # Revert later entry (this one) to its original page
                proposals[i] = (orig_page, orig_page, title)
                collided = True
            else:
                seen[prop_page] = i
        if not collided:
            break

    # Build corrected map + count drift
    corrected: Dict[int, str] = {}
    drift_count = 0
    for orig_page, prop_page, title in proposals:
        corrected[prop_page] = title
        if prop_page != orig_page:
            drift_count += 1

    # ── Invariant 4: sanity check — did correction reduce chapter count? ──
    # If we somehow ended up with fewer entries than we started with (which
    # should be impossible after the collision pass, but belt-and-braces),
    # throw away the corrections and keep the original map.
    if len(corrected) < len(toc_map):
        logger.warning(
            f"TOC page-drift correction would drop "
            f"{len(toc_map) - len(corrected)} entries — keeping original map"
        )
        return toc_map

    if drift_count:
        logger.info(
            f"TOC page-drift correction: adjusted {drift_count}/{len(toc_map)} "
            f"entries to their actual physical pages"
        )

    # ── Second pass: constant-offset detection ──
    # If the main pass only corrected a minority of entries, the remaining
    # entries may share a constant offset that the ambiguity check blocked.
    # Grade-9 / grade-10 math books print book-page numbers offset from
    # physical PDF pages by a constant (e.g. 6). Detect by scanning printed
    # page numbers in the first ~30 physical pages.
    uncorrected_fraction = 1.0 - (drift_count / max(1, len(toc_map)))
    if uncorrected_fraction >= 0.5:
        offset = _detect_page_offset(page_texts)
        if offset != 0:
            logger.info(
                f"Detected constant page offset of {offset:+d} "
                f"(physical = printed + {offset}); "
                f"applying to uncorrected TOC entries"
            )
            # Apply the offset to entries that weren't individually corrected.
            # Preserve invariants: order + no collisions.
            offset_corrected: Dict[int, str] = {}
            used_pages = set()
            for orig_page, prop_page, title in proposals:
                if prop_page != orig_page:
                    # Already corrected by pass 1 — keep it
                    target = prop_page
                else:
                    # Apply offset
                    target = orig_page + offset
                    if target < 1:
                        target = orig_page
                # Collision resolution: bump by +1 until unique
                while target in used_pages:
                    target += 1
                used_pages.add(target)
                offset_corrected[target] = title

            # Sanity check: don't lose entries
            if len(offset_corrected) == len(toc_map):
                extra_corrected = sum(
                    1 for (orig, prop, _) in proposals
                    if orig == prop  # pass 1 didn't touch these
                )
                logger.info(
                    f"Offset correction moved {extra_corrected} additional entries"
                )
                return offset_corrected

    return corrected


def _parse_english_toc_line(line: str) -> Optional[Tuple[int, str, int]]:
    """Parse a single OCR'd TOC line of the form `<num> <title> <page>`.

    Used by `_parse_english_toc_from_ocr`. Returns `(unit, title, page)` on
    success or None. Tolerant of OCR noise like `Oe 1 Scientific study 1`,
    `4 Evolution | | 36`, `45 . Chemical Reaction 247`.
    """
    # Must start with optional non-digit garbage, then num, then text+num+end
    m = re.match(r'^(?:[^\d]*?)(\d{1,3})(.+?)(\d{1,3})\s*$', line)
    if not m:
        return None

    unit = int(m.group(1))
    title = m.group(2)
    page = int(m.group(3))

    # Strip leading/trailing punctuation + OCR junk
    title = re.sub(r'^[\s:\|\.\-—,]+', '', title)
    title = re.sub(r'[\s:\|\.\-—,]+$', '', title)
    title = re.sub(r'\s+', ' ', title).strip()

    if len(title) < 4:
        return None
    # Require at least one alpha word of ≥3 chars (filters "Fig. 1.2")
    alpha_words = re.findall(r'[A-Za-z]{3,}', title)
    if len(alpha_words) < 1:
        return None
    # Sanity: page numbers 1..999
    if not (1 <= page <= 999):
        return None
    # Sanity: unit 1..99 (filter "Fig. 1.2" where first digit is chapter num)
    if not (1 <= unit <= 99):
        return None

    return unit, title, page


def _parse_english_toc_from_ocr(
    ocr_pages: Dict[int, str]
) -> Dict[int, str]:
    """Parse English textbook TOCs out of OCR'd pages.

    Used by the Tier-4 fallback in `process_pdf` when a book is fully scanned
    (no PyMuPDF text layer) and the Nepali OCR parser returns nothing.
    Handles the single-line format common in science/social textbooks:
        1 Scientific study 1
        2 Classification of Living Beings 17
        3 Mushroom 27

    Strict gating so this can't misfire on other books:
      1. Page must look like a TOC (contains "Contents" OR "Unit"+"Topic"+"Page"
         header OR ≥3 "unit"/"chapter"/"lesson" mentions).
      2. Page must yield ≥5 valid entries before results are accepted.
    """
    toc_map: Dict[int, str] = {}

    for page_idx in sorted(ocr_pages.keys()):
        text = ocr_pages[page_idx]
        if not text.strip():
            continue
        text_lower = text.lower()

        # Strong TOC signal
        is_toc_page = (
            'contents' in text_lower
            or ('unit' in text_lower and 'topic' in text_lower
                and 'page' in text_lower)
            or text_lower.count('unit') >= 3
            or text_lower.count('chapter') >= 3
            or text_lower.count('lesson') >= 3
        )
        if not is_toc_page:
            continue

        page_entries: Dict[int, str] = {}
        for line in text.split('\n'):
            parsed = _parse_english_toc_line(line.strip())
            if not parsed:
                continue
            unit, title, page_num = parsed
            # Use the page number (from the TOC text) as the key — matches
            # the existing toc_map format used by get_chapter_for_page.
            page_entries[page_num] = f"Unit {unit}: {title}"

        if len(page_entries) >= 5:
            toc_map.update(page_entries)
            break  # accept the first high-quality TOC page

    return toc_map


def _parse_nepali_literature_toc(
    ocr_pages: Dict[int, str], max_pages: int = 999
) -> Dict[int, str]:
    """Parse Nepali literature-anthology TOCs.

    Matches entries of the form `<num>. <title> <genre> <page>`, e.g.:
        १. मेघ बिजुली विवाह कविता १
        २. स्वाद कथा १०

    Genre words act as anchors since they sit between the title and the page
    number. Guarded so this parser can't misfire on non-literature books:
      1. Page must contain `विषयसूची` or `शीर्षक` (explicit TOC markers).
      2. Page must yield ≥3 valid entries before results are accepted.
    """
    toc_map: Dict[int, str] = {}

    for page_idx in sorted(ocr_pages.keys()):
        text = ocr_pages[page_idx]
        if 'विषयसूची' not in text and 'शीर्षक' not in text:
            continue

        lines = [l.strip() for l in text.split('\n') if l.strip()]
        page_entries: Dict[int, str] = {}

        for line in lines:
            m = _NEPALI_GENRE_RE.match(line)
            if not m:
                continue
            title = m.group(1).strip()
            # Strip leading numeric/punctuation artifacts from OCR:
            #   "१." "1." "¥." "प्‌." "द." etc.
            title = re.sub(
                r'^[\d०-९¥प्‌द\.\,\)\(]+\s*', '', title
            ).strip()
            if not title or len(title) < 2:
                continue

            page_str = m.group(3) or ''
            page_num = _devanagari_to_int(page_str) if page_str else None

            if page_num and 1 <= page_num <= max_pages:
                page_entries[page_num] = title

        if len(page_entries) >= 3:
            toc_map.update(page_entries)
            break  # one valid TOC page is enough

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
        def _ocr_toc_page_preeti(pi):
            d = fitz.open(stream=pdf_bytes, filetype="pdf")
            pix = d[pi].get_pixmap(dpi=300)
            d.close()
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            return pi, pytesseract.image_to_string(img, lang='nep+eng', config='--psm 6')
        ocr_pages = {}
        n_toc = min(10, len(doc))
        with ThreadPoolExecutor(max_workers=min(n_toc, 8)) as ex:
            for pi, text in ex.map(_ocr_toc_page_preeti, range(n_toc)):
                ocr_pages[pi] = text
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
        # Check for .pdf/.PDF extension — internal filename-based bookmarks
        if any('.pdf' in t.lower() for t in titles):
            return "low"
        # Check for scanned-doc filenames:
        #   "New Doc 02-29-2024 11.08", "sci7 unit1 79-5-23", "scence 7unit2 79-5-2310"
        scan_filename_count = sum(
            1 for t in titles
            if re.search(r'\d{2}[-/]\d{1,2}[-/]\d{2,4}', t)              # date: 02-29-2024 / 79-5-23
            or re.match(r'^(New Doc|Scan|IMG|DSC|image|photo|page)\b', t, re.IGNORECASE)
            or re.search(r'\bPDF\s*\d+\b', t, re.IGNORECASE)              # "PDF10"
            or re.search(r'\bipg\s*\d+', t, re.IGNORECASE)                # "ipg1-16"
        )
        if scan_filename_count > len(toc) * 0.2:
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

    def prefer_toc(current: Dict[int, str], candidate: Dict[int, str]) -> bool:
        """Decide whether `candidate` should replace `current` as the chosen TOC.

        Quality beats size: a "good" TOC always wins over a "low" one,
        regardless of entry count. For same-quality TOCs, the one with more
        entries wins. Fixes the prior bug where Docling's 19 clean entries
        were rejected because PyMuPDF had returned 179 garbage entries.
        """
        if not candidate:
            return False
        curr_q = assess_toc_quality(current)
        cand_q = assess_toc_quality(candidate)
        if cand_q == "good" and curr_q != "good":
            return True
        if curr_q == "good" and cand_q != "good":
            return False
        return len(candidate) > len(current)

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
        # Tier 2 + 3: Run Docling and Groq LLM in parallel (saves ~15s on M1)
        logger.info("Running Docling + Groq LLM TOC extraction in parallel...")
        with ThreadPoolExecutor(max_workers=2) as ex:
            docling_future = ex.submit(extract_toc_with_docling, pdf_bytes)
            groq_future    = ex.submit(extract_toc_with_groq, pdf_bytes)
            docling_toc = docling_future.result()
            groq_toc    = groq_future.result()

        # Pick the best result: quality-first so Docling's clean 19 entries
        # can displace PyMuPDF's 179 garbage entries.
        for candidate in sorted(
            [docling_toc, groq_toc],
            key=lambda t: (assess_toc_quality(t) == "good", len(t)),
            reverse=True
        ):
            if prefer_toc(toc_map, candidate):
                toc_map = candidate
                toc_quality = assess_toc_quality(toc_map)
                break

    # Tier 4: Scanned Nepali books — parallel OCR of first 10 pages
    # NOTE: Only runs if still low AND first page has no text layer (truly scanned)
    # Disabled for scanned-image PDFs with garbage bookmarks (handled by discard below)
    if toc_quality == "low" and not force_ocr:
        first_page_text = doc[0].get_text().strip() if len(doc) > 0 else ""
        if not first_page_text:
            logger.info("Scanned PDF — trying parallel OCR Nepali TOC parser...")
            def _ocr_toc_page(pi):
                d = fitz.open(stream=pdf_bytes, filetype="pdf")
                pix = d[pi].get_pixmap(dpi=300)
                d.close()
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                return pi, pytesseract.image_to_string(img, lang='nep+eng', config='--psm 6')
            ocr_pages = {}
            n_toc_pages = min(10, len(doc))
            with ThreadPoolExecutor(max_workers=min(n_toc_pages, 8)) as ex:
                for pi, text in ex.map(_ocr_toc_page, range(n_toc_pages)):
                    ocr_pages[pi] = text
            nepali_toc = _parse_nepali_toc_from_texts(ocr_pages, max_pages=len(doc))
            if prefer_toc(toc_map, nepali_toc):
                toc_map = nepali_toc
                toc_quality = assess_toc_quality(toc_map)

            # If the Nepali parser didn't win, the scanned book is probably
            # English (e.g. grade-9 science). Try the English OCR-aware
            # single-line parser as an additional fallback.
            if assess_toc_quality(toc_map) == "low":
                english_ocr_toc = _parse_english_toc_from_ocr(ocr_pages)
                if prefer_toc(toc_map, english_ocr_toc):
                    logger.info(
                        f"English OCR TOC parser extracted "
                        f"{len(english_ocr_toc)} entries"
                    )
                    toc_map = english_ocr_toc
                    toc_quality = assess_toc_quality(toc_map)

    # ── Final quality gate: discard garbage TOC rather than pollute chunk metadata ──
    # Scanned-image PDFs stitched from phone photos embed filenames as bookmarks
    # (e.g. "New Doc 02-29-2024", "sci7 unit1 79-5-23"). Using these tags makes
    # retrieval worse — better to have no chapter tag than a wrong one.
    if assess_toc_quality(toc_map) == "low":
        logger.warning(
            f"Discarding low-quality TOC ({len(toc_map)} entries, "
            f"sample: {list(toc_map.values())[:3]}). Chunks will have no chapter tags."
        )
        toc_map = {}

    if toc_map:
        logger.info(f"Final TOC with {len(toc_map)} chapters/units: {list(toc_map.values())[:8]}...")
    else:
        logger.warning("No TOC found — chunks will not have chapter tags")
    
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

        # Guard: if >30% of pages already yielded text, this is a text-layer PDF.
        # Blank pages are diagrams/figures — OCR-ing them is slow and returns noise.
        if scan_indices and num_pages > 0:
            text_page_ratio = len(page_texts) / num_pages
            if text_page_ratio > 0.3:
                logger.info(
                    f"Text-layer PDF ({text_page_ratio:.0%} pages have text). "
                    f"Skipping OCR for {len(scan_indices)} blank/figure pages."
                )
                scan_indices = []

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

    # ─── STEP 2.6: TOC page-drift correction ───
    # For scanned books where OCR TOC page numbers don't match the physical
    # PDF pages (e.g. grade-9 science had front-matter offsetting every
    # chapter), scan nearby pages for the actual chapter title and correct
    # the toc_map. Safe no-op on already-correct TOCs.
    if toc_map:
        toc_map = _validate_and_correct_toc_pages(toc_map, page_texts)

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

            # Per-section chunk sizes (RAGAS: chunking overhaul)
            sec_size, sec_overlap = _chunk_params(section_type)

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
                sub_chunks = split_text_semantic(section_text, sec_size, sec_overlap)
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

                sub_chunks = split_text_semantic(section_text, sec_size, sec_overlap)
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

    # Filter and merge small chunks (section-type-aware thresholds)
    chunks = filter_and_merge_small_chunks(chunks)

    # ─── STEP 3.5: Formula+Example co-location pass (math books) ───
    # Adjacent content(with formula) + example pairs get merged into
    # `formula_with_example` sections so the retriever never returns one
    # without the other.
    chunks = colocate_formula_examples(chunks)

    # ─── STEP 3.6: Validate math-notation reconstruction ───
    validate_math_chunks(chunks)

    # ─── STEP 3.7: Enrich with metadata + sentence-window context ───
    chunks = enrich_chunks_with_metadata_and_context(chunks)

    # ─── STEP 4: Create dedicated TOC summary chunk ───
    if toc_map:
        # Header keywords improve structural-query retrieval ("list chapters",
        # "what topics", "book contents") without bloating the chunk — the
        # body below already contains every chapter title verbatim.
        toc_text = (
            "Table of Contents — Complete list of all chapters, units, "
            "lessons, topics, subjects and syllabus covered in this textbook. "
            "This is the full index of what the book teaches:\n\n"
        )
        for page_num, title in sorted(toc_map.items()):
            toc_text += f"• {title} (starts on Page {page_num})\n"
        toc_text += f"\nTotal: {len(toc_map)} chapters/units in this textbook."
        
        toc_chunk = {
            "text": toc_text,
            "page": 1,
            "chapter": "Table of Contents",
            "section_type": "toc",
            "heading": "Table of Contents",
            "token_count": count_tokens(toc_text),
            "original_text": toc_text,
            "subject_hint": "unknown",
            "has_formula": False,
            "has_definition": False,
            "text_with_context": toc_text,
        }
        chunks.insert(0, toc_chunk)  # Put TOC first
        logger.info(f"Created dedicated TOC chunk with {len(toc_map)} entries")
    
    logger.info(f"Final chunk count: {len(chunks)}")
    logger.info(f"Chapters detected: {set(c['chapter'] for c in chunks)}")
    return chunks


# Section-type-aware min-size thresholds for small-chunk merging.
# Old behavior used a single global min_size=80, which meant orphaned
# headings / page numbers (<150 tokens but >80) slipped through as separate
# chunks for content sections. Exercise sub-items can legitimately be short
# (one MCQ + 4 options fits in ~60 tokens), so they use a lower threshold.
_MERGE_MIN_SIZE_BY_TYPE: Dict[str, int] = {
    "content": 150,
    "reading": 150,
    "example": 120,
    "exercise_mcq": 60,
    "exercise_fitb": 60,
    "exercise_fullform": 60,
    "exercise_technical_terms": 60,
    "exercise_qa": 100,
    "exercise": 100,
    "activity": 120,
    "project": 120,
    "comprehension": 100,
    "vocabulary": 100,
    "critical_thinking": 100,
    "grammar": 120,
    "writing": 120,
    "speaking": 80,
    "listening": 80,
}
_DEFAULT_MERGE_MIN_SIZE = 100


def _min_size_for(section_type: str) -> int:
    """Return the small-chunk merge threshold for a given section type."""
    return _MERGE_MIN_SIZE_BY_TYPE.get(section_type, _DEFAULT_MERGE_MIN_SIZE)


def filter_and_merge_small_chunks(
    chunks: List[Dict], min_size: Optional[int] = None
) -> List[Dict]:
    """
    Remove tiny chunks and merge small adjacent chunks.
    Section-type aware: only merges chunks of the SAME section_type and chapter,
    and the per-type threshold comes from `_MERGE_MIN_SIZE_BY_TYPE`.

    The `min_size` arg is retained for backward compatibility — if passed, it
    overrides the per-type thresholds (legacy behavior).

    Greedy merge for 'example' chunks: keeps absorbing consecutive small examples
    until the combined size reaches the example chunk window.
    """
    filtered = []
    i = 0

    example_window = CHUNK_CONFIG.get("example", {}).get("size", 1200)

    while i < len(chunks):
        current = chunks[i]

        # Skip tiny administrative chunks (headers/footers from early pages)
        if current['token_count'] < 40 and current['page'] < 5:
            i += 1
            continue

        cur_type = current.get('section_type', 'content')
        cur_chapter = current['chapter']
        cur_min = min_size if min_size is not None else _min_size_for(cur_type)

        # Greedy merge for small example chunks (Math books produce many tiny ones)
        if cur_type == 'example' and current['token_count'] < example_window:
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
                if combined > example_window:
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
        if current['token_count'] < cur_min and i + 1 < len(chunks):
            next_chunk = chunks[i + 1]

            same_chapter = next_chunk['chapter'] == cur_chapter
            same_type = next_chunk.get('section_type') == cur_type

            if same_chapter and same_type:
                merged_tokens = current['token_count'] + next_chunk['token_count']
                # Cap at the section-type's own window rather than a global constant
                type_window = CHUNK_CONFIG.get(cur_type, {}).get("size", CHUNK_SIZE)

                if merged_tokens <= type_window:
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
    """Split text into chunks of max `chunk_size` tokens with overlap.

    Raw token-window split — kept as a fallback. Prefer `split_text_semantic`
    in the main pipeline since it respects paragraph boundaries.
    """
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
# CHUNK METADATA ENRICHMENT — subject/formula/definition hints + sentence window
# =============================================================================

# Definition markers (English + Nepali)
_DEFINITION_MARKERS = (
    "is defined as", "are defined as",
    "is called", "are called",
    "refers to", "refer to",
    "is known as", "are known as",
    "means that", "can be defined",
    # Nepali
    "भनिन्छ", "भन्नाले", "परिभाषा",
)

# Formula/math indicators — ASCII operators and common math unicode
_FORMULA_CHARS = set("=√∑∫±²³^≤≥≠≈∠∩∪⊂⊃πθαβγδϕψλ°÷×∆")
_FORMULA_TOKEN_RE = re.compile(
    r"(?:\d+\s*[+\-*/=]\s*\d+|\b(?:sin|cos|tan|log|ln|sqrt)\b|"
    r"\b[a-zA-Z]\^?\d|\b[a-zA-Z]\s*=\s*\d)"
)


def _infer_subject_hint(chapter: str) -> str:
    """Infer a coarse subject hint from the chapter/unit title.

    Used at index time so retrieval can bias toward the right subject without
    running `_detect_subject` on the query-only heuristic. Returns one of:
    math, science, english, nepali, social, computer, unknown.
    """
    if not chapter or chapter == "Unknown":
        return "unknown"

    c = chapter.lower()

    # Computer / IT cues
    if any(k in c for k in (
        "computer", "information technology", "ict", "database",
        "programming", "qbasic", "c program", "networking",
        "telecommunication", "hardware", "software", "internet",
    )):
        return "computer"

    # Math cues
    if any(k in c for k in (
        "math", "algebra", "geometry", "trigonometry", "arithmetic",
        "statistics", "probability", "calculus", "mensuration", "sets",
        "number system", "equation", "polynomial", "quadratic",
        "area", "volume", "surface area", "sequence", "series",
        "compound interest", "simple interest", "tax", "commission",
        "factorization", "factorisation", "indices", "ratio and proportion",
        "prism", "sphere", "cylinder", "cone", "pyramid",
        "linear equation", "matrix", "vector", "mean", "median", "mode",
        "household arithmetic",
    )):
        return "math"

    # Science cues
    if any(k in c for k in (
        "science", "physics", "chemistry", "biology", "ecology",
        "matter", "energy", "force", "motion", "cell", "organism",
        "environment", "plant", "animal", "atom", "molecule",
    )):
        return "science"

    # Social / civics cues
    if any(k in c for k in (
        "social", "society", "culture", "history", "geography",
        "civics", "citizenship", "democracy", "government",
        "economy", "population", "political",
        "समाज", "संस्कृति", "इतिहास", "भूगोल", "नागरिक", "सरकार",
    )):
        return "social"

    # Nepali language cues
    if any(k in c for k in (
        "nepali", "nepāli", "नेपाली", "पाठ", "कविता", "निबन्ध",
        "व्याकरण",
    )):
        return "nepali"

    # English language cues
    if any(k in c for k in (
        "english", "grammar", "reading", "poem", "story", "essay",
        "composition", "literature",
    )):
        return "english"

    return "unknown"


def _has_formula(text: str) -> bool:
    """Return True if the chunk text contains formula-like content.

    Heuristic: presence of math unicode, or common ASCII math tokens like
    `x = 5`, `2 + 3`, `sin(θ)`, `a^2`. Intentionally noisy — a false positive
    is cheap (a minor retrieval boost); a false negative silently hurts math
    recall.
    """
    if not text:
        return False
    # Fast path: any formula char at all
    if any(c in _FORMULA_CHARS for c in text):
        return True
    # Slow path: regex for multi-char patterns
    return bool(_FORMULA_TOKEN_RE.search(text))


def _has_definition(text: str) -> bool:
    """Return True if the chunk likely contains a definition.
    Checks English and Nepali definition markers.
    """
    if not text:
        return False
    low = text.lower()
    return any(marker in low or marker in text for marker in _DEFINITION_MARKERS)


# Sentence splitter: supports English `.!?` and Devanagari danda `।`.
# Python's stdlib `re` doesn't allow variable-width lookbehinds, so we split
# naively and then re-glue false splits caused by common abbreviations.
_SENT_SPLIT_RE = re.compile(r"(?<=[.!?।])\s+")
_ABBREVIATIONS = (
    "mr.", "mrs.", "ms.", "dr.", "jr.", "sr.", "st.", "vs.", "etc.",
    "e.g.", "i.e.", "cf.", "fig.", "no.", "vol.",
)


def _split_sentences(text: str) -> List[str]:
    """Split text into sentences across English + Devanagari punctuation.
    Returns a list of trimmed, non-empty sentences. Re-joins fragments whose
    boundary was created by a known abbreviation (e.g. "Mr. Smith").
    """
    if not text or not text.strip():
        return []
    parts = _SENT_SPLIT_RE.split(text.strip())
    cleaned = [p.strip() for p in parts if p.strip()]
    if not cleaned:
        return []

    # Re-glue abbreviations: if a fragment ends with a known abbreviation,
    # merge it with the next fragment.
    merged: List[str] = []
    i = 0
    while i < len(cleaned):
        curr = cleaned[i]
        while (
            i + 1 < len(cleaned)
            and any(curr.lower().endswith(abbr) for abbr in _ABBREVIATIONS)
        ):
            curr = curr + " " + cleaned[i + 1]
            i += 1
        merged.append(curr)
        i += 1
    return merged


def _build_context_window(
    prev_text: Optional[str],
    curr_text: str,
    next_text: Optional[str],
    tail_sents: int = 2,
    head_sents: int = 2,
) -> str:
    """Return `curr_text` with the last 1–2 sentences of `prev_text` prepended
    and the first 1–2 sentences of `next_text` appended.

    Used to populate `text_with_context` so the LLM sees cross-boundary context
    without doubling chunk count. Improves RAGAS context-recall directly.
    """
    pieces: List[str] = []

    if prev_text:
        prev_sents = _split_sentences(prev_text)
        if prev_sents:
            pieces.append(" ".join(prev_sents[-tail_sents:]))

    pieces.append(curr_text)

    if next_text:
        next_sents = _split_sentences(next_text)
        if next_sents:
            pieces.append(" ".join(next_sents[:head_sents]))

    return "\n\n".join(pieces)


# =============================================================================
# MATH-SPECIFIC POST-PROCESSING — formula/example merging + validation
# =============================================================================

# Single-letter variable regex (skips keywords like "a", "I", "e")
_VARIABLE_RE = re.compile(r"(?<![A-Za-z])([A-Za-z])(?![A-Za-z])")

# Common English articles/prepositions to exclude when extracting variables
_NON_VARIABLE_LETTERS = set("aAiIeEoOuU")  # vowels often stand for articles


def _extract_single_letter_vars(text: str) -> set:
    """Extract single-letter variable names from a math chunk.

    Used to detect when a content section (with a formula) and the following
    example section share variable names — a strong signal they should stay
    together.
    """
    if not text:
        return set()
    found = set(_VARIABLE_RE.findall(text))
    # Drop vowels — usually articles, not variables
    return {v for v in found if v not in _NON_VARIABLE_LETTERS}


def colocate_formula_examples(chunks: List[Dict]) -> List[Dict]:
    """Merge adjacent `content`(with formula) + `example` chunks that share
    variables into a single `formula_with_example` chunk.

    Runs after `filter_and_merge_small_chunks` and before metadata enrichment.
    Prevents retrieval from returning a worked example without its defining
    formula (or vice versa), which is a common RAGAS context-precision failure
    for Math books.

    Rules:
      - `content` chunk must have `_has_formula == True`
      - Next chunk must be `example` in the SAME chapter
      - They must share at least 2 single-letter variables
      - Merged size ≤ `CHUNK_CONFIG['formula_with_example']['size']`
    """
    if not chunks:
        return chunks

    merged: List[Dict] = []
    max_merged = CHUNK_CONFIG.get(
        "formula_with_example", {"size": 1500}
    )["size"]

    i = 0
    while i < len(chunks):
        cur = chunks[i]
        cur_type = cur.get("section_type", "content")
        cur_text = cur.get("text", "")

        if (
            cur_type == "content"
            and _has_formula(cur_text)
            and i + 1 < len(chunks)
        ):
            nxt = chunks[i + 1]
            nxt_type = nxt.get("section_type", "")
            same_chapter = nxt.get("chapter") == cur.get("chapter")

            if nxt_type == "example" and same_chapter:
                cur_vars = _extract_single_letter_vars(cur_text)
                nxt_vars = _extract_single_letter_vars(nxt.get("text", ""))
                shared = cur_vars & nxt_vars

                combined_tokens = (
                    cur.get("token_count", 0) + nxt.get("token_count", 0)
                )

                if len(shared) >= 2 and combined_tokens <= max_merged:
                    merged_text = cur_text + "\n\n" + nxt.get("text", "")
                    merged_orig = (
                        cur.get("original_text", cur_text)
                        + "\n\n"
                        + nxt.get("original_text", nxt.get("text", ""))
                    )
                    merged.append({
                        "text": merged_text,
                        "original_text": merged_orig,
                        "page": cur.get("page"),
                        "chapter": cur.get("chapter"),
                        "section_type": "formula_with_example",
                        "heading": cur.get("heading") or nxt.get("heading", ""),
                        "token_count": combined_tokens,
                    })
                    logger.debug(
                        "colocate_formula_examples: merged formula+example "
                        f"on page {cur.get('page')} (shared vars: {shared})"
                    )
                    i += 2
                    continue

        merged.append(cur)
        i += 1

    return merged


# Pattern that catches a numerator (short math-y line) followed by an empty/
# short denominator line that reconstruction missed.
_UNMATCHED_FRAC_RE = re.compile(
    r"^\s*[\w\d+\-*×÷√π]+\s*$\n^\s*[\w\d]{1,3}\s*$",
    re.MULTILINE,
)


def validate_math_chunks(chunks: List[Dict]) -> None:
    """Log a WARNING per page where fraction reconstruction may have failed.

    Detects patterns like a very short line followed by another very short
    line with no operator between them — which typically means the
    `reconstruct_fractions` pass missed something. Used purely for visibility
    (no chunk mutation).
    """
    if not chunks:
        return

    page_miss: Dict[int, int] = {}
    for ch in chunks:
        # Only math-ish chunks
        if not (_has_formula(ch.get("text", ""))
                or ch.get("section_type") == "example"
                or ch.get("section_type") == "formula_with_example"):
            continue
        count = len(_UNMATCHED_FRAC_RE.findall(ch.get("text", "")))
        if count:
            page = ch.get("page", 0)
            page_miss[page] = page_miss.get(page, 0) + count

    for page, count in sorted(page_miss.items()):
        logger.warning(
            f"validate_math_chunks: page {page} has {count} possible "
            f"unreconstructed fraction pattern(s)"
        )


def enrich_chunks_with_metadata_and_context(
    chunks: List[Dict],
) -> List[Dict]:
    """Post-chunking pass: add `subject_hint`, `has_formula`, `has_definition`,
    and `text_with_context` fields to each chunk.

    - `text` stays as the original chunk body (for display / citations).
    - `text_with_context` is `text` plus the tail/head of its chapter siblings
      (for LLM prompting).
    - Metadata flags are computed from the ORIGINAL chunk text, not the
      context-enriched version, so boosts reflect the chunk's own content.

    All fields are optional for backward compatibility. SQL to add columns:
        -- ALTER TABLE chunks
        --   ADD COLUMN subject_hint TEXT,
        --   ADD COLUMN has_formula BOOLEAN DEFAULT FALSE,
        --   ADD COLUMN has_definition BOOLEAN DEFAULT FALSE,
        --   ADD COLUMN text_with_context TEXT;
    """
    if not chunks:
        return chunks

    # Group chunks by chapter so the context window never crosses chapters
    # (prevents leaking unrelated content across unit boundaries).
    n = len(chunks)
    for i, chunk in enumerate(chunks):
        text = chunk.get("text", "") or ""
        chapter = chunk.get("chapter", "")

        # Metadata flags (from original text)
        chunk["subject_hint"] = _infer_subject_hint(chapter)
        chunk["has_formula"] = _has_formula(text)
        chunk["has_definition"] = _has_definition(text)

        # Sentence-window context (only within same chapter)
        prev_text = None
        next_text = None
        if i > 0 and chunks[i - 1].get("chapter") == chapter:
            prev_text = chunks[i - 1].get("text", "")
        if i + 1 < n and chunks[i + 1].get("chapter") == chapter:
            next_text = chunks[i + 1].get("text", "")

        chunk["text_with_context"] = _build_context_window(
            prev_text, text, next_text
        )

    return chunks


def split_text_semantic(
    text: str,
    chunk_size: int,
    overlap: int,
    tail_fraction: float = 0.15,
) -> List[str]:
    """Split text into chunks of ~`chunk_size` tokens, respecting paragraph
    and sentence boundaries when possible.

    Strategy:
        1. Walk the text in token windows of `chunk_size`.
        2. Within the last `tail_fraction` (default 15%) of each window, look
           backwards for the nearest safe break, in priority order:
             (a) double-newline  (paragraph boundary)
             (b) single-newline  (line break)
             (c) sentence terminator (. ! ? । — Devanagari danda)
        3. If none found, fall back to the raw token cut — identical to
           `split_text_by_tokens`.
        4. Next window starts `overlap` tokens before the previous cut.

    This prevents mid-sentence slicing which hurts RAGAS context-recall.
    """
    if not text:
        return []

    enc = tiktoken.get_encoding("cl100k_base")
    tokens = enc.encode(text)
    total = len(tokens)
    if total == 0:
        return []
    if total <= chunk_size:
        return [text]

    chunks: List[str] = []
    start = 0
    tail_size = max(1, int(chunk_size * tail_fraction))

    while start < total:
        hard_end = min(start + chunk_size, total)

        # If we're at the very end, take whatever remains
        if hard_end >= total:
            chunk_text = enc.decode(tokens[start:total])
            if chunk_text.strip():
                chunks.append(chunk_text)
            break

        # Decode the full candidate window and search its tail for a break
        window_text = enc.decode(tokens[start:hard_end])
        tail_start_char = len(enc.decode(tokens[start:hard_end - tail_size]))
        # Search region: from tail_start_char → end of window
        tail_region = window_text[tail_start_char:]

        # Priority (a): double-newline
        cut_char = tail_region.rfind("\n\n")
        # Priority (b): single newline
        if cut_char < 0:
            cut_char = tail_region.rfind("\n")
        # Priority (c): sentence terminator
        if cut_char < 0:
            for term in (". ", "! ", "? ", "। ", ".\n", "!\n", "?\n", "।\n"):
                pos = tail_region.rfind(term)
                if pos > cut_char:
                    cut_char = pos + len(term) - 1  # include the terminator

        if cut_char >= 0:
            absolute_cut = tail_start_char + cut_char
            chunk_text = window_text[:absolute_cut].strip()
            if chunk_text:
                chunks.append(chunk_text)
            # Re-tokenize the emitted text to compute where to resume
            emitted_tokens = len(enc.encode(chunk_text))
            # Guard against pathological cases (e.g. cut at position 0)
            if emitted_tokens <= 0:
                emitted_tokens = chunk_size  # fall back to hard cut
            advance = max(1, emitted_tokens - overlap)
            start += advance
        else:
            # No natural break within the last 15% — raw token cut
            chunk_text = enc.decode(tokens[start:hard_end])
            if chunk_text.strip():
                chunks.append(chunk_text)
            start += max(1, chunk_size - overlap)

    return chunks


# =============================================================================
# RETRIEVAL HELPERS — keyword hints, MMR, structural filtering
# =============================================================================

# Tokens to drop when extracting keywords — very common English + Nepali
# stopwords plus question-framing words that add no retrieval signal.
_STOPWORDS = {
    # English
    "the", "a", "an", "of", "to", "in", "is", "are", "was", "were",
    "be", "been", "being", "on", "at", "by", "for", "with", "about",
    "from", "up", "as", "into", "than", "then", "that", "this", "these",
    "those", "i", "you", "he", "she", "it", "we", "they", "what",
    "which", "who", "whom", "how", "why", "where", "when", "can",
    "could", "would", "should", "does", "do", "did", "has", "have",
    "had", "but", "or", "not", "no", "yes", "so", "if", "and", "all",
    "any", "each", "some", "such", "only", "own", "same", "just",
    "tell", "me", "explain", "define", "list", "give", "show",
    # Nepali stopwords (common)
    "को", "का", "की", "मा", "र", "छ", "हो", "हुन्", "छन्", "थिए",
    "थियो", "छैन", "छैनन्", "भन्ने", "त", "पनि", "तर", "या",
    "के", "कति", "कसरी", "कहाँ", "कहिले", "किन", "अनि", "मलाई",
}

# Math terms worth keeping even if short (< 3 chars)
_SHORT_KEEP = {"pi", "x", "y", "z", "π", "θ", "%"}


def extract_keywords(question: str, top_k: int = 5) -> List[str]:
    """Extract 3–`top_k` domain keywords from a question.

    Simple lexical heuristic: lowercase-tokenize on word boundaries,
    drop stopwords, prefer longer words and known math/science terms, and
    return up to `top_k` unique keywords in descending priority order.

    Used as a `must_contain_hint` to boost chunks that contain multiple
    query keywords before the cross-encoder reranks them.
    """
    if not question:
        return []

    # Tokenize: keep alphanumerics + Devanagari block
    raw = re.findall(r"[\w\u0900-\u097F]+", question.lower(), re.UNICODE)

    # Score each token
    scored: List[Tuple[int, str]] = []
    seen = set()
    for tok in raw:
        if tok in seen:
            continue
        if tok in _STOPWORDS:
            continue
        if len(tok) < 3 and tok not in _SHORT_KEEP:
            continue
        seen.add(tok)
        # Longer words score higher; pure digits score lower
        score = len(tok)
        if tok.isdigit():
            score -= 3
        scored.append((score, tok))

    scored.sort(key=lambda t: t[0], reverse=True)
    return [tok for _, tok in scored[:max(top_k, 3)]]


def keyword_boost_score(
    chunk_text: str, keywords: List[str], min_matches: int = 2
) -> float:
    """Return a boost multiplier in [1.0, 1.25] for a chunk based on how
    many of `keywords` it contains. 0 matches → 1.0, `min_matches`+ → 1.25.

    Apply this BEFORE the cross-encoder rerank step:
        base = cosine_sim
        boosted = base * keyword_boost_score(chunk.text, kws)
    """
    if not keywords or not chunk_text:
        return 1.0
    low = chunk_text.lower()
    hits = sum(1 for kw in keywords if kw in low)
    if hits >= min_matches:
        return 1.25
    if hits == 1:
        return 1.1
    return 1.0


def mmr_select(
    candidates: List[Dict],
    query_embedding: Optional[list] = None,
    top_k: int = 5,
    diversity_threshold: float = 0.85,
    embedding_key: str = "embedding",
) -> List[Dict]:
    """Maximal Marginal Relevance selection to reduce redundancy.

    Given `candidates` (already ordered by relevance — e.g. reranked by the
    cross-encoder), iteratively selects the next candidate only if its cosine
    similarity to every already-selected chunk is below `diversity_threshold`.

    Args:
        candidates: list of chunk dicts, each with an `embedding_key` field
            holding a list[float] embedding. Must be pre-sorted by relevance.
        query_embedding: unused — kept for API symmetry with other MMR impls.
        top_k: number of chunks to return.
        diversity_threshold: cosine sim above which a candidate is considered
            too similar to an already-selected chunk.
        embedding_key: dict key holding the embedding vector.

    Returns:
        Up to `top_k` chunks, preserving the original relevance order but
        skipping near-duplicates.
    """
    if not candidates:
        return []

    try:
        import numpy as np  # local import — numpy is already a hard dep
    except ImportError:
        logger.warning("numpy unavailable — mmr_select falling back to top_k slice")
        return candidates[:top_k]

    def _vec(c: Dict):
        emb = c.get(embedding_key)
        if emb is None:
            return None
        arr = np.asarray(emb, dtype=np.float32)
        norm = np.linalg.norm(arr)
        if norm == 0:
            return None
        return arr / norm

    selected: List[Dict] = []
    selected_vecs: List = []

    for cand in candidates:
        if len(selected) >= top_k:
            break
        v = _vec(cand)
        # If the candidate has no embedding, accept it (no dedup possible)
        if v is None:
            selected.append(cand)
            continue
        # Check cosine sim against already-selected
        too_similar = False
        for sv in selected_vecs:
            sim = float(np.dot(v, sv))
            if sim >= diversity_threshold:
                too_similar = True
                break
        if not too_similar:
            selected.append(cand)
            selected_vecs.append(v)

    # If we didn't reach top_k (everything was too similar), fall back to
    # topping up with the next best candidates ignoring diversity.
    if len(selected) < top_k:
        seen_ids = {id(s) for s in selected}
        for cand in candidates:
            if len(selected) >= top_k:
                break
            if id(cand) not in seen_ids:
                selected.append(cand)

    return selected


def filter_structural_chunks(chunks: List[Dict]) -> List[Dict]:
    """Return chunks suitable for a structural/TOC-type query.

    1. Always include the dedicated `section_type == "toc"` chunk if present.
    2. Include one chunk per distinct chapter (first by page) for any chapter
       that is not "Unknown".
    3. Semantic reranking is skipped for these queries by the caller.
    """
    if not chunks:
        return []

    toc_chunks = [c for c in chunks if c.get("section_type") == "toc"]

    seen_chapters: set = set()
    per_chapter: List[Dict] = []
    # Sort by page so the "first chunk per chapter" is well-defined
    for c in sorted(chunks, key=lambda x: x.get("page", 0)):
        chap = c.get("chapter") or "Unknown"
        if chap in ("Unknown", "Table of Contents"):
            continue
        if chap in seen_chapters:
            continue
        seen_chapters.add(chap)
        per_chapter.append(c)

    return toc_chunks + per_chapter


_EXERCISE_REF_RE = re.compile(
    r'\b(?:exercise|ex\.?)\s*(\d+(?:\.\d+)?)',
    re.IGNORECASE,
)
_NEPALI_EXERCISE_REF_RE = re.compile(
    r'अभ्यास\s*([\d०-९]+(?:\.[\d०-९]+)?)'
)


def extract_exercise_ref(question: str) -> Optional[str]:
    """Return a canonicalized `Exercise N` / `Exercise N.M` label found in
    the query, or None if none is referenced.

    Used by the retrieval layer to short-circuit questions like "show me
    exercise 5.2 on quadratic equations" — semantic search alone can find
    the right chapter but not the exact exercise number, since the number
    is structural metadata, not meaning.
    """
    if not question:
        return None
    m = _EXERCISE_REF_RE.search(question)
    if m:
        return f"Exercise {m.group(1)}"
    m = _NEPALI_EXERCISE_REF_RE.search(question)
    if m:
        # Convert Devanagari digits to ASCII for matching
        num = m.group(1).translate(_DEVANAGARI_DIGIT_MAP)
        return f"अभ्यास {num}"
    return None


def filter_by_exercise_ref(chunks: List[Dict], ref: str) -> List[Dict]:
    """Return chunks whose heading or text-head matches the exercise `ref`.

    Matching is strict-ish: the ref must appear as a word-bounded token to
    avoid `Exercise 5.2` spuriously matching `Exercise 5.20`. Prefers chunks
    where the heading is exactly the ref, falling back to any chunk whose
    first 200 chars contain the ref (covers headings that were absorbed
    into a larger chunk by small-chunk merging).
    """
    if not ref or not chunks:
        return []
    ref_lower = ref.lower()
    # Word-bounded regex so "Exercise 5.2" doesn't match "Exercise 5.20"
    token_re = re.compile(
        r'(?<![\d.])' + re.escape(ref_lower) + r'(?!\d)',
        re.IGNORECASE,
    )

    # Tier 1: exact heading match
    exact: List[Dict] = []
    for c in chunks:
        heading = (c.get("heading") or "").strip().lower()
        if heading == ref_lower or heading.startswith(ref_lower + " ") \
                or heading.startswith(ref_lower + "\n"):
            exact.append(c)
    if exact:
        return exact

    # Tier 2: reference appears early in the chunk text (within first 200 chars)
    partial: List[Dict] = []
    for c in chunks:
        head = (c.get("text", "") or "")[:200]
        if token_re.search(head):
            partial.append(c)
    return partial


def is_structural_query(question: str) -> bool:
    """Return True if the question asks about the book's structure/TOC.

    Centralized so both the prompt builder and the retrieval layer agree on
    what counts as a structural query (they must, or chapter-filtering and
    reranking behavior will diverge).
    """
    if not question:
        return False
    q = question.lower()
    return any(k in q for k in (
        "chapter", "unit", "table of contents", "toc", "topics",
        "syllabus", "index", "what are the", "list all",
        "how many units", "how many chapters",
        # Devanagari
        "अध्याय", "पाठ", "एकाइ", "विषय सूची",
    ))


# =============================================================================
# PROMPT BUILDING — Teacher persona with chapter context
# =============================================================================

# =============================================================================
# SUBJECT-SPECIFIC PROMPTS — Specialized templates for different subjects
# =============================================================================

def _detect_subject(question: str, context_docs: List[Dict]) -> str:
    """Detect subject area from question and context.
    
    IMPORTANT: Only return 'math' if we're confident it's a math question.
    False positives hurt non-math subjects significantly.
    """
    # Strong math indicators (high confidence)
    strong_math_keywords = {
        'equation', 'formula', 'solve', 'calculate', 'theorem', 'proof',
        'derivative', 'integral', 'quadratic', 'polynomial', 'factorize',
        'simplify', 'algebraic', 'arithmetic', 'geometric sequence',
        'trigonometry', 'sine', 'cosine', 'tangent', 'hypotenuse',
        'pythagorean', 'logarithm', 'exponent', 'coefficient',
        'circumference', 'radius', 'diameter', 'perimeter'
    }
    
    # Weak math indicators (need multiple matches)
    weak_math_keywords = {
        'angle', 'triangle', 'square', 'circle', 'area', 'volume',
        'graph', 'probability', 'statistics', 'mean', 'median', 'mode',
        'sets', 'union', 'intersection', 'subset', 'matrix', 'vector'
    }
    
    # Non-math indicators (if present, NOT math)
    non_math_keywords = {
        'poem', 'story', 'grammar', 'tense', 'noun', 'verb', 'adjective',
        'character', 'plot', 'author', 'literature', 'reading', 'writing',
        'society', 'culture', 'history', 'government', 'democracy', 'religion',
        'festival', 'tradition', 'population', 'geography', 'climate',
        'chapter', 'unit', 'lesson', 'exercise', 'answer'  # structural queries
    }
    
    # Nepali non-math keywords (social studies, culture)
    nepali_non_math = {
        'समाज', 'संस्कृति', 'इतिहास', 'सरकार', 'लोकतन्त्र', 'धर्म',
        'चाडपर्व', 'परम्परा', 'जनसङ्ख्या', 'भूगोल', 'हावापानी',
        'मूल्य', 'संस्कार', 'अधिकार', 'विकास', 'प्रदेश'
    }
    
    question_lower = question.lower()
    
    # Check for Nepali non-math first (social studies topics)
    if any(kw in question for kw in nepali_non_math):
        return 'general'
    
    # Check for English non-math keywords
    if any(kw in question_lower for kw in non_math_keywords):
        return 'general'
    
    # Check context chapters for math-related chapters
    chapter_names = ' '.join([d.get('chapter', '').lower() for d in context_docs])
    math_chapter_indicators = {'math', 'algebra', 'geometry', 'trigonometry', 
                               'calculus', 'statistics', 'arithmetic', 'sets'}
    is_math_chapter = any(ind in chapter_names for ind in math_chapter_indicators)
    
    # Count keyword matches
    combined = question_lower + ' ' + chapter_names
    strong_score = sum(1 for kw in strong_math_keywords if kw in combined)
    weak_score = sum(1 for kw in weak_math_keywords if kw in combined)
    
    # Decision logic:
    # - 1+ strong keyword = math
    # - 3+ weak keywords = math  
    # - Math chapter + 2+ weak keywords = math
    # - Otherwise = general
    if strong_score >= 1:
        return 'math'
    if weak_score >= 3:
        return 'math'
    if is_math_chapter and weak_score >= 2:
        return 'math'
    
    return 'general'


def _get_math_system_prompt(question: str) -> str:
    """Specialized system prompt for mathematics questions"""
    
    # Detect question type
    if any(word in question.lower() for word in ['prove', 'show', 'derive']):
        question_type = "PROOF"
        format_guide = """
PROOF FORMAT:
1. **Claim:** State what you're proving
2. **Given:** What are we assuming?
3. **Steps:** Number each logical step
4. **Conclusion:** What follows from the proof
5. **Applications:** Where is this used?
"""
    elif any(word in question.lower() for word in ['solve', 'find', 'calculate', 'compute']):
        question_type = "CALCULATION"
        format_guide = """
CALCULATION FORMAT:
1. **Given:** What values/conditions are known?
2. **Find:** What are we looking for?
3. **Formula:** Which formula/method applies?
4. **Substitution:** Show the values plugged in
5. **Steps:** Number each calculation step clearly
6. **Answer:** Final result with units/notation
7. **Check:** Verify the answer makes sense
"""
    else:
        question_type = "DEFINITION/CONCEPT"
        format_guide = """
DEFINITION FORMAT:
1. **Name:** The exact term being defined
2. **Formula (if applicable):** Mathematical form with proper notation
3. **Variables:** Define each symbol (e.g., "Let a = length in cm")
4. **Explanation:** 2-3 sentences about the concept
5. **Example:** One or two concrete numerical examples
6. **Key Insight:** Why this concept matters or how to remember it
"""
    
    return f"""You are an expert mathematics teacher with PhD-level knowledge.

YOUR TASK: Answer a {question_type} question using ONLY the provided textbook excerpts.

{format_guide}

CRITICAL RULES:
1. **Show all formulas clearly** with proper mathematical notation (use ^, √, ≤, ≥, etc.)
2. **Define every variable** you use (e.g., "Let x = unknown value")
3. **Break into numbered steps** — never jump steps
4. **Provide concrete examples** with actual numbers, not just variables
5. **Show all arithmetic** — write "2 + 3 = 5", not "= 5"
6. **Verify your answer** by substituting back into the formula or checking the logic
7. **Use proper mathematical notation** (subscripts for a₁, superscripts for a²)
8. **Do NOT cite chapter or page numbers in the answer.** The UI displays sources separately below your response.

NEVER:
- Ramble or give vague explanations
- Skip steps in calculations or proofs
- Use unexplained symbols or notation
- Say "obviously" without explaining
- Provide answers not supported by the context

Be PRECISE, STRUCTURED, and COMPLETE."""


def _format_math_user_prompt(question: str, context_docs: List[Dict]) -> str:
    """Format context and question for math evaluation.

    Uses `text_with_context` when available (cross-boundary sentences) so the
    LLM sees stitched context that improves RAGAS context-recall. Falls back
    to `text` for legacy chunks without the enriched field.
    """
    context_str = ""
    for i, doc in enumerate(context_docs):
        page = doc.get("page", "?")
        text = (doc.get("text_with_context") or doc.get("text", "")).strip()
        chapter = doc.get("chapter", "")

        if chapter and chapter not in ["Unknown", ""]:
            header = f"[{i+1}. Chapter: {chapter} | Page {page}]"
        else:
            header = f"[{i+1}. Page {page}]"

        context_str += f"\n{header}:\n{text}\n"

    return f"""Textbook Context (from relevant sections):
{context_str}

Student Question: {question}

Provide your structured answer below:"""


def build_system_user_prompt(context_docs: List[Dict], question: str) -> Tuple[str, str]:
    """
    Build prompt with Teacher Persona.
    Improved: Subject-aware with specialized math templates.
    """
    
    # Detect subject
    subject = _detect_subject(question, context_docs)

    # Detect structural query type (centralized in is_structural_query so the
    # retrieval layer and prompt layer stay in sync).
    is_structural = is_structural_query(question)
    
    # Use specialized math template if detected
    if subject == 'math' and not is_structural:
        system_prompt = _get_math_system_prompt(question)
        user_prompt = _format_math_user_prompt(question, context_docs)
        return system_prompt, user_prompt
    
    # Default generic template for non-math subjects
    system_prompt = """You are an expert and friendly teacher.
Your goal is to help the student understand the concept using the provided educational material.

Guidelines:
1. **Be Teacher-like:** Explain simply. Use analogies when helpful.
2. **Context First:** Answer based ONLY on the provided excerpts.
3. **Direct Answers:** Give the answer directly. For short factual questions (definitions, SI units, single facts), keep answers concise — one or two sentences is often enough.
4. **Do NOT cite chapter or page numbers in your answer.** The UI shows sources separately beneath your response. Writing things like "(Chapter 2, Page 15)" or "In Unit 1..." in the answer body is redundant and clutters the reply.
5. **Honesty:** If the answer is not in the text, say so clearly.
6. **Structural Questions:** If the student asks about chapters, units, or the table of contents, list ALL chapters/units found in the provided excerpts with their page numbers in a clear, numbered format. (This is the ONE exception where chapter/page listing belongs in the answer body.)
7. **Be Comprehensive:** When listing items (chapters, topics, etc.), include ALL items from the context — do not summarize or skip any.
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
        # Prefer context-enriched text for LLM prompting (RAGAS context-recall)
        text = (doc.get("text_with_context") or doc.get("text", "")).strip()
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


# # =============================================================================
# # RAGAS EVALUATION — measure before/after impact of chunking changes
# # =============================================================================

# def run_ragas_eval(
#     samples: List[Dict],
#     metrics: Optional[List[str]] = None,
# ) -> Dict:
#     """Run RAGAS evaluation on a list of question/answer/context samples.

#     Args:
#         samples: list of dicts with keys:
#             - "question":    str, the user question
#             - "answer":      str, the model's generated answer
#             - "contexts":    List[str], the retrieved chunk texts
#             - "ground_truth": str, the reference answer (for context_recall)
#         metrics: optional list of metric names to compute. Defaults to
#             ["faithfulness", "answer_relevancy", "context_recall",
#              "context_precision"].

#     Returns:
#         Dict with the metric scores plus a `timestamp` ISO-8601 string.
#         Empty dict on failure (missing ragas, empty samples, etc.).

#     Logs the results via `logger.info` so they appear in the normal log
#     stream for before/after comparisons.
#     """
#     import datetime

#     if not samples:
#         logger.warning("run_ragas_eval: empty samples list — nothing to evaluate")
#         return {}

#     try:
#         from ragas import evaluate
#         from ragas.metrics import (
#             faithfulness,
#             answer_relevancy,
#             context_recall,
#             context_precision,
#         )
#         from datasets import Dataset
#     except ImportError as e:
#         logger.error(
#             f"run_ragas_eval: ragas or datasets not installed ({e}). "
#             "Install with: pip install ragas datasets"
#         )
#         return {}

#     metric_map = {
#         "faithfulness": faithfulness,
#         "answer_relevancy": answer_relevancy,
#         "context_recall": context_recall,
#         "context_precision": context_precision,
#     }

#     requested = metrics or list(metric_map.keys())
#     metric_objs = [metric_map[m] for m in requested if m in metric_map]

#     if not metric_objs:
#         logger.warning(f"run_ragas_eval: no valid metrics in {requested}")
#         return {}

#     # Normalize sample keys to what RAGAS expects
#     normalized = {
#         "question": [s.get("question", "") for s in samples],
#         "answer": [s.get("answer", "") for s in samples],
#         "contexts": [
#             s.get("contexts", []) if isinstance(s.get("contexts"), list)
#             else [s.get("contexts", "")]
#             for s in samples
#         ],
#         "ground_truth": [s.get("ground_truth", "") for s in samples],
#     }

#     try:
#         ds = Dataset.from_dict(normalized)
#         result = evaluate(ds, metrics=metric_objs)
#     except Exception as e:
#         logger.error(f"run_ragas_eval: evaluation failed — {e}")
#         return {}

#     # RAGAS returns a Result object; convert to plain dict
#     try:
#         scores = {k: float(v) for k, v in result.items()}
#     except Exception:
#         # Newer versions expose `.to_pandas()` — fall back to mean per column
#         try:
#             df = result.to_pandas()
#             scores = {
#                 col: float(df[col].mean())
#                 for col in df.columns
#                 if col in metric_map
#             }
#         except Exception as e:
#             logger.error(f"run_ragas_eval: could not parse result — {e}")
#             return {}

#     scores["timestamp"] = datetime.datetime.utcnow().isoformat() + "Z"
#     scores["n_samples"] = len(samples)

#     logger.info(
#         "RAGAS eval results: "
#         + ", ".join(f"{k}={v:.3f}" if isinstance(v, float) else f"{k}={v}"
#                     for k, v in scores.items())
#     )
#     return scores