"""
RAG-LMS Evaluation Script using RAGAS Framework
================================================
Professional evaluation suite for measuring RAG pipeline quality.

RAGAS Metrics:
- Faithfulness: Is the answer grounded in the retrieved context?
- Answer Relevancy: How relevant is the answer to the question?
- Context Precision: Are relevant chunks ranked higher?
- Context Recall: Does context cover all ground truth aspects?

Usage:
    python test/ragas_evaluation.py [--quick] [--full]
    
Author: RAG-LMS Team
"""

import os
import sys
import json
import time
import asyncio
from datetime import datetime
from typing import List, Dict, Any, Tuple
from dataclasses import dataclass, field
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
from tqdm import tqdm

# RAG-LMS imports
import database_postgres as db
import vectorstore_postgres as vs
from models import get_embed_model, get_rerank_model
from routes.chat import call_groq_llm as _call_groq_llm, classify_query
from utils import build_system_user_prompt

import requests

# =============================================================================
# LLM PROVIDERS (Ollama local or Groq cloud)
# =============================================================================

USE_LOCAL_LLM = False  # Set to False to use Groq API instead
OLLAMA_MODEL = "phi3:mini"
OLLAMA_URL = "http://localhost:11434/api/generate"

def call_ollama_llm(system_prompt: str, user_prompt: str) -> str:
    """Call local Ollama model (Phi-3 Mini)"""
    try:
        full_prompt = f"{system_prompt}\n\nUser: {user_prompt}\n\nAssistant:"
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": full_prompt,
                "stream": False,
                "options": {
                    "temperature": 0.3,
                    "num_predict": 1024
                }
            },
            timeout=120
        )
        response.raise_for_status()
        return response.json().get("response", "")
    except Exception as e:
        return f"Error calling Ollama: {str(e)}"

def call_groq_llm_with_retry(system_prompt: str, user_prompt: str, max_retries: int = 3) -> str:
    """Call Groq LLM with retry logic for rate limits"""
    for attempt in range(max_retries):
        try:
            result = _call_groq_llm(system_prompt, user_prompt)
            if result and "rate limit" not in result.lower():
                return result
            time.sleep(2 ** attempt)
        except Exception as e:
            if "429" in str(e) or "rate" in str(e).lower():
                wait_time = 2 ** attempt
                print(f"Rate limited, waiting {wait_time}s...")
                time.sleep(wait_time)
            else:
                raise
    return _call_groq_llm(system_prompt, user_prompt)

def call_groq_llm(system_prompt: str, user_prompt: str) -> str:
    """Wrapper - uses local Ollama or Groq based on config"""
    if USE_LOCAL_LLM:
        return call_ollama_llm(system_prompt, user_prompt)
    return call_groq_llm_with_retry(system_prompt, user_prompt)


# =============================================================================
# CONFIGURATION
# =============================================================================

@dataclass
class EvalConfig:
    """Evaluation configuration"""
    dataset_path: str = "test/evaluation_dataset.json"
    output_dir: str = "test/eval_results"
    chatbot_id: str = None  # Will be set dynamically
    top_k: int = 5
    num_samples: int = 50  # Full evaluation
    quick_samples: int = 10  # Quick test
    use_reranker: bool = True
    

# =============================================================================
# RAGAS METRICS IMPLEMENTATION
# =============================================================================

