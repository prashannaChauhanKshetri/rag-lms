"""
Retrieval Quality Evaluation — MRR and MAP
==========================================
Two evaluation modes:

  keyword  (default, offline)
      Relevance = chunk contains ≥ MIN_KEYWORD_HITS query keywords.
      Fast, no API calls, deterministic.

  llm      (Gemini LLM-as-Judge)
      Relevance judged by Gemma-4-26B-A4B-IT (MoE, 4B active params) via
      the Gemini API.  Falls back to gemini-flash-latest if the MoE model
      returns a server error (still experimental).
      One batched API call per query — 24 calls total for the full suite.

Metrics
-------
  MRR  – Mean Reciprocal Rank
  MAP  – Mean Average Precision
  P@1  – Precision at rank 1
  P@3  – Precision at rank 3

Usage
-----
  python test/eval_retrieval.py                              # keyword mode
  python test/eval_retrieval.py --mode llm --topk 8         # LLM-judge mode
  python test/eval_retrieval.py --mode llm --csv            # + CSV export
"""
import argparse
import json
import os
import re
import sys
import csv
import time
import urllib.request
import urllib.error
from typing import List, Dict, Tuple

import numpy as np

_REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _REPO not in sys.path:
    sys.path.insert(0, _REPO)

import vectorstore_postgres as vs
from models import get_embed_model

# ── Constants ─────────────────────────────────────────────────────────────────

TOP_K            = 8
MIN_KEYWORD_HITS = 2

GEMINI_KEY  = os.environ.get("GEMINI_API_KEY", "")
GEMMA_MODEL = "gemma-4-26b-a4b-it"     # 26B total / 4B active MoE (primary)
FLASH_MODEL = "gemini-flash-latest"     # gemini-3.5-flash  (fallback)
GEMINI_URL  = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

CHATBOTS = {
    "Science Gr-9":   "3bfcafa8-dcea-4182-98b9-1c9a00655baa",
    "Maths Gr-10":    "875fcf77-b3e4-4dd2-88bf-3be9dd9e06c7",
    "Computer Sci":   "486b12a9-3dfc-4cf1-a9ba-fd892df5adfc",
}

# ── Ground-truth query bank ────────────────────────────────────────────────────

QUERY_BANK: Dict[str, List[Tuple[str, List[str]]]] = {
    "Science Gr-9": [
        ("What is photosynthesis and what are its raw materials?",
         ["photosynthesis", "chlorophyll", "carbon dioxide", "sunlight"]),
        ("Explain Newton's second law of motion",
         ["newton", "force", "mass", "acceleration"]),
        ("What is osmosis? How does it differ from diffusion?",
         ["osmosis", "diffusion", "semi-permeable", "concentration"]),
        ("Describe the structure of an atom",
         ["atom", "proton", "neutron", "electron", "nucleus"]),
        ("What are the products of cellular respiration?",
         ["respiration", "glucose", "oxygen", "atp", "carbon dioxide"]),
        ("Explain the process of mitosis",
         ["mitosis", "cell division", "chromosome", "nucleus"]),
        ("What is the difference between potential and kinetic energy?",
         ["potential energy", "kinetic energy", "work", "joule"]),
        ("Describe the water cycle",
         ["evaporation", "condensation", "precipitation", "water cycle"]),
        ("What are acids and bases? Give examples",
         ["acid", "base", "ph", "litmus", "neutral"]),
        ("Explain how lenses form images",
         ["lens", "focal", "refraction", "image", "convex"]),
    ],
    "Maths Gr-10": [
        ("State the quadratic formula and explain its components",
         ["quadratic", "formula", "discriminant", "coefficient"]),
        ("What is the Pythagorean theorem?",
         ["pythagorean", "hypotenuse", "right angle", "triangle"]),
        ("Define arithmetic progression and write its nth term",
         ["arithmetic", "progression", "common difference", "nth term"]),
        ("What is trigonometric ratio? Define sin, cos and tan",
         ["trigonometric", "sine", "cosine", "tangent", "ratio"]),
        ("Explain the concept of probability",
         ["probability", "event", "sample space", "outcome"]),
        ("What is a geometric progression?",
         ["geometric", "progression", "common ratio", "sequence"]),
        ("Explain co-ordinate geometry and the distance formula",
         ["coordinate", "distance formula", "midpoint", "axis"]),
        ("What are polynomials? Give types and examples",
         ["polynomial", "degree", "coefficient", "monomial", "binomial"]),
    ],
    "Computer Sci": [
        ("What is an algorithm? What are its properties?",
         ["algorithm", "step", "input", "output", "finite"]),
        ("Explain the difference between compiler and interpreter",
         ["compiler", "interpreter", "source code", "machine code"]),
        ("What is a database? Explain primary key and foreign key",
         ["database", "primary key", "foreign key", "table", "relation"]),
        ("Describe sorting algorithms with examples",
         ["sort", "bubble sort", "selection sort", "array", "comparison"]),
        ("What is object-oriented programming? Name its pillars",
         ["object", "class", "inheritance", "encapsulation", "polymorphism"]),
        ("Explain the OSI model and its layers",
         ["osi", "layer", "network", "transport", "application"]),
    ],
}


