"""
RAG-LMS Multi-Bot Evaluation Script
=====================================
Evaluates all (test) chatbots + Class 7 Social using RAGAS metrics.
Handles Groq rate limits with automatic throttling.

Bots evaluated:
  - Grade 9 Nepali(test)
  - Grade 8 English(test)
  - Class 7 Maths(test)
  - Class 8 Maths(test)
  - Maths-10(test)
  - Class 7 Social

Usage:
    cd /Users/prashanna/Desktop/FYP/rag-lms
    python test/multi_bot_eval.py
    python test/multi_bot_eval.py --samples 5        # quicker run
    python test/multi_bot_eval.py --delay 3          # slower but safer rate limit
"""

import os
import sys
import json
import time
import argparse
import numpy as np
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, str(Path(__file__).parent.parent))

import database_postgres as db
import vectorstore_postgres as vs
from models import get_embed_model, get_rerank_model
from routes.chat import call_groq_llm as _call_groq_llm, classify_query
from utils import build_system_user_prompt

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# Seconds between each Groq LLM call — keeps us well under 30 RPM
DEFAULT_GROQ_DELAY = 2.5

# Map: substring of chatbot name (lowercase) → evaluation dataset file
# Order matters: more specific patterns first
BOT_DATASET_MAP = [
    # Most specific first — class + grade + subject
    ("grade 9 nepali",   "test/grade9_nepali_evaluation.json"),
    ("grade 8 english",  "test/grade8_english_evaluation.json"),
    ("class 7 social",   "test/class7_social_evaluation.json"),
    ("class 7 maths",    "test/class7_maths_evaluation.json"),
    ("class 8 maths",    "test/class8_maths_evaluation.json"),
    ("maths-10",         "test/grade10_math_evaluation.json"),
    ("maths10",          "test/grade10_math_evaluation.json"),
    # Medium specificity
    ("nepali",           "test/grade9_nepali_evaluation.json"),
    ("english",          "test/grade8_english_evaluation.json"),
    ("social",           "test/class7_social_evaluation.json"),
]

# Chatbots to target: must match name patterns (lowercase)
TARGET_PATTERNS = [
    "(test)",
    "class 7 social",
]

# ---------------------------------------------------------------------------
# Groq wrapper with rate-limit throttle
# ---------------------------------------------------------------------------

_last_groq_call = 0.0

def call_groq_throttled(system: str, user: str, delay: float = DEFAULT_GROQ_DELAY) -> str:
    """Call Groq, sleeping if needed to avoid 429 rate-limit errors."""
    global _last_groq_call
    elapsed = time.time() - _last_groq_call
    if elapsed < delay:
        time.sleep(delay - elapsed)

    for attempt in range(4):
        try:
            result = _call_groq_llm(system, user)
            _last_groq_call = time.time()
            return result
        except Exception as e:
            err = str(e)
            if "429" in err or "rate" in err.lower():
                wait = 10 * (attempt + 1)
                print(f"  [rate-limit] waiting {wait}s (attempt {attempt+1})…")
                time.sleep(wait)
            else:
                raise
    # last try
    result = _call_groq_llm(system, user)
    _last_groq_call = time.time()
    return result

# ---------------------------------------------------------------------------
# Embedding-based RAGAS metrics (fast, no extra LLM calls)
# ---------------------------------------------------------------------------

