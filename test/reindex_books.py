"""Re-index books into Postgres with the improved chunking pipeline.

Processes each book through `utils.process_pdf` (with all the RAGAS
improvements: per-section chunking, semantic splitting, TOC extraction,
exercise detection, page-drift correction, context windows, metadata
enrichment) and stores the chunks + embeddings in the existing
`document_chunks` table.

Usage:
    # Re-index all books that have chatbots in the DB
    python test/reindex_books.py

    # Re-index a specific chatbot
    python test/reindex_books.py --chatbot-id <UUID>

    # Dry run (process + report, no DB writes)
    python test/reindex_books.py --dry-run
"""
import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np

import database_postgres as db
import vectorstore_postgres as vs
import utils
from models import get_embed_model

BOOKS_DIR = ROOT / "Books"
PDF_DIR = ROOT / "pdfs"  # uploaded PDFs are stored under pdfs/<chatbot_id>/


def find_pdf(source_name: str, chatbot_id: str) -> Path | None:
    """Locate the PDF file — check pdfs/<chatbot_id>/ first, then Books/."""
    # Check the upload directory
    upload_path = PDF_DIR / chatbot_id / source_name
    if upload_path.exists():
        return upload_path

    # Check the Books directory
    books_path = BOOKS_DIR / source_name
    if books_path.exists():
        return books_path

    # Try fuzzy match (e.g. "grade-9-mathematics.pdf" vs "grade-9-mathematics (1).pdf")
    stem = Path(source_name).stem.lower().replace(" ", "").replace("(1)", "")
    for p in BOOKS_DIR.iterdir():
        if p.suffix.lower() == ".pdf":
            candidate = p.stem.lower().replace(" ", "").replace("(1)", "")
            if stem in candidate or candidate in stem:
                return p

    return None


def get_chatbot_books() -> list[dict]:
    """Return list of {chatbot_id, chatbot_name, source, chunk_count}."""
    results = []
    with vs.get_db_connection() as conn:
        with vs.get_dict_cursor(conn) as cur:
            cur.execute("""
                SELECT c.id AS chatbot_id, c.name AS chatbot_name,
                       dc.source, COUNT(dc.id) AS chunk_count
                FROM chatbots c
                JOIN document_chunks dc ON dc.chatbot_id = c.id::text
                GROUP BY c.id, c.name, dc.source
                ORDER BY c.name
            """)
            for row in cur.fetchall():
                results.append(dict(row))
    return results


def reindex_chatbot(chatbot_id: str, source: str, pdf_path: Path,
                    embed_model, dry_run: bool = False) -> dict:
    """Re-index a single chatbot's book.

    Returns stats dict with old_chunks, new_chunks, timing info.
    """
    print(f"\n{'─' * 60}")
    print(f"  Chatbot: {chatbot_id}")
    print(f"  Source:  {source}")
    print(f"  PDF:     {pdf_path}")
    print(f"{'─' * 60}")

    # 1. Process PDF with improved pipeline
    t0 = time.time()
    pdf_bytes = pdf_path.read_bytes()
    chunks = utils.process_pdf(pdf_bytes)
    process_time = time.time() - t0
    print(f"  Processed: {len(chunks)} chunks in {process_time:.1f}s")

    if not chunks:
        print("  WARNING: No chunks extracted — skipping")
        return {"old_chunks": 0, "new_chunks": 0, "skipped": True}

    # 2. Prepare texts and metadata
    texts = [c["text"] for c in chunks]
    metadatas = []
    for c in chunks:
        metadatas.append({
            "text": c["text"],
            "original_text": c.get("original_text", c["text"]),
            "source": source,
            "page": c.get("page"),
            "chapter": c.get("chapter", "Unknown"),
            "section_type": c.get("section_type", "content"),
            "heading": c.get("heading", ""),
            # Extra metadata stored in JSONB
            "text_with_context": c.get("text_with_context", c["text"]),
            "subject_hint": c.get("subject_hint", "unknown"),
            "has_formula": c.get("has_formula", False),
            "has_definition": c.get("has_definition", False),
            "exercise_numbers": c.get("exercise_numbers", []),
        })

    # 3. Embed all chunks
    t0 = time.time()
    embeddings = embed_model.encode(
        texts, batch_size=32, show_progress_bar=True,
        convert_to_numpy=True,
    )
    embeddings = np.asarray(embeddings).astype("float32")
    embed_time = time.time() - t0
    print(f"  Embedded: {len(texts)} chunks in {embed_time:.1f}s")

    # Section-type breakdown
    from collections import Counter
    sec_counts = Counter(c.get("section_type", "content") for c in chunks)
    print(f"  Section types: {dict(sec_counts)}")

    # Chapter breakdown
    chapters = set(c.get("chapter", "?") for c in chunks)
    print(f"  Chapters: {len(chapters)} — {sorted(chapters)[:8]}{'...' if len(chapters) > 8 else ''}")

    if dry_run:
        print("  [DRY RUN] Skipping DB writes")
        return {
            "old_chunks": 0,
            "new_chunks": len(chunks),
            "process_time": process_time,
            "embed_time": embed_time,
            "section_types": dict(sec_counts),
            "n_chapters": len(chapters),
        }

    # 4. Delete old chunks for this chatbot
    old_count = 0
    with vs.get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM document_chunks WHERE chatbot_id = %s",
                (chatbot_id,),
            )
            old_count = cur.fetchone()[0]
            cur.execute(
                "DELETE FROM document_chunks WHERE chatbot_id = %s",
                (chatbot_id,),
            )
    print(f"  Deleted: {old_count} old chunks")

    # 5. Insert new chunks
    res = vs.add_documents(chatbot_id, embeddings, metadatas)
    print(f"  Inserted: {res['added']} new chunks (total in DB: {res['total_docs']})")

    # 6. Update document record
    try:
        # Delete old document record and add new one
        with db.get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM documents WHERE chatbot_id = %s AND filename = %s",
                    (chatbot_id, source),
                )
        db.add_document(chatbot_id, source, len(chunks))
    except Exception as e:
        print(f"  WARNING: Could not update document record: {e}")

    return {
        "old_chunks": old_count,
        "new_chunks": res["added"],
        "process_time": process_time,
        "embed_time": embed_time,
        "section_types": dict(sec_counts),
        "n_chapters": len(chapters),
    }