class RAGASEvaluator:
    """
    RAGAS-style evaluation for RAG systems.
    
    Implements four core metrics:
    1. Faithfulness - Answer grounded in context
    2. Answer Relevancy - Answer addresses the question  
    3. Context Precision - Relevant docs ranked first
    4. Context Recall - Context covers ground truth
    """
    
    def __init__(self, config: EvalConfig, fast_mode: bool = True):
        self.config = config
        self.embed_model = get_embed_model()
        self.results = []
        self.fast_mode = fast_mode  # Use embeddings only (no LLM metric calls)
        
    def _compute_similarity(self, text1: str, text2: str) -> float:
        """Compute cosine similarity between two texts"""
        emb1 = self.embed_model.encode([text1], convert_to_numpy=True)[0]
        emb2 = self.embed_model.encode([text2], convert_to_numpy=True)[0]
        return float(np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2)))
    
    def _llm_judge(self, prompt: str) -> float:
        """Use LLM to judge quality (returns 0-1 score)"""
        system = """You are a precise evaluation judge. Return ONLY a number between 0 and 1.
0 = completely wrong/irrelevant
0.5 = partially correct/relevant
1 = completely correct/relevant
Return ONLY the decimal number, nothing else."""
        
        response = call_groq_llm(system, prompt)
        try:
            score = float(response.strip())
            return max(0, min(1, score))  # Clamp to [0, 1]
        except:
            return 0.5  # Default if parsing fails
    
    def compute_faithfulness(self, answer: str, contexts: List[str]) -> float:
        """
        Faithfulness: Is the answer supported by the retrieved context?
        Fast mode: uses embedding similarity. Full mode: uses LLM judge.
        """
        if not contexts or not answer:
            return 0.0
            
        context_combined = "\n".join(contexts[:3])
        
        if self.fast_mode:
            # Fast: embedding similarity between answer and context
            return self._compute_similarity(answer, context_combined)
        
        prompt = f"""Given the following context and answer, evaluate if the answer is fully supported by the context.

CONTEXT:
{context_combined[:2000]}

ANSWER:
{answer[:500]}

Rate from 0 to 1 how much the answer is factually grounded in the context:
- 1.0 = All claims in answer are supported by context
- 0.5 = Some claims are supported, some are not
- 0.0 = Answer contradicts or is not supported by context"""

        return self._llm_judge(prompt)
    
    def compute_answer_relevancy(self, question: str, answer: str) -> float:
        """
        Answer Relevancy: Does the answer address the question?
        Fast mode: embedding similarity only. Full mode: adds LLM judge.
        """
        if not answer:
            return 0.0
        
        # Semantic similarity between question and answer
        base_sim = self._compute_similarity(question, answer)
        
        if self.fast_mode:
            return base_sim
        
        # LLM-based relevancy check
        prompt = f"""Given this question and answer, rate how well the answer addresses the question.

QUESTION: {question}

ANSWER: {answer[:500]}

Rate from 0 to 1:
- 1.0 = Answer directly and completely addresses the question
- 0.5 = Answer partially addresses the question
- 0.0 = Answer does not address the question at all"""

        llm_score = self._llm_judge(prompt)
        
        # Combine: 40% embedding similarity + 60% LLM judgment
        return 0.4 * base_sim + 0.6 * llm_score
    
    def compute_context_precision(self, question: str, contexts: List[str], 
                                   ground_truth: str) -> float:
        """
        Context Precision: Are relevant contexts ranked first?
        
        For each context, checks relevance to ground truth.
        Precision@k weighted by position (DCG-style).
        """
        if not contexts:
            return 0.0
        
        relevance_scores = []
        for ctx in contexts[:5]:  # Evaluate top 5
            sim = self._compute_similarity(ctx, ground_truth)
            relevance_scores.append(sim)
        
        # DCG-style weighting (higher rank = higher weight)
        weights = [1.0 / np.log2(i + 2) for i in range(len(relevance_scores))]
        
        weighted_sum = sum(s * w for s, w in zip(relevance_scores, weights))
        max_possible = sum(sorted(relevance_scores, reverse=True)[i] * weights[i] 
                          for i in range(len(relevance_scores)))
        
        if max_possible == 0:
            return 0.0
        
        return weighted_sum / max_possible
    
    def compute_context_recall(self, contexts: List[str], ground_truth: str) -> float:
        """
        Context Recall: Does the context cover all aspects of ground truth?
        Fast mode: embedding similarity. Full mode: LLM judge.
        """
        if not contexts or not ground_truth:
            return 0.0
        
        context_combined = "\n".join(contexts[:5])
        
        if self.fast_mode:
            # Fast: max similarity between ground truth and any context
            sims = [self._compute_similarity(ground_truth, ctx) for ctx in contexts[:5]]
            return max(sims) if sims else 0.0
        
        prompt = f"""Given the ground truth answer and retrieved contexts, evaluate context coverage.

GROUND TRUTH:
{ground_truth}

RETRIEVED CONTEXTS:
{context_combined[:2500]}

Rate from 0 to 1 how much of the ground truth information can be found in the contexts:
- 1.0 = All information from ground truth is covered in contexts
- 0.5 = About half the information is covered
- 0.0 = Contexts don't cover any ground truth information"""

        return self._llm_judge(prompt)
    
    def evaluate_single(self, question: str, ground_truth: str, 
                        chatbot_id: str) -> Dict[str, Any]:
        """
        Run full RAGAS evaluation on a single question.
        
        Returns metrics and intermediate results for analysis.
        """
        start_time = time.time()
        
        # 1. Get query classification
        query_info = classify_query(question)
        
        # 2. Generate embedding
        query_embedding = self.embed_model.encode(
            [question], convert_to_numpy=True
        ).astype("float32")[0]
        
        # 3. Retrieve contexts
        retrieval_start = time.time()
        results = vs.hybrid_query(
            chatbot_id=chatbot_id,
            query=question,
            query_embedding=query_embedding,
            top_k=self.config.top_k,
            bm25_weight=query_info.get('bm25_weight', 0.3),
            faiss_weight=query_info.get('faiss_weight', 0.7),
            section_type_filter=query_info.get('section_type_filter'),
            use_reranker=self.config.use_reranker
        )
        retrieval_time = time.time() - retrieval_start
        
        contexts = [r['text'] for r in results]
        
        # 4. Generate answer
        llm_start = time.time()
        if contexts:
            system_prompt, user_prompt = build_system_user_prompt(results, question)
            answer = call_groq_llm(system_prompt, user_prompt)
        else:
            answer = "No relevant information found in the textbook."
        llm_time = time.time() - llm_start
        
        # 5. Compute RAGAS metrics
        metrics = {
            'faithfulness': self.compute_faithfulness(answer, contexts),
            'answer_relevancy': self.compute_answer_relevancy(question, answer),
            'context_precision': self.compute_context_precision(question, contexts, ground_truth),
            'context_recall': self.compute_context_recall(contexts, ground_truth),
        }
        
        # Compute aggregate score
        metrics['ragas_score'] = np.mean(list(metrics.values()))
        
        total_time = time.time() - start_time
        
        return {
            'question': question,
            'ground_truth': ground_truth,
            'answer': answer,
            'contexts': contexts[:3],  # Store top 3 for analysis
            'metrics': metrics,
            'timings': {
                'retrieval_ms': retrieval_time * 1000,
                'llm_ms': llm_time * 1000,
                'total_ms': total_time * 1000
            },
            'query_type': query_info.get('query_type', 'factual'),
            'num_contexts': len(contexts)
        }