class FastRAGAS:
    def __init__(self):
        self.embed = get_embed_model()

    def _sim(self, a: str, b: str) -> float:
        e1 = self.embed.encode([a], convert_to_numpy=True)[0]
        e2 = self.embed.encode([b], convert_to_numpy=True)[0]
        n1, n2 = np.linalg.norm(e1), np.linalg.norm(e2)
        if n1 == 0 or n2 == 0:
            return 0.0
        return float(np.dot(e1, e2) / (n1 * n2))

    def faithfulness(self, answer: str, contexts: List[str]) -> float:
        if not contexts or not answer:
            return 0.0
        ctx = "\n".join(contexts[:3])
        return self._sim(answer, ctx)

    def answer_relevancy(self, question: str, answer: str) -> float:
        if not answer:
            return 0.0
        return self._sim(question, answer)

    def context_precision(self, contexts: List[str], ground_truth: str) -> float:
        if not contexts:
            return 0.0
        sims = [self._sim(c, ground_truth) for c in contexts[:5]]
        weights = [1.0 / np.log2(i + 2) for i in range(len(sims))]
        w_sum = sum(s * w for s, w in zip(sims, weights))
        max_w = sum(sorted(sims, reverse=True)[i] * weights[i] for i in range(len(sims)))
        return w_sum / max_w if max_w > 0 else 0.0

    def context_recall(self, contexts: List[str], ground_truth: str) -> float:
        if not contexts:
            return 0.0
        return max(self._sim(ground_truth, c) for c in contexts[:5])

    def score_all(self, question: str, answer: str,
                  contexts: List[str], ground_truth: str) -> Dict[str, float]:
        f  = self.faithfulness(answer, contexts)
        ar = self.answer_relevancy(question, answer)
        cp = self.context_precision(contexts, ground_truth)
        cr = self.context_recall(contexts, ground_truth)
        return {
            "faithfulness":      round(f,  4),
            "answer_relevancy":  round(ar, 4),
            "context_precision": round(cp, 4),
            "context_recall":    round(cr, 4),
            "ragas_score":       round(np.mean([f, ar, cp, cr]), 4),
        }

# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def find_target_chatbots() -> List[Dict]:
    """
    Return all chatbots whose name matches one of TARGET_PATTERNS
    AND that have at least one document uploaded.
    """
    with db.get_db_connection() as conn:
        with db.get_dict_cursor(conn) as cur:
            cur.execute("""
                SELECT c.id::text, c.name, COUNT(d.id) AS doc_count
                FROM chatbots c
                LEFT JOIN documents d ON d.chatbot_id = c.id
                GROUP BY c.id, c.name
                HAVING COUNT(d.id) > 0
                ORDER BY c.name
            """)
            rows = cur.fetchall()

    matched = []
    for row in rows:
        name_lower = row["name"].lower()
        if any(pat in name_lower for pat in TARGET_PATTERNS):
            matched.append({"id": row["id"], "name": row["name"],
                            "doc_count": row["doc_count"]})
    return matched


def resolve_dataset(bot_name: str) -> Optional[str]:
    """
    Find the best matching dataset path for a chatbot name.
    Resolves relative paths from the project root.
    """
    name_lower = bot_name.lower()
    root = Path(__file__).parent.parent

    for pattern, rel_path in BOT_DATASET_MAP:
        if pattern in name_lower:
            full = root / rel_path
            if full.exists():
                return str(full)
            # Try without 'test/' prefix (already in test/ dir)
            alt = Path(__file__).parent / Path(rel_path).name
            if alt.exists():
                return str(alt)
    return None


def load_dataset(path: str) -> List[Dict]:
    with open(path) as f:
        data = json.load(f)
    return data.get("test_cases", [])

# ---------------------------------------------------------------------------
# Single-bot evaluation
# ---------------------------------------------------------------------------

