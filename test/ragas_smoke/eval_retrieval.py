"""Self-contained retrieval evaluation.

Processes books in-memory, builds a local FAISS-free numpy index, runs the
full retrieval pipeline (keyword boost + rerank + MMR + structural path),
and scores results with RAGAS-style embedding metrics — no Postgres or LLM
needed.

Design goals:
  - Zero external state: runs anywhere `process_pdf` works.
  - Exercises the same helpers the production path uses (extract_keywords,
    keyword_boost_score, mmr_select, is_structural_query, filter_structural_chunks).
  - Metrics match RAGAS fast_mode: similarity-based context recall /
    precision / answer relevancy.
"""
import json
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402

import utils  # noqa: E402
from models import get_embed_model, get_rerank_model  # noqa: E402


BOOKS_DIR = ROOT / "Books"
OUT_DIR = ROOT / "test" / "ragas_smoke"
DATASET = OUT_DIR / "student_questions.json"


# =============================================================================
# In-memory index per book
# =============================================================================

class LocalBookIndex:
    """In-memory index for a single book.

    Stores chunks, their dense embeddings, and provides the same retrieval
    surface as `vectorstore_postgres.hybrid_query` (minus BM25 — we rely on
    semantic + cross-encoder + MMR which is the scored path).
    """

    def __init__(self, pdf_path: Path, embed_model):
        self.path = pdf_path
        self.name = pdf_path.name
        self.embed = embed_model

        print(f"  [{self.name}] processing PDF...", flush=True)
        t0 = time.time()
        pdf_bytes = pdf_path.read_bytes()
        self.chunks = utils.process_pdf(pdf_bytes)
        chunk_time = time.time() - t0

        print(f"  [{self.name}] embedding {len(self.chunks)} chunks...",
              flush=True)
        t0 = time.time()
        # Use text_with_context when available — matches what the LLM sees
        texts = [
            (c.get("text_with_context") or c.get("text", ""))
            for c in self.chunks
        ]
        # Batch-encode for speed
        self.embeddings = self.embed.encode(
            texts, batch_size=32, show_progress_bar=False,
            convert_to_numpy=True, normalize_embeddings=True,
        ).astype(np.float32)
        embed_time = time.time() - t0

        # Attach embedding to each chunk dict so mmr_select can use it
        for c, v in zip(self.chunks, self.embeddings):
            c["embedding"] = v.tolist()

        print(f"  [{self.name}] ready — {len(self.chunks)} chunks, "
              f"chunking={chunk_time:.1f}s, embedding={embed_time:.1f}s",
              flush=True)

    def query(
        self,
        question: str,
        top_k: int = 5,
        fetch_k: int = 20,
        reranker=None,
        use_mmr: bool = True,
    ) -> List[Dict]:
        """Retrieve top-`top_k` chunks for `question`.

        Pipeline mirrors `vectorstore_postgres.hybrid_query`:
          1. Structural short-circuit
          2. Vector similarity top-`fetch_k`
          3. Keyword boost
          4. Cross-encoder rerank (if model provided)
          5. MMR diversity selection
        """
        # Exercise-ref short-circuit: queries naming 'Exercise X.Y'
        ex_ref = utils.extract_exercise_ref(question)
        if ex_ref:
            ex_hits = utils.filter_by_exercise_ref(self.chunks, ex_ref)
            if ex_hits:
                # If the query also mentions a chapter, prefer that chapter
                q_lower = question.lower()
                chapter_hits = [
                    c for c in ex_hits
                    if c.get("chapter") and c["chapter"].lower() in q_lower
                ] or [
                    c for c in ex_hits
                    if c.get("chapter") and any(
                        word in q_lower
                        for word in c["chapter"].lower().split()
                        if len(word) > 3
                    )
                ]
                return (chapter_hits or ex_hits)[:top_k]
            # Fall through to normal retrieval if no match

        # Structural query short-circuit
        if utils.is_structural_query(question):
            filtered = utils.filter_structural_chunks(self.chunks)
            return filtered[:top_k]

        # Dense retrieval
        q_vec = self.embed.encode(
            [question], convert_to_numpy=True, normalize_embeddings=True,
        ).astype(np.float32)[0]
        sims = self.embeddings @ q_vec  # cosine on normalized vectors
        top_idx = np.argsort(-sims)[:fetch_k]
        candidates = []
        for i in top_idx:
            c = dict(self.chunks[int(i)])
            c["hybrid_score"] = float(sims[int(i)])
            candidates.append(c)

        # Keyword boost
        kws = utils.extract_keywords(question, top_k=5)
        if kws:
            for c in candidates:
                c["hybrid_score"] *= utils.keyword_boost_score(
                    c.get("text", ""), kws
                )
            candidates.sort(key=lambda r: r["hybrid_score"], reverse=True)

        # Cross-encoder rerank — optional
        if reranker is not None and candidates:
            pairs = [(question, c.get("text", "")[:512]) for c in candidates]
            ce_scores = reranker.predict(pairs, batch_size=32)
            for c, s in zip(candidates, ce_scores):
                c["rerank_score"] = float(s)
            # Blend 50/50 as in production
            ce_arr = np.asarray(ce_scores, dtype=np.float32)
            lo, hi = float(ce_arr.min()), float(ce_arr.max())
            rng = max(hi - lo, 1e-6)
            for c in candidates:
                ce_norm = (c["rerank_score"] - lo) / rng
                c["hybrid_score"] = 0.5 * ce_norm + 0.5 * c["hybrid_score"]
            candidates.sort(key=lambda r: r["hybrid_score"], reverse=True)

        # MMR dedup
        if use_mmr:
            candidates = utils.mmr_select(
                candidates[: max(top_k * 2, top_k)],
                top_k=top_k,
                diversity_threshold=0.85,
                embedding_key="embedding",
            )
        else:
            candidates = candidates[:top_k]

        return candidates


