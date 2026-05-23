import logging
import numpy as np
from typing import List, Dict, Any
from collections import Counter
from itertools import combinations
from sklearn.cluster import AgglomerativeClustering, KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import calinski_harabasz_score, davies_bouldin_score, silhouette_score

from .model_loader import model_loader
from ..models.processing_config import ProcessingConfig

logger = logging.getLogger(__name__)

# Run metadata (single source of truth for evaluation jobs; model file still uses same id in model_loader)
EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
PREPROCESSING_DESCRIPTOR = "strip_lowercase_collapse_ws"
EMBEDDING_DESCRIPTOR = "sbert_unit_normalized"
DEFAULT_DISTANCE_THRESHOLD = 1.0
SIMILAR_GROUP_PAIR_MAX = 5
DEFAULT_CONFIG = ProcessingConfig()
LABEL_STRATEGY_CURRENT_READABILITY = "current_readability_heuristic"
LABEL_STRATEGY_NEAREST_TO_CENTROID = "nearest_to_centroid"
LABEL_STRATEGY_CENTROID_TOP_N_READABILITY = "centroid_top_n_readability"
PRODUCTION_LABEL_STRATEGY = LABEL_STRATEGY_CENTROID_TOP_N_READABILITY
LABEL_STRATEGY_TOP_N = 3


def choose_canonical_name(raw_list: List[str]) -> str:
    """
    Pick a short, representative label for a cluster after clustering.
    Candidates are already preprocessed (lowercase, collapsed whitespace).
    Tie-break: fewer words, then shorter string, then higher frequency, then lexicographic.
    """
    if not raw_list:
        return ""
    counts = Counter(raw_list)
    return min(counts.keys(), key=lambda candidate: _readability_sort_key(candidate, counts))


def _readability_sort_key(candidate: str, counts: Counter) -> tuple:
    word_count = len(candidate.split())
    return (word_count, len(candidate), -counts[candidate], candidate)


def _centroid_ranked_label_candidates(
    raw_list: List[str],
    group_embeddings: np.ndarray,
    centroid: np.ndarray,
) -> list[dict[str, Any]]:
    """Rank unique cluster answers by highest answer-to-centroid cosine similarity."""
    if not raw_list or group_embeddings is None or len(group_embeddings) == 0:
        return []
    best_by_answer: dict[str, dict[str, Any]] = {}
    for idx, answer in enumerate(raw_list):
        similarity = _cosine_similarity(_unit_normalize(group_embeddings[idx]), centroid)
        current = best_by_answer.get(answer)
        if current is None or similarity > current["similarity"]:
            best_by_answer[answer] = {
                "answer": answer,
                "similarity": similarity,
                "index": idx,
            }
    counts = Counter(raw_list)
    return sorted(
        best_by_answer.values(),
        key=lambda item: (
            -item["similarity"],
            _readability_sort_key(item["answer"], counts),
            item["index"],
        ),
    )


def choose_canonical_name_from_embeddings(
    raw_list: List[str],
    group_embeddings: np.ndarray,
    centroid: np.ndarray,
    strategy: str = LABEL_STRATEGY_CURRENT_READABILITY,
    top_n: int = LABEL_STRATEGY_TOP_N,
) -> str:
    """
    Choose a cluster label with an explicit strategy.

    - current_readability_heuristic: existing text-only behavior.
    - nearest_to_centroid: medoid-like member closest to the cluster centroid.
    - centroid_top_n_readability: choose the most readable label among the top-N
      centroid-nearest members.
    """
    if not raw_list:
        return ""
    if strategy == LABEL_STRATEGY_CURRENT_READABILITY:
        return choose_canonical_name(raw_list)

    ranked = _centroid_ranked_label_candidates(raw_list, group_embeddings, centroid)
    if not ranked:
        return choose_canonical_name(raw_list)

    if strategy == LABEL_STRATEGY_NEAREST_TO_CENTROID:
        return ranked[0]["answer"]

    if strategy == LABEL_STRATEGY_CENTROID_TOP_N_READABILITY:
        counts = Counter(raw_list)
        n = max(1, min(top_n, len(ranked)))
        candidates = [item["answer"] for item in ranked[:n]]
        return min(candidates, key=lambda candidate: _readability_sort_key(candidate, counts))

    raise ValueError(f"Unsupported label strategy: {strategy}")


def _unit_normalize(vec: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vec))
    if norm == 0.0:
        return vec
    return vec / norm


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))


def _normalize_text(text: str) -> str:
    return " ".join(text.strip().lower().split())