# ── Keyword-based relevance ────────────────────────────────────────────────────

def kw_relevant(chunk: Dict, keywords: List[str]) -> bool:
    text = chunk.get("text", "").lower()
    return sum(1 for kw in keywords if kw.lower() in text) >= MIN_KEYWORD_HITS


# ── LLM-as-Judge relevance ─────────────────────────────────────────────────────

_llm_model_used = None   # tracked for final report

def _gemini_post(model: str, prompt: str, retries: int = 3) -> str:
    url      = GEMINI_URL.format(model=model)
    payload  = json.dumps({"contents": [{"role": "user", "parts": [{"text": prompt}]}]}).encode()
    headers  = {"Content-Type": "application/json", "X-goog-api-key": GEMINI_KEY}

    for attempt in range(retries):
        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = json.loads(resp.read())
                return data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except urllib.error.HTTPError as e:
            body_err = e.read().decode()
            err_data = json.loads(body_err) if body_err else {}
            code     = err_data.get("error", {}).get("code", e.code)
            if code == 429:
                wait = 15 * (attempt + 1)
                print(f" [429 — wait {wait}s]", end="", flush=True)
                time.sleep(wait)
            elif code == 500:
                return "__server_error__"
            else:
                raise
        except TimeoutError:
            print(f" [timeout attempt {attempt+1}]", end="", flush=True)
            time.sleep(5)
    return "__timeout__"


def llm_judge_batch(query: str, chunks: List[Dict]) -> List[bool]:
    """
    Ask the LLM to judge all chunks for one query in a single call.
    Returns a list of booleans (True = relevant).
    Primary: gemma-4-26b-a4b-it (MoE 26B/4B active)
    Fallback: gemini-flash-latest
    """
    global _llm_model_used

    numbered = "\n\n".join(
        f"[{i+1}] {c.get('text','')[:400]}"
        for i, c in enumerate(chunks)
    )
    prompt = (
        f"You are a relevance assessor for a curriculum RAG system.\n\n"
        f"Query: {query}\n\n"
        f"Below are {len(chunks)} retrieved text chunks from educational textbooks. "
        f"For EACH chunk, answer 'yes' if it contains information that would help answer the query, "
        f"or 'no' if it is off-topic or irrelevant.\n\n"
        f"{numbered}\n\n"
        f"Respond with ONLY a comma-separated list of yes/no values, one per chunk, "
        f"in order. Example for 4 chunks: yes,no,yes,no"
    )

    # Try primary model (Gemma 4 26B MoE)
    raw = _gemini_post(GEMMA_MODEL, prompt)
    if raw in ("__server_error__", "__timeout__"):
        print(f"    [{GEMMA_MODEL} unavailable, using {FLASH_MODEL}]", end="", flush=True)
        raw = _gemini_post(FLASH_MODEL, prompt)
        _llm_model_used = FLASH_MODEL
    else:
        _llm_model_used = GEMMA_MODEL

    # Parse response: extract yes/no tokens
    tokens = re.findall(r'\b(yes|no)\b', raw.lower())
    if len(tokens) < len(chunks):
        # Pad with 'no' if LLM returned fewer tokens than expected
        tokens += ["no"] * (len(chunks) - len(tokens))
    return [t == "yes" for t in tokens[:len(chunks)]]


# ── Metric helpers ─────────────────────────────────────────────────────────────

def reciprocal_rank(rel: List[bool]) -> float:
    for i, r in enumerate(rel, start=1):
        if r:
            return 1.0 / i
    return 0.0


def average_precision(rel: List[bool]) -> float:
    num_rel, prec_sum = 0, 0.0
    for i, r in enumerate(rel, start=1):
        if r:
            num_rel  += 1
            prec_sum += num_rel / i
    return prec_sum / num_rel if num_rel else 0.0


def precision_at(rel: List[bool], k: int) -> float:
    return sum(rel[:k]) / k if k else 0.0


# ── Embedding ─────────────────────────────────────────────────────────────────

_embed = None

def embed(text: str) -> np.ndarray:
    global _embed
    if _embed is None:
        print("Loading embedding model…")
        _embed = get_embed_model()
    return _embed.encode([text], convert_to_numpy=True).astype("float32")[0]


# ── Main evaluation loop ───────────────────────────────────────────────────────

