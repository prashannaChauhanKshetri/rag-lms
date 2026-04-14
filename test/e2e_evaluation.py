"""End-to-end RAGAS evaluation with Postgres retrieval + LLM answer generation.

Runs the full production pipeline for each test question:
  1. Classify query (section_type detection)
  2. Embed query
  3. hybrid_query() from Postgres (BM25 + pgvector + rerank + MMR)
  4. Generate answer via LLM (Ollama local by default, Groq as fallback)
  5. Score with RAGAS metrics (faithfulness, relevancy, precision, recall)

Usage:
    # Quick test (10 questions, fast mode — embeddings only)
    python test/e2e_evaluation.py --quick

    # Full evaluation with Google Gemini (default, free tier)
    python test/e2e_evaluation.py --full --detailed

    # Use Groq or local Ollama instead
    python test/e2e_evaluation.py --full --detailed --backend groq
    python test/e2e_evaluation.py --full --detailed --backend ollama

    # Use expanded student questions dataset
    python test/e2e_evaluation.py --dataset test/ragas_smoke/student_questions.json --full
"""
import json
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np
import requests
from tqdm import tqdm

import database_postgres as db
import vectorstore_postgres as vs
from models import get_embed_model, get_rerank_model
from utils import build_system_user_prompt, is_structural_query
from routes.chat import classify_query


# ─── LLM backends ──────────────────────────────────────────────────────────

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "phi3:mini"

# Backend: "gemini" (default) | "groq" | "ollama"
# Set via --backend flag. Gemini free tier: 15 RPM, 1500 RPD — plenty for eval.
LLM_BACKEND = "gemini"

# Throttle: min seconds between successive API calls per backend
_THROTTLE = {"gemini": 4.5, "groq": 3.0, "ollama": 0.0}
_last_call_ts = 0.0


def _throttle():
    global _last_call_ts
    gap = _THROTTLE.get(LLM_BACKEND, 0) - (time.time() - _last_call_ts)
    if gap > 0:
        time.sleep(gap)
    _last_call_ts = time.time()


