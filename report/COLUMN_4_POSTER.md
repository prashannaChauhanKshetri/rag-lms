# COLUMN 4: EVALUATION, LIMITATIONS & FUTURE WORK

## 4.1 EVALUATION METHODOLOGY

I evaluated the RAG pipeline using the **RAGAS framework** (Retrieval Augmented Generation Assessment), which provides four standard metrics for measuring RAG system quality. Testing was conducted on **65 questions** across three Nepal CDC textbooks: Mathematics Grade 10 (25 questions), English Grade 5 (25 questions), and Social Studies Grade 7 in Nepali (15 questions).

### RAGAS Metrics Explained

| Metric | What It Measures |
|--------|------------------|
| **Faithfulness** | Is the generated answer grounded in the retrieved context? Higher scores mean fewer hallucinations. |
| **Answer Relevancy** | Does the answer actually address the question asked? Measured via embedding similarity. |
| **Context Precision** | Are relevant documents ranked higher than irrelevant ones? Uses DCG weighting. |
| **Context Recall** | Does the retrieved context contain enough information to answer the question? |

---

## 4.2 EVALUATION RESULTS BY SUBJECT

| Subject | Questions | Faithfulness | Relevancy | Precision | Recall | **RAGAS** |
|---------|-----------|--------------|-----------|-----------|--------|-----------|
| Mathematics (Grade 10) | 25 | 50.1% | 69.0% | **97.1%** | 60.2% | **69.1%** |
| English (Grade 5) | 25 | 53.6% | 64.5% | **95.5%** | 52.0% | **66.4%** |
| Social Studies Nepali (Grade 7) | 15 | 52.9% | 52.3% | 82.3% | 45.1% | **58.1%** |
| **Average** | **65** | **52.2%** | **62.0%** | **91.6%** | **52.4%** | **64.5%** |

### Key Observations

**Retrieval works well.** Context Precision averaged 91.6%, meaning the hybrid search pipeline consistently retrieves relevant textbook passages and ranks them correctly. The 3-stage retrieval (BM25 + semantic + cross-encoder reranking) performs as designed.

**Answer generation needs improvement.** Faithfulness (52.2%) and Context Recall (52.4%) are moderate. The LLM sometimes generates content beyond what the retrieved passages support, or the retrieved passages do not fully cover the ground truth answer.

**Mathematics performs best.** After implementing a specialized math prompt template with structured formatting requirements (show formulas, define variables, numbered steps), the Mathematics RAGAS score reached 69.1%.

**Nepali content is harder.** Social Studies in Nepali scored lowest (58.1%). OCR quality on Devanagari script and multilingual embedding limitations affect both retrieval and generation.

---

## 4.3 MATH TEMPLATE IMPROVEMENT

I discovered that generic prompts produced poor results for mathematical questions. The LLM would give vague explanations instead of showing formulas and step-by-step solutions. I implemented a specialized math template with strict formatting rules.

| Metric | Before (Generic) | After (Math Template) | Change |
|--------|------------------|----------------------|--------|
| RAGAS Score | 43.8% | 69.1% | **+25.3 points** |
| Faithfulness | 13.3% | 50.1% | **+36.8 points** |
| Answer Relevancy | 5.2% | 69.0% | **+63.8 points** |

The math template enforces: formula notation, variable definitions, numbered steps, concrete numerical examples, and answer verification. This dramatically improved both accuracy and usefulness for students.

---

## 4.4 SYSTEM PERFORMANCE

| Metric | Value |
|--------|-------|
| Average retrieval time (hybrid + rerank) | 426ms |
| Average LLM response time | 6.5 seconds |
| Total time per question | ~7 seconds |
| Embedding model | paraphrase-multilingual-MiniLM-L12-v2 (384 dim) |
| Reranker model | mmarco-mMiniLMv2-L12-H384-v1 |
| LLM | Llama 3.3 70B via Groq API |

---

## 4.5 LIMITATIONS

### Technical Limitations

**LLM API Dependency.** The system requires internet connectivity to access the Groq API for LLM inference. Schools with unreliable internet cannot use the AI tutoring feature consistently.

**Nepali OCR Quality.** Tesseract OCR achieves approximately 85% accuracy on Devanagari script from scanned textbooks. Some passages contain errors that propagate through retrieval and generation.

**Context Window Constraints.** Only 5 chunks (~2,500 tokens) are passed to the LLM due to "Lost in the Middle" attention degradation. Questions requiring broader context may receive incomplete answers.

**No Real-time Learning.** The system cannot learn from corrections during a session. Instructor feedback updates require manual reprocessing of the knowledge base.

### Evaluation Limitations

**Limited Test Sample.** 65 questions across 3 books is a small sample. Broader testing across all grade levels and subjects would provide more reliable metrics.

**Ground Truth Subjectivity.** Expected answers were written by me based on textbook content. A teacher panel review would improve ground truth quality.

**Embedding-based Scoring.** RAGAS metrics use embedding similarity rather than human judgment. Some semantically correct answers may score lower than expected due to different phrasing.

---

## 4.6 FUTURE WORK

| Priority | Enhancement | Rationale |
|----------|-------------|-----------|
| **High** | Local LLM deployment | Enable offline operation for schools without reliable internet using quantized Llama 3.1 8B |
| **High** | Nepali embedding fine-tuning | Improve retrieval quality for Devanagari content |
| **High** | Subject-specific templates | Extend the math template approach to Science, English grammar, and Social Studies |
| **Medium** | Voice interface | Speech input/output for accessibility and younger students |
| **Medium** | Adaptive learning paths | Track student performance and recommend personalized content |
| **Low** | Parent notification portal | Progress reports and alerts for guardians |
| **Low** | Predictive analytics | Early identification of struggling students |

---

## 4.7 CONCLUSION

Gyana RAG-LMS demonstrates that a well-engineered retrieval pipeline can transform static PDF textbooks into an interactive AI tutor. The 3-stage hybrid retrieval (BM25 + semantic search + cross-encoder reranking) achieved 91.6% context precision, confirming that relevant passages are retrieved accurately.

The overall RAGAS score of 64.5% indicates the system provides useful responses but has room for improvement, particularly in faithfulness and context recall. The +25 point improvement from the math template shows that subject-specific prompt engineering significantly improves answer quality.

For schools in Nepal and similar contexts with high student-to-teacher ratios, this system offers a practical solution: a single uploaded textbook becomes an always-available tutor that cites its sources and can be verified by students.

---

## 4.8 REFERENCES

[1] Lewis, P. et al. (2020) "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", NeurIPS

[2] Karpukhin, V. et al. (2020) "Dense Passage Retrieval for Open-Domain QA", EMNLP

[3] Liu, N.F. et al. (2023) "Lost in the Middle: How Language Models Use Long Contexts", TACL

[4] Asai, A. et al. (2024) "Self-RAG: Learning to Retrieve, Generate, and Critique", ICLR

[5] Reimers, N. & Gurevych, I. (2019) "Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks", EMNLP

[6] Vaswani, A. et al. (2017) "Attention Is All You Need", NeurIPS

[7] Es, S. et al. (2024) "RAGAS: Automated Evaluation of Retrieval Augmented Generation", EACL

[8] Nogueira, R. & Cho, K. (2019) "Passage Re-ranking with BERT", arXiv

[9] Auer, C. et al. (2025) "Docling: AI-Driven Document Conversion", IBM Research