def _matches_excluded_phrase(answer: str, excluded_words: List[str]) -> bool:
    if not excluded_words:
        return False
    for phrase in excluded_words:
        if answer == phrase or phrase in answer:
            return True
    return False


def _metric_norm(v: float, lo: float, hi: float) -> float:
    if hi <= lo:
        return 1.0
    return (v - lo) / (hi - lo)


def _format_for_embedding(model_name: str, answers: List[str]) -> List[str]:
    if model_name == "intfloat/multilingual-e5-large-instruct":
        prefix = "Instruct: Cluster semantically similar short survey responses.\nQuery: "
        return [f"{prefix}{a}" for a in answers]
    return answers


def _cluster_labels_auto_k(embeddings: np.ndarray, min_k: int, max_k: int) -> tuple[np.ndarray, Dict[str, Any]]:
    n = embeddings.shape[0]
    lower = max(2, min_k)
    # silhouette/Calinski-Harabasz/Davies-Bouldin are only valid when 2 <= k < n
    upper = min(max_k, n - 1)

    if n < 3 or lower > upper:
        return np.zeros(n, dtype=int), {
            "min_k": lower,
            "max_k": upper,
            "selected_k": 1,
            "silhouette": None,
            "calinski_harabasz": None,
            "davies_bouldin": None,
            "k_selection_diagnostics": [],
        }

    candidates: List[Dict[str, Any]] = []
    diagnostics: List[Dict[str, Any]] = []
    for k in range(lower, upper + 1):
        if k >= n:
            continue
        km = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = km.fit_predict(embeddings)
        try:
            sil = float(silhouette_score(embeddings, labels))
            ch = float(calinski_harabasz_score(embeddings, labels))
            db = float(davies_bouldin_score(embeddings, labels))
        except Exception:
            sil = None
            ch = None
            db = None
        candidates.append(
            {
                "k": k,
                "labels": labels,
                "silhouette": sil,
                "calinski_harabasz": ch,
                "davies_bouldin": db,
                "normalized_silhouette": None,
                "normalized_calinski_harabasz": None,
                "normalized_davies_bouldin": None,
                "combined_score": None,
            }
        )

    valid_candidates = [
        c for c in candidates
        if c["silhouette"] is not None
        and c["calinski_harabasz"] is not None
        and c["davies_bouldin"] is not None
    ]
    if not candidates:
        return np.zeros(n, dtype=int), {
            "min_k": lower,
            "max_k": upper,
            "selected_k": 1,
            "silhouette": None,
            "calinski_harabasz": None,
            "davies_bouldin": None,
            "k_selection_diagnostics": [],
        }

    if valid_candidates:
        sil_vals = [c["silhouette"] for c in valid_candidates]
        ch_vals = [c["calinski_harabasz"] for c in valid_candidates]
        db_vals = [c["davies_bouldin"] for c in valid_candidates]
        sil_lo, sil_hi = min(sil_vals), max(sil_vals)
        ch_lo, ch_hi = min(ch_vals), max(ch_vals)
        db_lo, db_hi = min(db_vals), max(db_vals)

        for c in valid_candidates:
            s_norm = _metric_norm(c["silhouette"], sil_lo, sil_hi)
            ch_norm = _metric_norm(c["calinski_harabasz"], ch_lo, ch_hi)
            db_norm = _metric_norm(c["davies_bouldin"], db_lo, db_hi)
            db_norm_inv = 1.0 - db_norm
            c["normalized_silhouette"] = s_norm
            c["normalized_calinski_harabasz"] = ch_norm
            c["normalized_davies_bouldin"] = db_norm
            c["combined_score"] = (s_norm + ch_norm + db_norm_inv) / 3.0

        best = max(valid_candidates, key=lambda c: (c["combined_score"], c["silhouette"]))
    else:
        best = candidates[0]
        best["combined_score"] = None

    for c in candidates:
        diagnostics.append(
            {
                "k": c["k"],
                "silhouette": round(c["silhouette"], 6) if c["silhouette"] is not None else None,
                "calinski_harabasz": round(c["calinski_harabasz"], 6) if c["calinski_harabasz"] is not None else None,
                "davies_bouldin": round(c["davies_bouldin"], 6) if c["davies_bouldin"] is not None else None,
                "normalized_silhouette": round(c["normalized_silhouette"], 6) if c["normalized_silhouette"] is not None else None,
                "normalized_calinski_harabasz": round(c["normalized_calinski_harabasz"], 6) if c["normalized_calinski_harabasz"] is not None else None,
                "normalized_davies_bouldin": round(c["normalized_davies_bouldin"], 6) if c["normalized_davies_bouldin"] is not None else None,
                "combined_score": round(c["combined_score"], 6) if c["combined_score"] is not None else None,
                "selected": c["k"] == best["k"],
            }
        )

    return best["labels"], {
        "min_k": lower,
        "max_k": upper,
        "selected_k": best["k"],
        "silhouette": round(best["silhouette"], 6) if best["silhouette"] is not None else None,
        "calinski_harabasz": round(best["calinski_harabasz"], 6) if best["calinski_harabasz"] is not None else None,
        "davies_bouldin": round(best["davies_bouldin"], 6) if best["davies_bouldin"] is not None else None,
        "k_selection_diagnostics": diagnostics,
    }