def evaluate_bot(bot: Dict, dataset_path: str, ragas: FastRAGAS,
                 num_samples: int, groq_delay: float) -> Dict:
    """Run RAGAS evaluation for one chatbot."""
    chatbot_id = bot["id"]
    bot_name   = bot["name"]
    cases      = load_dataset(dataset_path)[:num_samples]

    print(f"\n{'─'*60}")
    print(f"  Bot   : {bot_name}")
    print(f"  ID    : {chatbot_id}")
    print(f"  Cases : {len(cases)} / {num_samples} requested")
    print(f"  Data  : {Path(dataset_path).name}")
    print(f"{'─'*60}")

    results = []

    for i, case in enumerate(cases, 1):
        q  = case["question"]
        gt = case["ground_truth"]
        print(f"  [{i:02d}/{len(cases):02d}] {q[:70]}…" if len(q) > 70 else f"  [{i:02d}/{len(cases):02d}] {q}")

        t0 = time.time()

        # 1. Classify query
        q_info = classify_query(q)

        # 2. Embed query
        q_emb = ragas.embed.encode([q], convert_to_numpy=True).astype("float32")[0]

        # 3. Retrieve
        t_ret = time.time()
        hits = vs.hybrid_query(
            chatbot_id=chatbot_id,
            query=q,
            query_embedding=q_emb,
            top_k=5,
            bm25_weight=q_info.get("bm25_weight", 0.3),
            faiss_weight=q_info.get("faiss_weight", 0.7),
            section_type_filter=q_info.get("section_type_filter"),
            use_reranker=True,
        )
        ret_ms = (time.time() - t_ret) * 1000
        contexts = [h["text"] for h in hits]

        # 4. Generate answer (Groq — throttled)
        t_llm = time.time()
        if contexts:
            sys_p, usr_p = build_system_user_prompt(hits, q)
            answer = call_groq_throttled(sys_p, usr_p, delay=groq_delay)
        else:
            answer = "No relevant information found."
        llm_ms = (time.time() - t_llm) * 1000

        # 5. RAGAS metrics (pure embedding — no extra LLM calls)
        metrics = ragas.score_all(q, answer, contexts, gt)
        total_ms = (time.time() - t0) * 1000

        print(f"         → RAGAS {metrics['ragas_score']:.2%} | "
              f"F={metrics['faithfulness']:.2f} AR={metrics['answer_relevancy']:.2f} "
              f"CP={metrics['context_precision']:.2f} CR={metrics['context_recall']:.2f} "
              f"| {total_ms:.0f}ms")

        results.append({
            "id":       case.get("id", f"q{i}"),
            "question": q,
            "answer":   answer,
            "ground_truth": gt,
            "contexts": contexts[:3],
            "metrics":  metrics,
            "timings":  {"retrieval_ms": ret_ms, "llm_ms": llm_ms, "total_ms": total_ms},
            "category": case.get("category", ""),
            "grade":    case.get("grade", ""),
        })

    # Aggregate
    if not results:
        return {"bot": bot_name, "bot_id": chatbot_id, "error": "no results", "results": []}

    ms = [r["metrics"] for r in results]
    summary = {
        "faithfulness":      round(float(np.mean([m["faithfulness"]      for m in ms])), 4),
        "answer_relevancy":  round(float(np.mean([m["answer_relevancy"]  for m in ms])), 4),
        "context_precision": round(float(np.mean([m["context_precision"] for m in ms])), 4),
        "context_recall":    round(float(np.mean([m["context_recall"]    for m in ms])), 4),
        "ragas_score":       round(float(np.mean([m["ragas_score"]       for m in ms])), 4),
    }
    timings = {
        "avg_retrieval_ms": round(float(np.mean([r["timings"]["retrieval_ms"] for r in results])), 1),
        "avg_llm_ms":       round(float(np.mean([r["timings"]["llm_ms"]       for r in results])), 1),
        "avg_total_ms":     round(float(np.mean([r["timings"]["total_ms"]     for r in results])), 1),
    }

    print(f"\n  ✓ {bot_name}")
    print(f"    RAGAS={summary['ragas_score']:.2%}  F={summary['faithfulness']:.2%}  "
          f"AR={summary['answer_relevancy']:.2%}  CP={summary['context_precision']:.2%}  "
          f"CR={summary['context_recall']:.2%}")
    print(f"    Avg retrieval {timings['avg_retrieval_ms']:.0f}ms  |  "
          f"Avg LLM {timings['avg_llm_ms']:.0f}ms  |  "
          f"Avg total {timings['avg_total_ms']:.0f}ms")

    return {
        "bot":          bot_name,
        "bot_id":       chatbot_id,
        "dataset":      Path(dataset_path).name,
        "num_samples":  len(results),
        "summary":      summary,
        "timings":      timings,
        "results":      results,
    }

# ---------------------------------------------------------------------------
# Main runner
# ---------------------------------------------------------------------------