# =============================================================================
# Metrics — RAGAS fast_mode style
# =============================================================================

def cos_sim(a: np.ndarray, b: np.ndarray) -> float:
    denom = (np.linalg.norm(a) * np.linalg.norm(b)) or 1e-6
    return float(np.dot(a, b) / denom)


def evaluate_case(
    embed_model,
    question: str,
    ground_truth: str,
    retrieved: List[Dict],
) -> Dict:
    """Score a single test case against its ground truth.

    Metrics (all in [0, 1]):
      - context_recall:     max cosine(retrieved_chunk, ground_truth)
      - context_precision:  DCG-weighted mean similarity of top-k to GT
      - answer_relevancy:   cosine(best_chunk, question) — proxy for "did
                            we find text that looks like an answer?"
      - retrieval_hit@1/3:  does the top-1 / top-3 chunk have ≥0.5 sim to GT?
    """
    if not retrieved:
        return {
            "context_recall": 0.0,
            "context_precision": 0.0,
            "answer_relevancy": 0.0,
            "hit_at_1": 0,
            "hit_at_3": 0,
            "n_retrieved": 0,
        }

    texts = [(r.get("text_with_context") or r.get("text", "")) for r in retrieved]
    q_emb = embed_model.encode(
        [question], convert_to_numpy=True, normalize_embeddings=True,
    )[0]
    gt_emb = embed_model.encode(
        [ground_truth], convert_to_numpy=True, normalize_embeddings=True,
    )[0]
    ctx_embs = embed_model.encode(
        texts, convert_to_numpy=True, normalize_embeddings=True,
    )

    # Context recall: best hit against ground truth
    sims_to_gt = ctx_embs @ gt_emb
    recall = float(sims_to_gt.max())

    # Context precision: DCG-weighted mean
    weights = np.array([1.0 / np.log2(i + 2) for i in range(len(sims_to_gt))])
    weighted = float((sims_to_gt * weights).sum() / weights.sum())

    # Answer relevancy proxy: best chunk similarity to question
    sims_to_q = ctx_embs @ q_emb
    relevancy = float(sims_to_q.max())

    hit_at_1 = 1 if sims_to_gt[0] >= 0.5 else 0
    hit_at_3 = 1 if sims_to_gt[: min(3, len(sims_to_gt))].max() >= 0.5 else 0

    return {
        "context_recall": max(0.0, recall),
        "context_precision": max(0.0, weighted),
        "answer_relevancy": max(0.0, relevancy),
        "hit_at_1": hit_at_1,
        "hit_at_3": hit_at_3,
        "n_retrieved": len(retrieved),
    }


# =============================================================================
# Runner
# =============================================================================

