import logging
import numpy as np
from typing import List, Dict, Any
from collections import Counter
from sklearn.cluster import AgglomerativeClustering
from sklearn.decomposition import PCA

from .model_loader import model_loader

logger = logging.getLogger(__name__)

def group_responses(raw_answers: List[str], distance_threshold: float = 1.5) -> List[Dict[str, Any]]:
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

    clean_answers = [ans.strip() for ans in raw_answers if ans and ans.strip()]
    if not clean_answers:
        return []
    
    if len(clean_answers) < 2:
        return [{
            "canonical_name": clean_answers[0],
            "count": 1,
            "raw_answers_in_group": clean_answers,
            "coordinates": {"x": 0.0, "y": 0.0}
        }]

    try:
        model = model_loader.get_model()
        embeddings = model.encode(clean_answers)
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
                "vectors_indices": [] 
            }
        
        groups_map[label_str]["raw_answers"].append(original_text)
        groups_map[label_str]["vectors_indices"].append(i)

    final_groups = []
    
    for label, data in groups_map.items():
        raw_list = data["raw_answers"]
        
        most_common_name = Counter(raw_list).most_common(1)[0][0]
        indices = data["vectors_indices"]
        group_coords = coords_2d[indices] 
        
        if group_coords.ndim == 1:
            avg_x = float(group_coords[0])
            avg_y = float(group_coords[1]) if group_coords.shape[0] > 1 else 0.0
        else:
            avg_x = float(np.mean(group_coords[:, 0]))
            avg_y = float(np.mean(group_coords[:, 1]))

        final_groups.append({
            "canonical_name": most_common_name,
            "count": len(raw_list),
            "raw_answers_in_group": raw_list,
            "coordinates": {"x": avg_x, "y": avg_y}
        })

    final_groups.sort(key=lambda x: x["count"], reverse=True)
    
    logger.info(f" AI Grouping finished. Found {len(final_groups)} semantic groups.")
    return final_groups