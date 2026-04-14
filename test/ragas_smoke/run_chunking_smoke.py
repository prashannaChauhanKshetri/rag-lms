"""Run process_pdf on a handful of textbook PDFs from /Books and print
a per-book chunking report. Used to validate the RAGAS chunking overhaul
(CHUNK_CONFIG, split_text_semantic, context-window enrichment, etc.) on
real data before touching the database.
"""
import json
import os
import sys
import time
from collections import Counter
from pathlib import Path

# Ensure project root is on sys.path so `import utils` works from anywhere
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import utils  # noqa: E402

BOOKS_DIR = ROOT / "Books"
OUT_DIR = ROOT / "test" / "ragas_smoke"

# Keep the set small and varied: a math book, an English/reading book,
# and a Nepali-language book. Sizes chosen to stay under a few minutes.
TARGETS = [
    "grade-9-mathematics (1).pdf",   # 2.8MB — formula-heavy
    "grade-6-english.pdf",           # 4.4MB — reading-heavy
    "grade-9-nepali.pdf",            # 2.3MB — Devanagari
]


def percentile(values, p):
    if not values:
        return 0
    vs = sorted(values)
    k = (len(vs) - 1) * p / 100
    f = int(k)
    c = min(f + 1, len(vs) - 1)
    if f == c:
        return vs[f]
    return vs[f] * (c - k) + vs[c] * (k - f)


def summarize(book_name: str, chunks):
    sec_counts = Counter(c.get("section_type", "content") for c in chunks)
    subj_counts = Counter(c.get("subject_hint", "unknown") for c in chunks)
    token_counts = [c.get("token_count", 0) for c in chunks]

    with_formula = sum(1 for c in chunks if c.get("has_formula"))
    with_definition = sum(1 for c in chunks if c.get("has_definition"))
    with_context = sum(1 for c in chunks if c.get("text_with_context"))
    chapters = sorted({c.get("chapter") for c in chunks})

    sample_chunk = next(
        (c for c in chunks if c.get("section_type") == "content"
         and c.get("token_count", 0) > 200),
        chunks[1] if len(chunks) > 1 else chunks[0] if chunks else None,
    )

    report = {
        "book": book_name,
        "total_chunks": len(chunks),
        "distinct_chapters": len(chapters),
        "section_type_counts": dict(sec_counts),
        "subject_hint_counts": dict(subj_counts),
        "token_stats": {
            "min": min(token_counts) if token_counts else 0,
            "p25": percentile(token_counts, 25),
            "p50": percentile(token_counts, 50),
            "p75": percentile(token_counts, 75),
            "p95": percentile(token_counts, 95),
            "max": max(token_counts) if token_counts else 0,
            "mean": (sum(token_counts) / len(token_counts)) if token_counts else 0,
        },
        "has_formula_pct": (with_formula / len(chunks) * 100) if chunks else 0,
        "has_definition_pct": (with_definition / len(chunks) * 100) if chunks else 0,
        "text_with_context_pct": (with_context / len(chunks) * 100) if chunks else 0,
    }

    if sample_chunk is not None:
        report["sample_chunk"] = {
            "chapter": sample_chunk.get("chapter"),
            "section_type": sample_chunk.get("section_type"),
            "page": sample_chunk.get("page"),
            "token_count": sample_chunk.get("token_count"),
            "subject_hint": sample_chunk.get("subject_hint"),
            "has_formula": sample_chunk.get("has_formula"),
            "has_definition": sample_chunk.get("has_definition"),
            "text_head": (sample_chunk.get("text", "")[:300]),
            "context_head": (sample_chunk.get("text_with_context", "")[:420]),
        }

    return report


def process_book(pdf_path: Path) -> dict:
    print(f"\n=== {pdf_path.name} ({pdf_path.stat().st_size / 1_000_000:.1f} MB) ===",
          flush=True)
    t0 = time.time()
    pdf_bytes = pdf_path.read_bytes()
    try:
        chunks = utils.process_pdf(pdf_bytes)
    except Exception as e:
        print(f"  process_pdf FAILED: {type(e).__name__}: {e}", flush=True)
        return {"book": pdf_path.name, "error": f"{type(e).__name__}: {e}"}
    dt = time.time() - t0

    report = summarize(pdf_path.name, chunks)
    report["elapsed_seconds"] = round(dt, 1)

    print(f"  done in {dt:.1f}s — {len(chunks)} chunks, "
          f"{report['distinct_chapters']} chapters", flush=True)
    print(f"  section_type_counts: {report['section_type_counts']}",
          flush=True)
    print(f"  token p50/p95/max: "
          f"{report['token_stats']['p50']:.0f}/"
          f"{report['token_stats']['p95']:.0f}/"
          f"{report['token_stats']['max']}", flush=True)
    print(f"  has_formula={report['has_formula_pct']:.1f}%, "
          f"has_definition={report['has_definition_pct']:.1f}%, "
          f"with_context={report['text_with_context_pct']:.1f}%", flush=True)

    return report


def main():
    if not BOOKS_DIR.exists():
        print(f"ERROR: Books dir missing: {BOOKS_DIR}", file=sys.stderr)
        sys.exit(1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    overall = []

    targets = TARGETS
    if len(sys.argv) > 1:
        targets = sys.argv[1:]

    for name in targets:
        pdf_path = BOOKS_DIR / name
        if not pdf_path.exists():
            print(f"SKIP {name}: not found under {BOOKS_DIR}", flush=True)
            overall.append({"book": name, "error": "not_found"})
            continue
        overall.append(process_book(pdf_path))

    out_file = OUT_DIR / "report.json"
    out_file.write_text(json.dumps(overall, indent=2, ensure_ascii=False))
    print(f"\nWrote combined report to {out_file}", flush=True)


if __name__ == "__main__":
    main()