# =============================================================================
# EVALUATION RUNNER
# =============================================================================

class EvaluationRunner:
    """Main evaluation orchestrator"""
    
    def __init__(self, config: EvalConfig, fast_mode: bool = True):
        self.config = config
        self.evaluator = RAGASEvaluator(config, fast_mode=fast_mode)
        self.dataset = self._load_dataset()
        
    def _load_dataset(self) -> List[Dict]:
        """Load evaluation dataset"""
        dataset_path = Path(self.config.dataset_path)
        if not dataset_path.exists():
            raise FileNotFoundError(f"Dataset not found: {dataset_path}")
        
        with open(dataset_path) as f:
            data = json.load(f)
        
        return data.get('test_cases', [])
    
    def _get_chatbot_id(self) -> str:
        """Get or create chatbot for evaluation"""
        # If chatbot_id already set via config, use it
        if self.config.chatbot_id:
            return self.config.chatbot_id
            
        # Try to find existing chatbot with books (any with documents)
        with db.get_db_connection() as conn:
            with db.get_dict_cursor(conn) as cur:
                cur.execute("""
                    SELECT c.id, c.name, COUNT(d.id) as doc_count 
                    FROM chatbots c
                    LEFT JOIN documents d ON d.chatbot_id = c.id
                    GROUP BY c.id, c.name
                    HAVING COUNT(d.id) > 0
                    ORDER BY COUNT(d.id) DESC
                    LIMIT 1
                """)
                row = cur.fetchone()
                if row:
                    print(f"📚 Using chatbot: {row['name']} ({row['doc_count']} documents)")
                    return str(row['id'])
                
                # If no chatbot with docs, list available chatbots
                cur.execute("SELECT id, name FROM chatbots LIMIT 5")
                chatbots = cur.fetchall()
                if chatbots:
                    print("\n⚠️  No chatbot has documents. Available chatbots:")
                    for cb in chatbots:
                        print(f"   - {cb['name']}: {cb['id']}")
                    print("\nRun with: --chatbot-id <ID>")
        
        raise ValueError("No chatbot with documents found. Please upload books first or specify --chatbot-id.")
    
    def run_evaluation(self, num_samples: int = None) -> Dict[str, Any]:
        """
        Run full evaluation suite.
        
        Args:
            num_samples: Number of test cases (None = all)
            
        Returns:
            Comprehensive evaluation results
        """
        chatbot_id = self._get_chatbot_id()
        self.config.chatbot_id = chatbot_id
        
        samples = self.dataset[:num_samples] if num_samples else self.dataset
        
        print(f"\n{'='*60}")
        print("RAG-LMS EVALUATION SUITE (RAGAS Framework)")
        print(f"{'='*60}")
        print(f"Chatbot ID: {chatbot_id}")
        print(f"Test cases: {len(samples)}")
        print(f"Reranker: {'Enabled' if self.config.use_reranker else 'Disabled'}")
        print(f"{'='*60}\n")
        
        results = []
        category_results = {}
        
        for i, test_case in enumerate(tqdm(samples, desc="Evaluating")):
            try:
                result = self.evaluator.evaluate_single(
                    question=test_case['question'],
                    ground_truth=test_case['ground_truth'],
                    chatbot_id=chatbot_id
                )
                result['id'] = test_case['id']
                result['category'] = test_case.get('category', 'Unknown')
                result['grade'] = test_case.get('grade', 'Unknown')
                result['type'] = test_case.get('type', 'Unknown')
                
                results.append(result)
                
                # Aggregate by category
                cat = result['category']
                if cat not in category_results:
                    category_results[cat] = []
                category_results[cat].append(result)
                
            except Exception as e:
                print(f"\nError on {test_case['id']}: {e}")
                continue
        
        # Compute aggregate statistics
        all_metrics = [r['metrics'] for r in results]
        
        summary = {
            'timestamp': datetime.now().isoformat(),
            'config': {
                'chatbot_id': chatbot_id,
                'num_samples': len(results),
                'top_k': self.config.top_k,
                'use_reranker': self.config.use_reranker
            },
            'overall': {
                'faithfulness': np.mean([m['faithfulness'] for m in all_metrics]),
                'answer_relevancy': np.mean([m['answer_relevancy'] for m in all_metrics]),
                'context_precision': np.mean([m['context_precision'] for m in all_metrics]),
                'context_recall': np.mean([m['context_recall'] for m in all_metrics]),
                'ragas_score': np.mean([m['ragas_score'] for m in all_metrics])
            },
            'by_category': {},
            'timings': {
                'avg_retrieval_ms': np.mean([r['timings']['retrieval_ms'] for r in results]),
                'avg_llm_ms': np.mean([r['timings']['llm_ms'] for r in results]),
                'avg_total_ms': np.mean([r['timings']['total_ms'] for r in results])
            },
            'detailed_results': results
        }
        
        # Compute per-category metrics
        for cat, cat_results in category_results.items():
            cat_metrics = [r['metrics'] for r in cat_results]
            summary['by_category'][cat] = {
                'count': len(cat_results),
                'faithfulness': np.mean([m['faithfulness'] for m in cat_metrics]),
                'answer_relevancy': np.mean([m['answer_relevancy'] for m in cat_metrics]),
                'context_precision': np.mean([m['context_precision'] for m in cat_metrics]),
                'context_recall': np.mean([m['context_recall'] for m in cat_metrics]),
                'ragas_score': np.mean([m['ragas_score'] for m in cat_metrics])
            }
        
        # Save results
        self._save_results(summary)
        self._print_summary(summary)
        
        return summary
    
    def _save_results(self, summary: Dict):
        """Save evaluation results to file"""
        output_dir = Path(self.config.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = output_dir / f"ragas_eval_{timestamp}.json"
        
        with open(output_file, 'w') as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        
        print(f"\n📁 Results saved: {output_file}")
    
    def _print_summary(self, summary: Dict):
        """Print evaluation summary to console"""
        print(f"\n{'='*60}")
        print("EVALUATION RESULTS")
        print(f"{'='*60}")
        
        overall = summary['overall']
        print(f"\n📊 OVERALL RAGAS METRICS:")
        print(f"   Faithfulness:      {overall['faithfulness']:.2%}")
        print(f"   Answer Relevancy:  {overall['answer_relevancy']:.2%}")
        print(f"   Context Precision: {overall['context_precision']:.2%}")
        print(f"   Context Recall:    {overall['context_recall']:.2%}")
        print(f"   ───────────────────────────")
        print(f"   RAGAS Score:       {overall['ragas_score']:.2%}")
        
        print(f"\n⏱️  TIMING METRICS:")
        timings = summary['timings']
        print(f"   Avg Retrieval: {timings['avg_retrieval_ms']:.1f}ms")
        print(f"   Avg LLM:       {timings['avg_llm_ms']:.1f}ms")
        print(f"   Avg Total:     {timings['avg_total_ms']:.1f}ms")
        
        print(f"\n📚 BY CATEGORY:")
        for cat, metrics in summary['by_category'].items():
            print(f"   {cat}: {metrics['ragas_score']:.2%} (n={metrics['count']})")
        
        print(f"\n{'='*60}\n")


# =============================================================================
# COMPARISON TESTS
# =============================================================================

def run_ablation_study():
    """Compare different retrieval configurations"""
    
    configs = [
        ("BM25 Only", {"bm25_weight": 1.0, "faiss_weight": 0.0, "use_reranker": False}),
        ("Semantic Only", {"bm25_weight": 0.0, "faiss_weight": 1.0, "use_reranker": False}),
        ("Hybrid (0.3/0.7)", {"bm25_weight": 0.3, "faiss_weight": 0.7, "use_reranker": False}),
        ("Hybrid + Reranker", {"bm25_weight": 0.3, "faiss_weight": 0.7, "use_reranker": True}),
    ]
    
    results = {}
    
    for name, overrides in configs:
        print(f"\n\n{'#'*60}")
        print(f"# TESTING: {name}")
        print(f"{'#'*60}")
        
        config = EvalConfig()
        config.use_reranker = overrides.get('use_reranker', True)
        
        runner = EvaluationRunner(config)
        summary = runner.run_evaluation(num_samples=10)  # Quick test
        
        results[name] = summary['overall']
    
    # Print comparison
    print(f"\n\n{'='*70}")
    print("ABLATION STUDY RESULTS")
    print(f"{'='*70}")
    print(f"{'Method':<25} {'Faithfulness':>12} {'Relevancy':>12} {'Precision':>12} {'Recall':>12} {'RAGAS':>10}")
    print("-" * 70)
    
    for name, metrics in results.items():
        print(f"{name:<25} {metrics['faithfulness']:>11.1%} {metrics['answer_relevancy']:>11.1%} "
              f"{metrics['context_precision']:>11.1%} {metrics['context_recall']:>11.1%} {metrics['ragas_score']:>9.1%}")


# =============================================================================
# MAIN
# =============================================================================

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="RAG-LMS RAGAS Evaluation")
    parser.add_argument('--quick', action='store_true', help='Quick test (10 samples)')
    parser.add_argument('--full', action='store_true', help='Full evaluation (all samples)')
    parser.add_argument('--ablation', action='store_true', help='Run ablation study')
    parser.add_argument('--samples', type=int, default=None, help='Custom sample count')
    parser.add_argument('--chatbot-id', type=str, default=None, help='Specific chatbot ID to test')
    parser.add_argument('--dataset', type=str, default=None, help='Path to evaluation dataset JSON')
    parser.add_argument('--fast', action='store_true', help='Fast mode (embeddings only, no LLM metric calls)')
    parser.add_argument('--detailed', action='store_true', help='Detailed mode (LLM-based metric evaluation)')
    
    args = parser.parse_args()
    
    if args.ablation:
        run_ablation_study()
    else:
        config = EvalConfig()
        
        if args.chatbot_id:
            config.chatbot_id = args.chatbot_id
        
        if args.dataset:
            config.dataset_path = args.dataset
        
        if args.quick:
            num_samples = config.quick_samples
        elif args.full:
            num_samples = None  # All samples
        elif args.samples:
            num_samples = args.samples
        else:
            num_samples = config.quick_samples  # Default to quick
        
        # Determine fast_mode (default: True for speed)
        fast_mode = not args.detailed  # --detailed enables full LLM evaluation
        if args.fast:
            fast_mode = True
        
        print(f"🔧 Mode: {'Fast (embeddings)' if fast_mode else 'Detailed (LLM evaluation)'}")
        
        runner = EvaluationRunner(config, fast_mode=fast_mode)
        runner.run_evaluation(num_samples=num_samples)


if __name__ == "__main__":
    main()
