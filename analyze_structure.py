import fitz  # PyMuPDF
import re

PDF_PATH = "fin_ed_docs/grade-10-science-and-technology-part-i.pdf"

def analyze_structure():
    doc = fitz.open(PDF_PATH)
    print(f"Analyzing {PDF_PATH} ({len(doc)} pages)...")
    
    # Analyze Table of Contents (usually first few pages)
    print("\n--- Potential Table of Contents ---")
    for i in range(0, min(10, len(doc))):
        text = doc[i].get_text()
        if "content" in text.lower() or "index" in text.lower() or "unit" in text.lower():
            print(f"Page {i+1}:\n{text[:500]}...\n")

    # Analyze Chapter Headers
    print("\n--- Potential Chapter Headers ---")
    patterns = [
        r"^Unit\s+\d+",
        r"^Chapter\s+\d+",
        r"^\d+\.\s+[A-Z]",  # 1. Scientific Learning
        r"^[A-Z\s]{5,}$"    # All caps headers
    ]
    
    for i in range(0, min(50, len(doc))):
        page = doc[i]
        blocks = page.get_text("dict")["blocks"]
        for b in blocks:
            if "lines" in b:
                for l in b["lines"]:
                    for s in l["spans"]:
                        text = s["text"].strip()
                        font_size = s["size"]
                        # Check for large font or patterns
                        if font_size > 12 or any(re.match(p, text) for p in patterns):
                            print(f"Page {i+1} (Size {font_size:.1f}): {text}")

if __name__ == "__main__":
    try:
        analyze_structure()
    except Exception as e:
        print(f"Error: {e}")
        # Fallback if PyMuPDF not installed, try pypdf
        print("Trying pypdf...")
        from pypdf import PdfReader
        reader = PdfReader(PDF_PATH)
        for i in range(10):
            print(f"Page {i+1}:\n{reader.pages[i].extract_text()[:200]}\n")
