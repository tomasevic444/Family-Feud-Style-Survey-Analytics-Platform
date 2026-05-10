# Research and Evaluation Notes

## 1. Project NLP baseline
- SentenceTransformer (SBERT-style) embeddings were used from the beginning.
- Initial model: `sentence-transformers/all-MiniLM-L6-v2`.
- Initial clustering: `AgglomerativeClustering` with `linkage='ward'`, Euclidean distance threshold.
- PCA projection is kept for 2D coordinates in visualization.
- Canonical naming started from frequency-heavy representative selection.

## 2. Threshold tuning
- Threshold sweeps were run on labeled datasets (general, realistic, pet/challenging).
- Early higher threshold settings (for example around `1.5`) merged too aggressively.
- More conservative thresholds reduced false merges at the cost of some false splits.
- Selection principle: prioritize fewer harmful cross-topic merges over perfect synonym compression.

| Candidate behavior | Effect |
|---|---|
| Higher threshold | Fewer clusters, more false merges |
| Lower threshold | More clusters, more false splits |
| Conservative middle | Better practical review/merge workflow |

## 3. Text preprocessing
- Lowercase conversion.
- Trim leading/trailing whitespace.
- Collapse repeated internal whitespace.
- Impact: fewer accidental split clusters caused by formatting/casing variance.

## 4. Embedding normalization
- `normalize_embeddings=True` was enabled for encoding.
- Rationale: more stable similarity geometry for semantic clustering.
- This aligns with robust semantic-clustering practice in analyst-oriented tools.
- Impact: consistency improved; difficult semantic cases still require strategy/model tuning.

## 5. Canonical naming improvement
- Earlier naming leaned on frequency/mode behavior.
- Current deterministic heuristic prefers shorter cleaner labels with consistent tie-breaks.
- Benefit: improved readability in charts and admin list UI.
- Limitation: still heuristic and not ontology-aware.

## 6. Similarity review hints
- Added per-response similarity to cluster centroid.
- Added inter-cluster similarity pairs.
- Added `Potentially similar groups` UI section.
- Display filter uses 75% similarity threshold.
- Explicitly marked as review-only; no automatic merge.

## 7. Design rationale for advanced analytics features
- Normalized embeddings are useful in practice.
- Auto-K selection is valuable for non-fixed category tasks.
- Response-to-centroid and inter-cluster similarity improve analyst review quality.
- Analyst workflow should stay human-in-the-loop for merge decisions.
- CSV/reporting supports auditability of run outcomes.
- Future work ideas: duplicate/frequency-aware processing and embedding cache lifecycle tooling.

## 8. Model comparison
- Compared:
  - `sentence-transformers/all-MiniLM-L6-v2`
  - `intfloat/multilingual-e5-large-instruct`
  - `BAAI/bge-m3`
- Conclusion snapshot:
  - E5 + KMeans auto-K had slightly best total pairwise errors but highest operational cost.
  - MiniLM + KMeans auto-K was near-best with much lower operational risk.
  - BGE-M3 was useful but not clearly superior in this setup.

## 9. Clustering strategy comparison
- Compared:
  - `agglomerative_threshold`
  - `kmeans_auto_k`
- Wide-K experiments showed that narrow K caps can bias KMeans toward under-clustering.
- Model + strategy totals observed:
  - MiniLM + agglomerative total pairwise errors: **136**
  - MiniLM + kmeans_auto_k total pairwise errors: **105**
  - E5 + kmeans_auto_k total pairwise errors: **103**
  - BGE-M3 + kmeans_auto_k total pairwise errors: **138**

## 10. Current technical decisions
- Keep MiniLM as practical default model for now.
- Keep `agglomerative_threshold` as default production clustering until optional mode validation.
- Treat `kmeans_auto_k` as a serious production candidate.
- Keep similarity hints strictly review-only.
- Do not add unsafe custom prefix normalization.
- Do not switch to larger models without operational validation.

## 11. Planned next system improvements
- Processing Configuration panel for per-run settings.
- Optional production `kmeans_auto_k` mode.
- Persist processing settings used per run.
- Model selector with clear performance warnings.
- Run comparison view across historical runs.
- Duplicate/frequency-aware processing enhancements.
- Embedding cache optimization and observability.