def main():
    parser = argparse.ArgumentParser(description="Re-index books with improved pipeline")
    parser.add_argument("--chatbot-id", type=str, help="Re-index a specific chatbot only")
    parser.add_argument("--dry-run", action="store_true", help="Process PDFs but don't write to DB")
    args = parser.parse_args()

    print("=" * 60)
    print("RAG-LMS BOOK RE-INDEXER (improved pipeline)")
    print("=" * 60)

    # Load embedding model once
    print("\nLoading embedding model...")
    t0 = time.time()
    embed_model = get_embed_model()
    print(f"Model loaded in {time.time() - t0:.1f}s")

    # Get all chatbot-book pairs
    books = get_chatbot_books()
    if args.chatbot_id:
        books = [b for b in books if b["chatbot_id"] == args.chatbot_id]
        if not books:
            print(f"No chatbot found with ID {args.chatbot_id}")
            sys.exit(1)

    print(f"\nFound {len(books)} chatbot-book pairs to re-index:")
    for b in books:
        print(f"  {b['chatbot_name']:40} | {b['source']:45} | {b['chunk_count']} chunks")

    # Process each
    stats = []
    for b in books:
        pdf_path = find_pdf(b["source"], b["chatbot_id"])
        if pdf_path is None:
            print(f"\n  SKIP: PDF not found for {b['source']}")
            continue

        try:
            result = reindex_chatbot(
                chatbot_id=b["chatbot_id"],
                source=b["source"],
                pdf_path=pdf_path,
                embed_model=embed_model,
                dry_run=args.dry_run,
            )
            result["chatbot_name"] = b["chatbot_name"]
            result["source"] = b["source"]
            stats.append(result)
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()

    # Summary
    print(f"\n{'=' * 60}")
    print("SUMMARY")
    print(f"{'=' * 60}")
    print(f"{'Chatbot':<30} {'Old':>6} {'New':>6} {'Chap':>5} {'Process':>8} {'Embed':>8}")
    print(f"{'-' * 70}")
    total_old = total_new = 0
    for s in stats:
        if s.get("skipped"):
            continue
        total_old += s.get("old_chunks", 0)
        total_new += s.get("new_chunks", 0)
        print(
            f"{s.get('chatbot_name', '?')[:30]:<30} "
            f"{s.get('old_chunks', 0):>6} "
            f"{s.get('new_chunks', 0):>6} "
            f"{s.get('n_chapters', 0):>5} "
            f"{s.get('process_time', 0):>7.1f}s "
            f"{s.get('embed_time', 0):>7.1f}s"
        )
    print(f"{'-' * 70}")
    print(f"{'TOTAL':<30} {total_old:>6} {total_new:>6}")
    if args.dry_run:
        print("\n[DRY RUN] No changes written to database.")


if __name__ == "__main__":
    main()