def evaluate(top_k: int = TOP_K, mode: str = "keyword") -> List[Dict]:
    rows = []

    for bot_name, chatbot_id in CHATBOTS.items():
        queries = QUERY_BANK.get(bot_name, [])
        ap_list, rr_list, p1_list, p3_list = [], [], [], []

        print(f"\n[{bot_name}]")
        for query, keywords in queries:
            q_emb  = embed(query)
            chunks = vs.hybrid_query(chatbot_id, query, q_emb, top_k=top_k)

            if mode == "llm":
                print(f"  judging: {query[:55]}…", end=" ", flush=True)
                rel = llm_judge_batch(query, chunks)
                print("done")
            else:
                rel = [kw_relevant(c, keywords) for c in chunks]

            rr = reciprocal_rank(rel)
            ap = average_precision(rel)
            p1 = precision_at(rel, 1)
            p3 = precision_at(rel, 3)

            rr_list.append(rr); ap_list.append(ap)
            p1_list.append(p1); p3_list.append(p3)

            rows.append({
                "chatbot":   bot_name,
                "query":     query[:60] + ("…" if len(query) > 60 else ""),
                "RR":        round(rr, 4),
                "AP":        round(ap, 4),
                "P@1":       round(p1, 4),
                "P@3":       round(p3, 4),
                "rel":       sum(rel),
                "total":     len(chunks),
            })
            if mode == "llm":
                time.sleep(6)   # stay within ~10 RPM free-tier limit

        # Summary row
        n = len(queries)
        rows.append({
            "chatbot":  f"── {bot_name} ({n} queries) ──",
            "query":    "",
            "RR":       round(sum(rr_list) / n, 4),
            "AP":       round(sum(ap_list) / n, 4),
            "P@1":      round(sum(p1_list) / n, 4),
            "P@3":      round(sum(p3_list) / n, 4),
            "rel": "", "total": "",
            "_summary": True,
        })

    return rows


# ── Report ─────────────────────────────────────────────────────────────────────

def print_report(rows: List[Dict], top_k: int, mode: str):
    W = 66
    judge_label = (
        f"LLM-judge ({_llm_model_used or GEMMA_MODEL})"
        if mode == "llm" else f"keyword (min_hits={MIN_KEYWORD_HITS})"
    )

    print()
    print("=" * W)
    print(f"  RAG RETRIEVAL QUALITY   top_k={top_k}  mode={judge_label}")
    print("=" * W)
    print(f"  {'Query':<42} {'MRR':>6} {'MAP':>6} {'P@1':>5} {'P@3':>5}")
    print("-" * W)

    all_rr, all_ap, all_p1, all_p3 = [], [], [], []
    prev_bot = None

    for r in rows:
        if r.get("_summary"):
            print("-" * W)
            print(f"  {r['chatbot']:<42} {r['RR']:>6.4f} {r['AP']:>6.4f} {r['P@1']:>5.4f} {r['P@3']:>5.4f}")
            print()
        else:
            if r["chatbot"] != prev_bot:
                print(f"\n  [{r['chatbot']}]")
                prev_bot = r["chatbot"]
            tag = f"({r['rel']}/{r['total']})" if r["rel"] != "" else ""
            print(f"  {'  '+r['query']:<42} {r['RR']:>6.4f} {r['AP']:>6.4f} {r['P@1']:>5.4f} {r['P@3']:>5.4f} {tag}")
            all_rr.append(r["RR"]); all_ap.append(r["AP"])
            all_p1.append(r["P@1"]); all_p3.append(r["P@3"])

    if all_rr:
        n = len(all_rr)
        mrr = sum(all_rr) / n
        mmap = sum(all_ap) / n
        op1  = sum(all_p1) / n
        op3  = sum(all_p3) / n
        print("=" * W)
        print(f"  {'OVERALL  (' + str(n) + ' queries)':<42} {mrr:>6.4f} {mmap:>6.4f} {op1:>5.4f} {op3:>5.4f}")
        print("=" * W)
        print()
        print(f"  MRR  {mrr:.4f}  — first relevant chunk at avg rank {1/mrr:.1f}" if mrr > 0 else f"  MRR  0.0000")
        print(f"  MAP  {mmap:.4f}  — avg precision over relevant positions")
        print(f"  P@1  {op1:.4f}  — top chunk relevant {op1*100:.1f}% of queries")
        print(f"  P@3  {op3:.4f}  — avg {op3*3:.1f} relevant chunks in top-3")
        print()


# ── CSV ────────────────────────────────────────────────────────────────────────

def write_csv(rows, path="retrieval_eval.csv"):
    fields = ["chatbot", "query", "RR", "AP", "P@1", "P@3", "rel", "total"]
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(r for r in rows if not r.get("_summary"))
    print(f"  CSV → {path}")


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--topk", type=int, default=TOP_K)
    ap.add_argument("--mode", choices=["keyword", "llm"], default="keyword",
                    help="keyword = fast offline; llm = Gemini LLM-as-Judge")
    ap.add_argument("--csv",  action="store_true")
    args = ap.parse_args()

    rows = evaluate(top_k=args.topk, mode=args.mode)
    print_report(rows, top_k=args.topk, mode=args.mode)
    if args.csv:
        write_csv(rows)