def _call_gemini(system_prompt: str, user_prompt: str, max_retries: int = 5) -> str:
    """Google Gemini 2.0 Flash Lite — free tier, no laptop heat.

    Get a free API key at: https://aistudio.google.com/app/apikey
    Set env var: GEMINI_API_KEY=your_key_here
    Free limits: 15 requests/min, 1500 requests/day.
    """
    import os
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY not set.\n"
            "  1. Go to https://aistudio.google.com/app/apikey\n"
            "  2. Click 'Create API key'\n"
            "  3. export GEMINI_API_KEY=your_key\n"
            "  4. Re-run the evaluation"
        )

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.0-flash-lite:generateContent?key={api_key}"
    )
    payload = {
        "contents": [{"parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 512},
    }

    for attempt in range(max_retries):
        _throttle()
        try:
            resp = requests.post(url, json=payload, timeout=30)
            if resp.status_code == 429:
                backoff = min(15 * (2 ** attempt), 90)
                print(f"    [gemini rate-limit] waiting {backoff}s...")
                time.sleep(backoff)
                continue
            resp.raise_for_status()
            candidates = resp.json().get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                return "".join(p.get("text", "") for p in parts).strip()
            return ""
        except requests.exceptions.Timeout:
            print(f"    [gemini timeout] attempt {attempt + 1}/{max_retries}")
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            time.sleep(5)
    return ""


def _call_groq(system_prompt: str, user_prompt: str, max_retries: int = 5) -> str:
    """Groq API — fast but strict 30 RPM free-tier limit."""
    from routes.chat import call_groq_llm as _groq
    for attempt in range(max_retries):
        _throttle()
        try:
            result = _groq(system_prompt, user_prompt)
            if result and "rate limit" not in result.lower():
                return result
            backoff = min(5 * (2 ** attempt), 60)
            print(f"    [groq rate-limit] waiting {backoff}s...")
            time.sleep(backoff)
        except Exception as e:
            if "429" in str(e) or "rate" in str(e).lower():
                backoff = min(5 * (2 ** attempt), 60)
                print(f"    [groq rate-limit] waiting {backoff}s...")
                time.sleep(backoff)
            else:
                raise
    from routes.chat import call_groq_llm as _groq
    return _groq(system_prompt, user_prompt)


def _call_ollama(system_prompt: str, user_prompt: str, timeout: int = 120) -> str:
    """Local Ollama (phi3:mini). No rate limits but uses laptop CPU/GPU."""
    _throttle()
    full_prompt = f"{system_prompt}\n\nUser: {user_prompt}\n\nAssistant:"
    resp = requests.post(
        OLLAMA_URL,
        json={
            "model": OLLAMA_MODEL,
            "prompt": full_prompt,
            "stream": False,
            "options": {"temperature": 0.1, "num_predict": 512},
        },
        timeout=timeout,
    )
    resp.raise_for_status()
    return resp.json().get("response", "").strip()


def call_llm(system_prompt: str, user_prompt: str) -> str:
    """Dispatch to the configured LLM backend."""
    if LLM_BACKEND == "gemini":
        return _call_gemini(system_prompt, user_prompt)
    if LLM_BACKEND == "groq":
        return _call_groq(system_prompt, user_prompt)
    return _call_ollama(system_prompt, user_prompt)


def _check_ollama() -> bool:
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=3)
        models = [m["name"] for m in r.json().get("models", [])]
        return any(OLLAMA_MODEL in m for m in models)
    except Exception:
        return False


# ─── RAGAS Metrics ──────────────────────────────────────────────────────────

class MetricsComputer:
    def __init__(self, embed_model, fast_mode: bool = True):
        self.embed = embed_model
        self.fast_mode = fast_mode

    def _encode(self, texts):
        return self.embed.encode(
            texts, convert_to_numpy=True, normalize_embeddings=True,
        )

    def _cos_sim(self, a, b):
        denom = (np.linalg.norm(a) * np.linalg.norm(b)) or 1e-6
        return float(np.dot(a, b) / denom)

    def _llm_judge(self, prompt: str) -> float:
        system = (
            "You are a precise evaluation judge. Return ONLY a number between "
            "0 and 1.\n0 = completely wrong/irrelevant\n0.5 = partially correct"
            "/relevant\n1 = completely correct/relevant\nReturn ONLY the decimal "
            "number, nothing else."
        )
        try:
            response = call_llm(system, prompt)
            score = float(response.strip().split()[0])
            return max(0.0, min(1.0, score))
        except Exception:
            return 0.5

    def faithfulness(self, answer: str, contexts: List[str]) -> float:
        """Is the answer grounded in the retrieved context?"""
        if not contexts or not answer:
            return 0.0
        combined = "\n".join(contexts[:3])
        if self.fast_mode:
            a_emb, c_emb = self._encode([answer])[0], self._encode([combined])[0]
            return self._cos_sim(a_emb, c_emb)
        prompt = (
            f"Given this context and answer, rate how much the answer is "
            f"factually grounded in the context (0-1).\n\n"
            f"CONTEXT:\n{combined[:2000]}\n\nANSWER:\n{answer[:500]}"
        )
        return self._llm_judge(prompt)

    def answer_relevancy(self, question: str, answer: str) -> float:
        """Does the answer address the question?"""
        if not answer:
            return 0.0
        if self.fast_mode:
            q_emb, a_emb = self._encode([question])[0], self._encode([answer])[0]
            return self._cos_sim(q_emb, a_emb)
        base_sim = self._cos_sim(
            self._encode([question])[0], self._encode([answer])[0]
        )
        llm_score = self._llm_judge(
            f"Rate how well this answer addresses the question (0-1).\n\n"
            f"QUESTION: {question}\n\nANSWER: {answer[:500]}"
        )
        return 0.4 * base_sim + 0.6 * llm_score

    def context_precision(self, question: str, contexts: List[str],
                          ground_truth: str) -> float:
        """Are relevant contexts ranked first? (DCG-weighted)"""
        if not contexts:
            return 0.0
        gt_emb = self._encode([ground_truth])[0]
        ctx_embs = self._encode(contexts[:5])
        sims = ctx_embs @ gt_emb
        weights = np.array([1.0 / np.log2(i + 2) for i in range(len(sims))])
        return float((sims * weights).sum() / weights.sum())

    def context_recall(self, contexts: List[str], ground_truth: str) -> float:
        """Does context cover the ground truth?
        Always uses embedding similarity (even in detailed mode) because:
        1. It saves an LLM call per question (reduces rate-limit pressure)
        2. Embedding sim between chunks and ground_truth is reliable
        """
        if not contexts or not ground_truth:
            return 0.0
        gt_emb = self._encode([ground_truth])[0]
        ctx_embs = self._encode(contexts[:5])
        sims = ctx_embs @ gt_emb
        return float(sims.max())

    def compute_all(self, question, answer, contexts, ground_truth) -> Dict:
        f = self.faithfulness(answer, contexts)
        ar = self.answer_relevancy(question, answer)
        cp = self.context_precision(question, contexts, ground_truth)
        cr = self.context_recall(contexts, ground_truth)
        return {
            "faithfulness": round(f, 4),
            "answer_relevancy": round(ar, 4),
            "context_precision": round(cp, 4),
            "context_recall": round(cr, 4),
            "ragas_score": round(np.mean([f, ar, cp, cr]), 4),
        }


# ─── Chatbot Resolver ──────────────────────────────────────────────────────

def resolve_chatbot_for_book(book_name: str, chatbot_map: Dict) -> str | None:
    """Find the chatbot_id that has this book indexed."""
    # Direct match
    if book_name in chatbot_map:
        return chatbot_map[book_name]
    # Fuzzy match
    stem = Path(book_name).stem.lower().replace(" ", "").replace("(1)", "")
    for src, cid in chatbot_map.items():
        candidate = Path(src).stem.lower().replace(" ", "").replace("(1)", "")
        if stem in candidate or candidate in stem:
            return cid
    return None


def build_chatbot_map() -> Dict[str, str]:
    """Map source filename -> chatbot_id for all indexed books."""
    mapping = {}
    with vs.get_db_connection() as conn:
        with vs.get_dict_cursor(conn) as cur:
            cur.execute("""
                SELECT chatbot_id, source, COUNT(*) as cnt
                FROM document_chunks
                GROUP BY chatbot_id, source
                ORDER BY cnt DESC
            """)
            for row in cur.fetchall():
                src = row["source"]
                # Keep the chatbot with most chunks for this source
                if src not in mapping:
                    mapping[src] = row["chatbot_id"]
    return mapping


# ─── Main Runner ────────────────────────────────────────────────────────────

def run_evaluation(
    dataset_path: str,
    num_samples: int | None = None,
    fast_mode: bool = True,
    chatbot_id_override: str | None = None,
    top_k: int = 5,
) -> Dict:
    # Load dataset
    with open(dataset_path, encoding="utf-8") as f:
        ds = json.load(f)
    cases = ds["test_cases"]
    if num_samples:
        cases = cases[:num_samples]

    llm_label = "Groq" if USE_GROQ else f"Ollama/{OLLAMA_MODEL}"
    print("=" * 70)
    print(f"E2E RAGAS EVALUATION — {len(cases)} questions")
    print(f"Mode: {'Fast (embeddings)' if fast_mode else f'Detailed (LLM judge via {llm_label})'}")
    print("=" * 70)

    # Resolve chatbot IDs
    chatbot_map = build_chatbot_map()
    print(f"\nIndexed books in DB: {len(chatbot_map)}")
    for src, cid in sorted(chatbot_map.items()):
        print(f"  {src:45} -> {cid[:12]}...")

    # Load models
    print("\nLoading models...")
    embed_model = get_embed_model()
    metrics_computer = MetricsComputer(embed_model, fast_mode=fast_mode)

    results = []
    skipped = 0

    for case in tqdm(cases, desc="Evaluating"):
        book = case["book"]
        question = case["question"]
        ground_truth = case["ground_truth"]

        # Resolve chatbot
        cid = chatbot_id_override or resolve_chatbot_for_book(book, chatbot_map)
        if not cid:
            print(f"  SKIP: No chatbot for {book}")
            skipped += 1
            continue

        try:
            # 1. Classify query
            query_info = classify_query(question)

            # 2. Embed query
            q_emb = embed_model.encode(
                [question], convert_to_numpy=True
            ).astype("float32")[0]

            # 3. Retrieve from Postgres
            t0 = time.time()
            retrieved = vs.hybrid_query(
                chatbot_id=cid,
                query=question,
                query_embedding=q_emb,
                top_k=top_k,
                bm25_weight=query_info.get("bm25_weight", 0.3),
                faiss_weight=query_info.get("faiss_weight", 0.7),
                section_type_filter=query_info.get("section_type_filter"),
                use_reranker=True,
            )
            retrieval_ms = (time.time() - t0) * 1000

            contexts = [r.get("text_with_context", r["text"]) for r in retrieved]
            raw_texts = [r["text"] for r in retrieved]

            # 4. Generate answer via LLM
            t0 = time.time()
            if contexts:
                sys_prompt, usr_prompt = build_system_user_prompt(retrieved, question)
                answer = call_llm(sys_prompt, usr_prompt)
            else:
                answer = "No relevant information found in the textbook."
            llm_ms = (time.time() - t0) * 1000

            # 5. Compute RAGAS metrics
            metrics = metrics_computer.compute_all(
                question, answer, raw_texts, ground_truth,
            )

            # Top chunk info
            top = retrieved[0] if retrieved else {}
            top_info = (
                f"[{top.get('section_type', '?')} | "
                f"{top.get('chapter', '?')[:25]} | "
                f"p{top.get('page', '?')}]"
            ) if top else "NONE"

            result = {
                "id": case["id"],
                "type": case["type"],
                "book": book,
                "chatbot_id": cid,
                "question": question,
                "ground_truth": ground_truth,
                "answer": answer[:500],
                "contexts": raw_texts[:3],
                "metrics": metrics,
                "retrieval_ms": round(retrieval_ms, 1),
                "llm_ms": round(llm_ms, 1),
                "n_retrieved": len(retrieved),
                "top_chunk": top_info,
                "query_type": query_info.get("query_type", "factual"),
                "top_k_sections": [r.get("section_type") for r in retrieved],
                "top_k_chapters": [r.get("chapter") for r in retrieved],
            }
            results.append(result)

            # Console
            status = "OK " if metrics["context_recall"] >= 0.5 else "MISS"
            print(
                f"  {status}  {case['id']:25} | "
                f"ragas={metrics['ragas_score']:.2f} "
                f"recall={metrics['context_recall']:.2f} "
                f"faith={metrics['faithfulness']:.2f} | "
                f"{retrieval_ms:5.0f}ms+{llm_ms:5.0f}ms | "
                f"{case['type']}"
            )

        except Exception as e:
            print(f"  ERROR on {case['id']}: {e}")
            import traceback
            traceback.print_exc()

    # ─── Aggregate ──────────────────────────────────────────────────────
    if not results:
        print("\nNo results to aggregate.")
        return {}

    def mean(key):
        vals = [r["metrics"][key] for r in results]
        return round(sum(vals) / len(vals), 4) if vals else 0.0

    overall = {
        "n_cases": len(results),
        "n_skipped": skipped,
        "faithfulness": mean("faithfulness"),
        "answer_relevancy": mean("answer_relevancy"),
        "context_precision": mean("context_precision"),
        "context_recall": mean("context_recall"),
        "ragas_score": mean("ragas_score"),
        "avg_retrieval_ms": round(
            sum(r["retrieval_ms"] for r in results) / len(results), 1
        ),
        "avg_llm_ms": round(
            sum(r["llm_ms"] for r in results) / len(results), 1
        ),
    }

    print(f"\n{'=' * 70}")
    print("OVERALL RESULTS")
    print(f"{'=' * 70}")
    print(f"  n_cases:           {overall['n_cases']} ({overall['n_skipped']} skipped)")
    print(f"  faithfulness:      {overall['faithfulness']:.2%}")
    print(f"  answer_relevancy:  {overall['answer_relevancy']:.2%}")
    print(f"  context_precision: {overall['context_precision']:.2%}")
    print(f"  context_recall:    {overall['context_recall']:.2%}")
    print(f"  RAGAS score:       {overall['ragas_score']:.2%}")
    print(f"  avg retrieval:     {overall['avg_retrieval_ms']:.0f}ms")
    print(f"  avg LLM:           {overall['avg_llm_ms']:.0f}ms")

    # By question type
    by_type = defaultdict(list)
    for r in results:
        by_type[r["type"]].append(r)

    print(f"\n  BY QUESTION TYPE:")
    print(f"  {'type':<14} {'n':>3} {'ragas':>7} {'faith':>7} {'relev':>7} {'prec':>7} {'recall':>7}")
    print(f"  {'-' * 60}")
    type_breakdown = {}
    for t, rs in sorted(by_type.items()):
        m = {
            "n": len(rs),
            "ragas_score": sum(r["metrics"]["ragas_score"] for r in rs) / len(rs),
            "faithfulness": sum(r["metrics"]["faithfulness"] for r in rs) / len(rs),
            "answer_relevancy": sum(r["metrics"]["answer_relevancy"] for r in rs) / len(rs),
            "context_precision": sum(r["metrics"]["context_precision"] for r in rs) / len(rs),
            "context_recall": sum(r["metrics"]["context_recall"] for r in rs) / len(rs),
        }
        type_breakdown[t] = m
        print(
            f"  {t:<14} {m['n']:>3} "
            f"{m['ragas_score']:>6.1%} {m['faithfulness']:>6.1%} "
            f"{m['answer_relevancy']:>6.1%} {m['context_precision']:>6.1%} "
            f"{m['context_recall']:>6.1%}"
        )

    # By book
    by_book = defaultdict(list)
    for r in results:
        by_book[r["book"]].append(r)

    print(f"\n  BY BOOK:")
    print(f"  {'book':<45} {'n':>3} {'ragas':>7} {'recall':>7}")
    print(f"  {'-' * 65}")
    book_breakdown = {}
    for b, rs in sorted(by_book.items()):
        m = {
            "n": len(rs),
            "ragas_score": sum(r["metrics"]["ragas_score"] for r in rs) / len(rs),
            "context_recall": sum(r["metrics"]["context_recall"] for r in rs) / len(rs),
        }
        book_breakdown[b] = m
        print(f"  {b:<45} {m['n']:>3} {m['ragas_score']:>6.1%} {m['context_recall']:>6.1%}")

    # Save results
    output = {
        "timestamp": datetime.now().isoformat(),
        "mode": "fast" if fast_mode else "detailed",
        "llm_backend": LLM_BACKEND if LLM_BACKEND != "ollama" else f"ollama/{OLLAMA_MODEL}",
        "overall": overall,
        "by_type": type_breakdown,
        "by_book": book_breakdown,
        "details": results,
    }
    out_dir = ROOT / "test" / "eval_results"
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = out_dir / f"e2e_eval_{ts}.json"
    out_file.write_text(json.dumps(output, indent=2, ensure_ascii=False))
    print(f"\n  Saved: {out_file}")

    return output


def main():
    import argparse

    parser = argparse.ArgumentParser(description="E2E RAGAS Evaluation")
    parser.add_argument("--quick", action="store_true", help="10 questions, fast mode")
    parser.add_argument("--full", action="store_true", help="All questions")
    parser.add_argument("--samples", type=int, help="Custom sample count")
    parser.add_argument("--detailed", action="store_true", help="LLM-judged metrics")
    parser.add_argument("--chatbot-id", type=str, help="Override chatbot ID for all questions")
    parser.add_argument(
        "--dataset", type=str,
        default="test/ragas_smoke/student_questions.json",
        help="Path to evaluation dataset",
    )
    parser.add_argument("--top-k", type=int, default=5, help="Number of chunks to retrieve")
    parser.add_argument(
        "--backend", choices=["gemini", "groq", "ollama"], default="gemini",
        help="LLM backend for answer generation and judging (default: gemini)",
    )
    args = parser.parse_args()

    global LLM_BACKEND
    LLM_BACKEND = args.backend

    # Check LLM backend before starting
    import os
    if LLM_BACKEND == "gemini":
        if not os.getenv("GEMINI_API_KEY"):
            print("ERROR: GEMINI_API_KEY not set.")
            print("  1. Go to https://aistudio.google.com/app/apikey")
            print("  2. Click 'Create API key'")
            print("  3. Run: export GEMINI_API_KEY=your_key")
            print("  4. Re-run the evaluation")
            sys.exit(1)
        print("LLM backend: Google Gemini (gemini-2.0-flash-lite) — 15 RPM free tier")
    elif LLM_BACKEND == "ollama":
        if _check_ollama():
            print(f"LLM backend: Ollama ({OLLAMA_MODEL}) — no rate limits")
        else:
            print(f"WARNING: Ollama not running or {OLLAMA_MODEL} not found.")
            print("Start Ollama with:  ollama serve")
            print(f"Then run:           ollama pull {OLLAMA_MODEL}\n")
            sys.exit(1)
    else:
        print("LLM backend: Groq API (rate limits apply)")

    num_samples = None
    if args.quick:
        num_samples = 10
    elif args.samples:
        num_samples = args.samples
    elif not args.full:
        num_samples = 10  # default to quick

    fast_mode = not args.detailed

    run_evaluation(
        dataset_path=args.dataset,
        num_samples=num_samples,
        fast_mode=fast_mode,
        chatbot_id_override=args.chatbot_id,
        top_k=args.top_k,
    )


if __name__ == "__main__":
    main()