def run_all(num_samples: int = 10, groq_delay: float = DEFAULT_GROQ_DELAY):
    print("\n" + "=" * 60)
    print("  RAG-LMS MULTI-BOT RAGAS EVALUATION")
    print("=" * 60)
    print(f"  Samples per bot : {num_samples}")
    print(f"  Groq delay      : {groq_delay}s between calls")
    print(f"  Mode            : Fast (embedding metrics, 1 LLM call/question)")
    print("=" * 60)

    # 1. Discover target bots
    bots = find_target_chatbots()
    if not bots:
        print("\n[ERROR] No matching chatbots found in the database.")
        print("  Make sure '(test)' bots and 'Class 7 Social' have documents uploaded.")
        sys.exit(1)

    print(f"\n  Found {len(bots)} target bot(s):")
    for b in bots:
        ds = resolve_dataset(b["name"])
        status = Path(ds).name if ds else "⚠ no dataset"
        print(f"    • {b['name']:<35} docs={b['doc_count']}  dataset={status}")

    # 2. Init RAGAS (loads embedding model once)
    print("\n  Loading embedding model…")
    ragas = FastRAGAS()
    print("  ✓ Embedding model ready")

    # 3. Evaluate each bot
    all_bot_results = []
    skipped = []

    for bot in bots:
        ds_path = resolve_dataset(bot["name"])
        if not ds_path:
            print(f"\n  [SKIP] {bot['name']} — no matching dataset")
            skipped.append(bot["name"])
            continue

        bot_result = evaluate_bot(bot, ds_path, ragas, num_samples, groq_delay)
        all_bot_results.append(bot_result)

    # 4. Save results
    output_dir = Path(__file__).parent / "eval_results"
    output_dir.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = output_dir / f"multi_bot_eval_{ts}.json"

    final = {
        "timestamp":    datetime.now().isoformat(),
        "num_samples":  num_samples,
        "groq_delay_s": groq_delay,
        "bots_found":   len(bots),
        "bots_skipped": skipped,
        "bot_results":  all_bot_results,
    }

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(final, f, indent=2, ensure_ascii=False)

    # 5. Final comparison table
    print("\n\n" + "=" * 70)
    print("  FINAL COMPARISON — ALL BOTS")
    print("=" * 70)
    header = f"  {'Bot':<32} {'RAGAS':>7} {'Faith':>7} {'AnsRel':>7} {'CtxPrec':>8} {'CtxRec':>8}"
    print(header)
    print("  " + "-" * 68)

    valid = [r for r in all_bot_results if "summary" in r]
    valid.sort(key=lambda r: r["summary"]["ragas_score"], reverse=True)

    for r in valid:
        s = r["summary"]
        name = r["bot"][:32]
        print(f"  {name:<32} {s['ragas_score']:>6.1%} {s['faithfulness']:>6.1%} "
              f"{s['answer_relevancy']:>6.1%} {s['context_precision']:>7.1%} "
              f"{s['context_recall']:>7.1%}")

    if valid:
        overall = {
            k: round(float(np.mean([r["summary"][k] for r in valid])), 4)
            for k in ["faithfulness", "answer_relevancy", "context_precision",
                      "context_recall", "ragas_score"]
        }
        print("  " + "-" * 68)
        print(f"  {'OVERALL AVERAGE':<32} {overall['ragas_score']:>6.1%} "
              f"{overall['faithfulness']:>6.1%} {overall['answer_relevancy']:>6.1%} "
              f"{overall['context_precision']:>7.1%} {overall['context_recall']:>7.1%}")

    if skipped:
        print(f"\n  Skipped (no dataset): {', '.join(skipped)}")

    print(f"\n  Results saved → {out_file}")
    print("=" * 70 + "\n")

    return final


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Multi-bot RAGAS evaluation")
    parser.add_argument("--samples", type=int, default=10,
                        help="Questions per bot (default: 10)")
    parser.add_argument("--delay", type=float, default=DEFAULT_GROQ_DELAY,
                        help=f"Seconds between Groq calls (default: {DEFAULT_GROQ_DELAY})")
    args = parser.parse_args()

    run_all(num_samples=args.samples, groq_delay=args.delay)
