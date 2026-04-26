import logging
import numpy as np
from typing import List, Dict, Any
from collections import Counter
from itertools import combinations
from sklearn.cluster import AgglomerativeClustering
from sklearn.decomposition import PCA

from .model_loader import model_loader

logger = logging.getLogger(__name__)

# Run metadata (single source of truth for evaluation jobs; model file still uses same id in model_loader)
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
PREPROCESSING_DESCRIPTOR = "strip_lowercase_collapse_ws"
EMBEDDING_DESCRIPTOR = "sbert_unit_normalized"
DEFAULT_DISTANCE_THRESHOLD = 1.0
SIMILAR_GROUP_PAIR_MAX = 5


def choose_canonical_name(raw_list: List[str]) -> str:
    """
    Pick a short, representative label for a cluster after clustering.
    Candidates are already preprocessed (lowercase, collapsed whitespace).
    Tie-break: fewer words, then shorter string, then higher frequency, then lexicographic.
    """
    if not raw_list:
        return ""
    counts = Counter(raw_list)

    def sort_key(candidate: str) -> tuple:
        word_count = len(candidate.split())
        return (word_count, len(candidate), -counts[candidate], candidate)

    return min(counts.keys(), key=sort_key)


def _unit_normalize(vec: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vec))
    if norm == 0.0:
        return vec
    return vec / norm


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))


def group_responses(
    raw_answers: List[str], distance_threshold: float = DEFAULT_DISTANCE_THRESHOLD
) -> List[Dict[str, Any]]:
    """
    Groups responses using Semantic Vector Embeddings and Hierarchical Clustering.
    
    Process:
    1. Preprocessing: Clean text.
    2. Vectorization: Convert text -> 384-dim Vectors (SBERT).
    3. Clustering: Group vectors that are close in space (Euclidean distance).
    4. Visualization: Reduce to 2D using PCA.
    5. Aggregation: Format results for the API.
    """
    logger.info(f"🧠 Starting AI grouping for {len(raw_answers)} responses.")

    clean_answers = [
        " ".join(ans.strip().lower().split())
        for ans in raw_answers
        if ans and ans.strip()
    ]
    if not clean_answers:
        return {"grouped_answers": [], "similar_group_pairs": []}
    
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
        }

    try:
        model = model_loader.get_model()
        embeddings = model.encode(clean_answers, normalize_embeddings=True)
    except Exception as e:
        logger.error(f"Failed to encode vectors: {e}")
        raise e

    try:
        clustering = AgglomerativeClustering(
            n_clusters=None, 
            distance_threshold=distance_threshold, 
            metric='euclidean', 
            linkage='ward'
        )
        cluster_labels = clustering.fit_predict(embeddings)
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
        canonical_name = choose_canonical_name(raw_list)
        
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
    }