def main():
    with open(DATASET, encoding="utf-8") as f:
        ds = json.load(f)
    cases = ds["test_cases"]

    print("=" * 72)
    print(f"RETRIEVAL EVALUATION — {len(cases)} questions")
    print("=" * 72)

    # Group cases by book so each book is processed + embedded only once
    by_book: Dict[str, List[Dict]] = defaultdict(list)
    for c in cases:
        by_book[c["book"]].append(c)

    print(f"\nBooks needed: {list(by_book.keys())}")
    print(f"Loading embedding + rerank models (one-time)...", flush=True)
    t0 = time.time()
    embed_model = get_embed_model()
    reranker = get_rerank_model()
    print(f"Models loaded in {time.time() - t0:.1f}s\n")

    # Build one index per book
    indexes: Dict[str, LocalBookIndex] = {}
    for book_name in by_book:
        pdf_path = BOOKS_DIR / book_name
        if not pdf_path.exists():
            print(f"  [{book_name}] NOT FOUND — skipping")
            continue
        indexes[book_name] = LocalBookIndex(pdf_path, embed_model)

    print(f"\n{'=' * 72}\nRUNNING QUERIES\n{'=' * 72}\n")

    results = []
    for case in cases:
        book = case["book"]
        if book not in indexes:
            continue
        q = case["question"]
        gt = case["ground_truth"]

        t0 = time.time()
        retrieved = indexes[book].query(q, top_k=5, reranker=reranker)
        dt = time.time() - t0

        metrics = evaluate_case(embed_model, q, gt, retrieved)

        # Top chunk summary
        top_chunk = retrieved[0] if retrieved else None
        top_summary = ""
        if top_chunk:
            top_summary = (
                f"[{top_chunk.get('section_type','?')} | "
                f"{top_chunk.get('chapter','?')[:30]} | "
                f"p{top_chunk.get('page','?')}] "
                + top_chunk.get("text", "")[:140].replace("\n", " ")
            )

        result = {
            "id": case["id"],
            "type": case["type"],
            "book": book,
            "question": q,
            "ground_truth": gt,
            "metrics": metrics,
            "latency_ms": round(dt * 1000, 1),
            "top_chunk": top_summary,
            "top_k_sections": [r.get("section_type") for r in retrieved],
            "top_k_chapters": [r.get("chapter") for r in retrieved],
        }
        results.append(result)

        # Console line
        status = "OK " if metrics["hit_at_3"] else "MISS"
        print(
            f"  {status}  {case['id']:22} | "
            f"recall={metrics['context_recall']:.2f} "
            f"prec={metrics['context_precision']:.2f} "
            f"ans={metrics['answer_relevancy']:.2f} | "
            f"{dt * 1000:5.0f}ms | {case['type']}"
        )

    # Aggregate
    print(f"\n{'=' * 72}\nAGGREGATE\n{'=' * 72}")

    def mean(key: str) -> float:
        vals = [r["metrics"][key] for r in results]
        return sum(vals) / len(vals) if vals else 0.0

    overall = {
        "n_cases": len(results),
        "context_recall": mean("context_recall"),
        "context_precision": mean("context_precision"),
        "answer_relevancy": mean("answer_relevancy"),
        "hit_at_1": mean("hit_at_1"),
        "hit_at_3": mean("hit_at_3"),
        "avg_latency_ms": (sum(r["latency_ms"] for r in results) / len(results))
        if results else 0,
    }

    print(f"\n  n_cases:           {overall['n_cases']}")
    print(f"  context_recall:    {overall['context_recall']:.2%}")
    print(f"  context_precision: {overall['context_precision']:.2%}")
    print(f"  answer_relevancy:  {overall['answer_relevancy']:.2%}")
    print(f"  hit@1:             {overall['hit_at_1']:.2%}")
    print(f"  hit@3:             {overall['hit_at_3']:.2%}")
    print(f"  avg_latency:       {overall['avg_latency_ms']:.0f}ms")

    # Per-type breakdown
    by_type = defaultdict(list)
    for r in results:
        by_type[r["type"]].append(r)

    print(f"\n  BY QUESTION TYPE:")
    print(f"  {'type':<12} {'n':>3} {'recall':>8} {'prec':>8} {'ans_rel':>8} {'hit@3':>8}")
    print(f"  {'-' * 50}")
    type_breakdown = {}
    for t, rs in sorted(by_type.items()):
        m = {
            "n": len(rs),
            "context_recall": sum(r["metrics"]["context_recall"] for r in rs) / len(rs),
            "context_precision": sum(r["metrics"]["context_precision"] for r in rs) / len(rs),
            "answer_relevancy": sum(r["metrics"]["answer_relevancy"] for r in rs) / len(rs),
            "hit_at_3": sum(r["metrics"]["hit_at_3"] for r in rs) / len(rs),
        }
        type_breakdown[t] = m
        print(
            f"  {t:<12} {m['n']:>3} "
            f"{m['context_recall']:>7.1%} {m['context_precision']:>7.1%} "
            f"{m['answer_relevancy']:>7.1%} {m['hit_at_3']:>7.1%}"
        )

    # Per-book breakdown
    by_book_result = defaultdict(list)
    for r in results:
        by_book_result[r["book"]].append(r)

    print(f"\n  BY BOOK:")
    print(f"  {'book':<45} {'n':>3} {'recall':>8} {'prec':>8} {'hit@3':>8}")
    print(f"  {'-' * 75}")
    book_breakdown = {}
    for b, rs in sorted(by_book_result.items()):
        m = {
            "n": len(rs),
            "context_recall": sum(r["metrics"]["context_recall"] for r in rs) / len(rs),
            "context_precision": sum(r["metrics"]["context_precision"] for r in rs) / len(rs),
            "hit_at_3": sum(r["metrics"]["hit_at_3"] for r in rs) / len(rs),
        }
        book_breakdown[b] = m
        print(
            f"  {b:<45} {m['n']:>3} "
            f"{m['context_recall']:>7.1%} {m['context_precision']:>7.1%} "
            f"{m['hit_at_3']:>7.1%}"
        )

    # Save detailed results
    out_file = OUT_DIR / "eval_results.json"
    out_file.write_text(
        json.dumps(
            {
                "overall": overall,
                "by_type": type_breakdown,
                "by_book": book_breakdown,
                "details": results,
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    print(f"\n  saved: {out_file}")


if __name__ == "__main__":
    main()