def group_responses(
    raw_answers: List[str],
    processing_config: ProcessingConfig | None = None,
) -> Dict[str, Any]:
    """
    Groups responses using Semantic Vector Embeddings and Hierarchical Clustering.
    
    Process:
    1. Preprocessing: Clean text.
    2. Vectorization: Convert text -> 384-dim Vectors (SBERT).
    3. Clustering: Group vectors that are close in space (Euclidean distance).
    4. Visualization: Reduce to 2D using PCA.
    5. Aggregation: Format results for the API.
    """
    cfg = processing_config or DEFAULT_CONFIG
    logger.info(f"🧠 Starting AI grouping for {len(raw_answers)} responses with {cfg.clustering_method}.")
    clean_answers_all = [_normalize_text(ans) for ans in raw_answers if ans and ans.strip()]
    excluded_words = cfg.excluded_words if cfg.use_excluded_words else []
    clean_answers = [
        ans for ans in clean_answers_all
        if not _matches_excluded_phrase(ans, excluded_words)
    ]
    excluded_answer_count = len(clean_answers_all) - len(clean_answers)
    if not clean_answers:
        return {
            "grouped_answers": [],
            "similar_group_pairs": [],
            "run_metadata": {
                "clustering_method": cfg.clustering_method,
                "embedding_model": cfg.embedding_model,
                "distance_threshold": cfg.distance_threshold,
                "min_k": cfg.min_k,
                "max_k": cfg.max_k,
                "fixed_k": cfg.fixed_k,
                "selected_k": None,
                "silhouette": None,
                "calinski_harabasz": None,
                "davies_bouldin": None,
                "excluded_answer_count": excluded_answer_count,
                "processed_answer_count": 0,
                "excluded_words_used": excluded_words,
                "label_strategy": PRODUCTION_LABEL_STRATEGY,
            },
        }
    
    if len(clean_answers) < 2:
        return {
            "grouped_answers": [{
                "canonical_name": clean_answers[0],
                "count": 1,
                "raw_answers_in_group": clean_answers,
                "coordinates": {"x": 0.0, "y": 0.0},
                "response_similarities": [{"answer": clean_answers[0], "similarity": 1.0}],
            }],
            "similar_group_pairs": [],
            "run_metadata": {
                "clustering_method": cfg.clustering_method,
                "embedding_model": cfg.embedding_model,
                "distance_threshold": cfg.distance_threshold,
                "min_k": cfg.min_k,
                "max_k": cfg.max_k,
                "fixed_k": cfg.fixed_k,
                "selected_k": 1,
                "silhouette": None,
                "calinski_harabasz": None,
                "davies_bouldin": None,
                "excluded_answer_count": excluded_answer_count,
                "processed_answer_count": 1,
                "excluded_words_used": excluded_words,
                "label_strategy": PRODUCTION_LABEL_STRATEGY,
            },
        }

    try:
        model = model_loader.get_model(cfg.embedding_model)
        model_inputs = _format_for_embedding(cfg.embedding_model, clean_answers)
        embeddings = model.encode(model_inputs, normalize_embeddings=True)
    except Exception as e:
        logger.error(f"Failed to encode vectors: {e}")
        raise e

    run_meta: Dict[str, Any] = {
        "clustering_method": cfg.clustering_method,
        "embedding_model": cfg.embedding_model,
        "distance_threshold": cfg.distance_threshold,
        "min_k": cfg.min_k,
        "max_k": cfg.max_k,
        "fixed_k": cfg.fixed_k,
        "selected_k": None,
        "silhouette": None,
        "calinski_harabasz": None,
        "davies_bouldin": None,
        "excluded_answer_count": excluded_answer_count,
        "processed_answer_count": len(clean_answers),
        "excluded_words_used": excluded_words,
        "label_strategy": PRODUCTION_LABEL_STRATEGY,
    }

    try:
        if cfg.clustering_method == "agglomerative_threshold":
            clustering = AgglomerativeClustering(
                n_clusters=None,
                distance_threshold=cfg.distance_threshold,
                metric='euclidean',
                linkage='ward'
            )
            cluster_labels = clustering.fit_predict(embeddings)
        elif cfg.clustering_method == "kmeans_auto_k":
            cluster_labels, km_meta = _cluster_labels_auto_k(embeddings, cfg.min_k, cfg.max_k)
            run_meta.update(km_meta)
        elif cfg.clustering_method == "kmeans_fixed_k":
            if len(clean_answers) < 2:
                cluster_labels = np.zeros(len(clean_answers), dtype=int)
                run_meta["selected_k"] = 1
                run_meta["fixed_k"] = 1
            else:
                fixed_k = cfg.fixed_k or 2
                fixed_k = max(2, min(fixed_k, len(clean_answers)))
                km = KMeans(n_clusters=fixed_k, random_state=42, n_init=10)
                cluster_labels = km.fit_predict(embeddings)
                run_meta["fixed_k"] = fixed_k
                run_meta["selected_k"] = fixed_k
        else:
            raise ValueError(f"Unsupported clustering method: {cfg.clustering_method}")
    except Exception as e:
        logger.error(f"Clustering failed: {e}")
        raise e

    try:
        n_components = 2
        if len(clean_answers) < 2:
             n_components = 1
             
        pca = PCA(n_components=n_components)
        coords_2d = pca.fit_transform(embeddings)
    except Exception as e:
        logger.error(f"PCA failed: {e}")
        coords_2d = np.zeros((len(clean_answers), 2))

    groups_map = {}

    for i, label in enumerate(cluster_labels):
        original_text = clean_answers[i]
        label_str = str(label)
        
        if label_str not in groups_map:
            groups_map[label_str] = {
                "raw_answers": [],
                "vectors_indices": [],
            }
        
        groups_map[label_str]["raw_answers"].append(original_text)
        groups_map[label_str]["vectors_indices"].append(i)

    final_groups = []
    centroid_by_label: Dict[str, np.ndarray] = {}
    
    for label, data in groups_map.items():
        raw_list = data["raw_answers"]
        
        indices = data["vectors_indices"]
        group_coords = coords_2d[indices] 
        group_embeddings = embeddings[indices]
        centroid = _unit_normalize(np.mean(group_embeddings, axis=0))
        centroid_by_label[label] = centroid
        response_similarities = [
            {
                "answer": clean_answers[idx],
                "similarity": round(_cosine_similarity(_unit_normalize(embeddings[idx]), centroid), 4),
            }
            for idx in indices
        ]
        response_similarities.sort(key=lambda item: item["similarity"], reverse=True)
        canonical_name = choose_canonical_name_from_embeddings(
            raw_list,
            group_embeddings,
            centroid,
            strategy=PRODUCTION_LABEL_STRATEGY,
            top_n=LABEL_STRATEGY_TOP_N,
        )
        
        if group_coords.ndim == 1:
            avg_x = float(group_coords[0])
            avg_y = float(group_coords[1]) if group_coords.shape[0] > 1 else 0.0
        else:
            avg_x = float(np.mean(group_coords[:, 0]))
            avg_y = float(np.mean(group_coords[:, 1]))

        final_groups.append({
            "canonical_name": canonical_name,
            "count": len(raw_list),
            "raw_answers_in_group": raw_list,
            "coordinates": {"x": avg_x, "y": avg_y},
            "response_similarities": response_similarities,
            "_cluster_label": label,
        })

    final_groups.sort(key=lambda x: x["count"], reverse=True)

    similar_group_pairs = []
    for i, j in combinations(range(len(final_groups)), 2):
        a = final_groups[i]
        b = final_groups[j]
        centroid_a = centroid_by_label.get(a["_cluster_label"])
        centroid_b = centroid_by_label.get(b["_cluster_label"])
        if centroid_a is None or centroid_b is None:
            continue
        similarity = round(_cosine_similarity(centroid_a, centroid_b), 4)
        similar_group_pairs.append({
            "source_group": a["canonical_name"],
            "target_group": b["canonical_name"],
            "similarity": similarity,
        })
    similar_group_pairs.sort(key=lambda item: item["similarity"], reverse=True)
    similar_group_pairs = similar_group_pairs[:SIMILAR_GROUP_PAIR_MAX]
    for g in final_groups:
        g.pop("_cluster_label", None)
    
    logger.info(f" AI Grouping finished. Found {len(final_groups)} semantic groups.")
    return {
        "grouped_answers": final_groups,
        "similar_group_pairs": similar_group_pairs,
        "run_metadata": run_meta,
    }
