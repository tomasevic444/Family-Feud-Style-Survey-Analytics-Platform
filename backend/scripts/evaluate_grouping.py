"""
Minimal evaluation helper for semantic grouping (group_responses).

Does not change the NLP pipeline production code paths; evaluates either:
- default pipeline via app.nlp.nlp_pipeline.group_responses, or
- multi-model embedding comparison (--compare-models) using the same preprocessing
  and AgglomerativeClustering (ward, euclidean, distance_threshold) as production.

Run from the backend directory:
  python scripts/evaluate_grouping.py

Examples:
  python scripts/evaluate_grouping.py --input data/evaluation_answers.json --thresholds 1.0,1.5,2.0
  python scripts/evaluate_grouping.py \\
    --input data/evaluation_labeled_challenging_answers.json \\
    --thresholds 0.8,0.9,1.0 \\
    --compare-models sentence-transformers/all-MiniLM-L6-v2,intfloat/multilingual-e5-large-instruct \\
    --output data/evaluation_model_comparison_challenging.json --no-print
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import numpy as np
from sklearn.cluster import AgglomerativeClustering, KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import calinski_harabasz_score, davies_bouldin_score, silhouette_score

# Allow "from app...." when run as a script
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.nlp.nlp_pipeline import choose_canonical_name  # noqa: E402
from app.models.processing_config import ProcessingConfig  # noqa: E402

DEFAULT_INPUT = _BACKEND_ROOT / "data" / "evaluation_answers.json"
DEFAULT_THRESHOLDS = (1.0, 1.25, 1.5, 1.75, 2.0)

# Instruction-style prompts only where appropriate (multilingual-e5-large-instruct family).
E5_INSTRUCT_HINT = (
    "Instruct: Cluster semantically similar short survey responses.\nQuery: "
)


def preprocess_like_pipeline(raw_answers: list[str]) -> list[str]:
    """Match app.nlp.nlp_pipeline: strip, lowercase, collapse ws; skip empty."""
    out: list[str] = []
    for ans in raw_answers:
        if not ans:
            continue
        s = ans.strip()
        if not s:
            continue
        out.append(" ".join(s.lower().split()))
    return out


def align_labeled(raw_answers: list[str], expected_buckets: list[str]) -> tuple[list[str], list[str]]:
    """Skip empty originals; keep buckets aligned with cleaned strings."""
    clean: list[str] = []
    buckets: list[str] = []
    for a, b in zip(raw_answers, expected_buckets):
        if a is None or not str(a).strip():
            continue
        clean.append(" ".join(str(a).strip().lower().split()))
        buckets.append(b)
    return clean, buckets


def load_input(path: Path) -> tuple[list[str], list[str] | None]:
    """
    Returns (answers, expected_buckets or None).
    Supports: list of strings; {"answers": [str, ...]}; labeled {"answers": [{"text","expected_bucket"}, ...]}.
    """
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, list):
        return [str(x) for x in data], None

    if not isinstance(data, dict) or "answers" not in data:
        raise ValueError("JSON must be a list of strings or an object with an 'answers' array.")

    raw = data["answers"]
    if not raw:
        return [], None

    if isinstance(raw[0], str):
        return [str(x) for x in raw], None

    if isinstance(raw[0], dict) and "text" in raw[0] and "expected_bucket" in raw[0]:
        answers = [str(item["text"]) for item in raw]
        buckets = [str(item["expected_bucket"]) for item in raw]
        return answers, buckets

    raise ValueError(
        "Each answer must be a string or an object with 'text' and 'expected_bucket'."
    )


def _answer_to_cluster_map(groups: list[dict[str, Any]]) -> dict[str, int]:
    """Map each raw answer string to its cluster index (0 .. num_groups-1)."""
    m: dict[str, int] = {}
    for cluster_idx, g in enumerate(groups):
        for s in g["raw_answers_in_group"]:
            m[str(s)] = cluster_idx
    return m


def compute_pairwise_label_metrics(
    answers: list[str],
    expected_buckets: list[str],
    groups: list[dict[str, Any]],
) -> dict[str, int]:
    """
    same_bucket_split_pairs: same expected_bucket, different predicted cluster.
    different_bucket_merged_pairs: different expected_bucket, same predicted cluster.
    """
    cluster_of = _answer_to_cluster_map(groups)
    n = len(answers)
    same_bucket_split = 0
    different_bucket_merged = 0

    for i in range(n):
        for j in range(i + 1, n):
            a_i, a_j = answers[i], answers[j]
            if a_i not in cluster_of or a_j not in cluster_of:
                continue
            ci, cj = cluster_of[a_i], cluster_of[a_j]
            same_exp = expected_buckets[i] == expected_buckets[j]
            same_cl = ci == cj
            if same_exp and not same_cl:
                same_bucket_split += 1
            if not same_exp and same_cl:
                different_bucket_merged += 1

    return {
        "same_bucket_split_pairs": same_bucket_split,
        "different_bucket_merged_pairs": different_bucket_merged,
        "pairwise_total_errors": same_bucket_split + different_bucket_merged,
    }


def _encode_format_for_model(model_id: str) -> str:
    if "multilingual-e5-large-instruct" in model_id:
        return "e5_instruct"
    return "plain"


def _format_embed_inputs(model_id: str, clean_answers: list[str]) -> list[str]:
    if _encode_format_for_model(model_id) == "e5_instruct":
        return [f"{E5_INSTRUCT_HINT}{t}" for t in clean_answers]
    return list(clean_answers)


def _cluster_once(
    cluster_labels: np.ndarray,
    embeddings: np.ndarray,
    clean_answers: list[str],
) -> list[dict[str, Any]]:
    """Build grouped output from precomputed cluster labels."""
    n_components = 2 if len(clean_answers) >= 2 else 1
    try:
        pca = PCA(n_components=n_components)
        coords_2d = pca.fit_transform(embeddings)
    except Exception:
        coords_2d = np.zeros((len(clean_answers), 2))

    groups_map: dict[str, dict[str, Any]] = {}
    for i, label in enumerate(cluster_labels):
        text = clean_answers[i]
        ls = str(label)
        if ls not in groups_map:
            groups_map[ls] = {"raw_answers": [], "vectors_indices": []}
        groups_map[ls]["raw_answers"].append(text)
        groups_map[ls]["vectors_indices"].append(i)

    final_groups: list[dict[str, Any]] = []
    for _label, data in groups_map.items():
        raw_list = data["raw_answers"]
        indices = data["vectors_indices"]
        group_coords = coords_2d[indices]

        if group_coords.ndim == 1:
            avg_x = float(group_coords[0])
            avg_y = float(group_coords[1]) if group_coords.shape[0] > 1 else 0.0
        else:
            avg_x = float(np.mean(group_coords[:, 0]))
            avg_y = float(np.mean(group_coords[:, 1]))

        final_groups.append(
            {
                "canonical_name": choose_canonical_name(raw_list),
                "count": len(raw_list),
                "raw_answers_in_group": raw_list,
                "coordinates": {"x": avg_x, "y": avg_y},
            }
        )

    final_groups.sort(key=lambda x: x["count"], reverse=True)
    return final_groups


def _cluster_agglomerative_threshold(
    embeddings: np.ndarray,
    clean_answers: list[str],
    distance_threshold: float,
) -> list[dict[str, Any]]:
    clustering = AgglomerativeClustering(
        n_clusters=None,
        distance_threshold=distance_threshold,
        metric="euclidean",
        linkage="ward",
    )
    labels = clustering.fit_predict(embeddings)
    return _cluster_once(labels, embeddings, clean_answers)


def _minmax(v: float, lo: float, hi: float) -> float:
    if hi <= lo:
        return 1.0
    return (v - lo) / (hi - lo)


def _cluster_kmeans_auto_k(
    embeddings: np.ndarray,
    clean_answers: list[str],
    min_k: int,
    max_k: int,
) -> dict[str, Any]:
    """Select K with a simple normalized quality-score blend."""
    n = len(clean_answers)
    if n < 2:
        labels = np.zeros(n, dtype=int)
        groups = _cluster_once(labels, embeddings, clean_answers)
        return {
            "selected_k": 1,
            "num_clusters": len(groups),
            "groups": groups,
            "silhouette": None,
            "calinski_harabasz": None,
            "davies_bouldin": None,
            "k_search": [],
            "k_candidates": [],
        }

    lower = max(2, min_k)
    upper = min(max_k, n - 1)
    if lower > upper:
        lower = upper = max(2, n - 1)

    candidates: list[dict[str, Any]] = []
    for k in range(lower, upper + 1):
        km = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = km.fit_predict(embeddings)
        sil = float(silhouette_score(embeddings, labels))
        ch = float(calinski_harabasz_score(embeddings, labels))
        db = float(davies_bouldin_score(embeddings, labels))
        candidates.append(
            {
                "k": k,
                "labels": labels,
                "silhouette": sil,
                "calinski_harabasz": ch,
                "davies_bouldin": db,
            }
        )

    sil_vals = [c["silhouette"] for c in candidates]
    ch_vals = [c["calinski_harabasz"] for c in candidates]
    db_vals = [c["davies_bouldin"] for c in candidates]
    sil_lo, sil_hi = min(sil_vals), max(sil_vals)
    ch_lo, ch_hi = min(ch_vals), max(ch_vals)
    db_lo, db_hi = min(db_vals), max(db_vals)

    for c in candidates:
        s_norm = _minmax(c["silhouette"], sil_lo, sil_hi)
        ch_norm = _minmax(c["calinski_harabasz"], ch_lo, ch_hi)
        # Lower DB is better; invert after normalization.
        db_norm_inverted = 1.0 - _minmax(c["davies_bouldin"], db_lo, db_hi)
        c["combined_score"] = (s_norm + ch_norm + db_norm_inverted) / 3.0

    best = max(candidates, key=lambda c: (c["combined_score"], c["silhouette"]))
    groups = _cluster_once(best["labels"], embeddings, clean_answers)
    return {
        "selected_k": best["k"],
        "num_clusters": len(groups),
        "groups": groups,
        "silhouette": best["silhouette"],
        "calinski_harabasz": best["calinski_harabasz"],
        "davies_bouldin": best["davies_bouldin"],
        "k_search": [
            {
                "k": c["k"],
                "silhouette": c["silhouette"],
                "calinski_harabasz": c["calinski_harabasz"],
                "davies_bouldin": c["davies_bouldin"],
                "combined_score": c["combined_score"],
            }
            for c in candidates
        ],
        "k_candidates": candidates,
    }


def run_model_comparison(
    clean_answers: list[str],
    expected_buckets: list[str] | None,
    thresholds: list[float],
    model_ids: list[str],
    clustering_method: str = "agglomerative_threshold",
    min_k: int = 2,
    max_k: int = 15,
) -> dict[str, Any]:
    labeled = expected_buckets is not None and len(expected_buckets) == len(clean_answers)
    models_out: list[dict[str, Any]] = []

    for model_id in model_ids:
        entry: dict[str, Any] = {
            "model_id": model_id,
            "encode_format": _encode_format_for_model(model_id),
            "load_ok": False,
            "load_error": None,
            "load_seconds": None,
            "evaluation_seconds": None,
            "embedding_shape": None,
            "runs": [],
        }

        encoder: Callable[..., np.ndarray] | None = None
        t_load0 = time.perf_counter()
        try:
            # Lazy import to avoid downloading when not comparing models.
            from sentence_transformers import SentenceTransformer

            st_model = SentenceTransformer(model_id, trust_remote_code=True)
            fmts = _format_embed_inputs(model_id, clean_answers)

            def _encode_fmtd(texts: list[str]) -> np.ndarray:
                return np.asarray(st_model.encode(texts, normalize_embeddings=True))

            encoder = lambda: _encode_fmtd(fmts)  # noqa: E731
            _vec = encoder()
            entry["embedding_shape"] = list(_vec.shape)
            entry["load_ok"] = True
            entry["load_seconds"] = round(time.perf_counter() - t_load0, 3)
            embeddings = _vec
        except Exception:
            entry["load_error"] = traceback.format_exc()
            entry["load_seconds"] = round(time.perf_counter() - t_load0, 3)
            models_out.append(entry)
            continue

        t_eval0 = time.perf_counter()
        try:
            if clustering_method == "agglomerative_threshold":
                for t in thresholds:
                    groups = _cluster_agglomerative_threshold(
                        embeddings, clean_answers, distance_threshold=t
                    )
                    run = {
                        "clustering_method": clustering_method,
                        "distance_threshold": t,
                        "num_clusters": len(groups),
                        "groups": [
                            {
                                "canonical_name": g["canonical_name"],
                                "count": g["count"],
                                "raw_answers_in_group": g["raw_answers_in_group"],
                                "coordinates": g.get("coordinates"),
                            }
                            for g in groups
                        ],
                    }
                    if labeled:
                        run.update(
                            compute_pairwise_label_metrics(
                                clean_answers, expected_buckets, groups
                            )
                        )
                    entry["runs"].append(run)
            elif clustering_method == "kmeans_auto_k":
                km = _cluster_kmeans_auto_k(
                    embeddings, clean_answers, min_k=min_k, max_k=max_k
                )
                groups = km["groups"]
                run = {
                    "clustering_method": clustering_method,
                    "selected_k": km["selected_k"],
                    "num_clusters": km["num_clusters"],
                    "silhouette": km["silhouette"],
                    "calinski_harabasz": km["calinski_harabasz"],
                    "davies_bouldin": km["davies_bouldin"],
                    "k_search": km["k_search"],
                    "groups": [
                        {
                            "canonical_name": g["canonical_name"],
                            "count": g["count"],
                            "raw_answers_in_group": g["raw_answers_in_group"],
                            "coordinates": g.get("coordinates"),
                        }
                        for g in groups
                    ],
                }
                if labeled:
                    run.update(
                        compute_pairwise_label_metrics(
                            clean_answers, expected_buckets, groups
                        )
                    )
                entry["runs"].append(run)

                if labeled:
                    oracle_runs: list[dict[str, Any]] = []
                    for c in km.get("k_candidates", []):
                        groups_k = _cluster_once(c["labels"], embeddings, clean_answers)
                        metrics_k = compute_pairwise_label_metrics(
                            clean_answers, expected_buckets, groups_k
                        )
                        oracle_runs.append(
                            {
                                "k": c["k"],
                                "num_clusters": len(groups_k),
                                "pairwise_total_errors": metrics_k["pairwise_total_errors"],
                                "same_bucket_split_pairs": metrics_k["same_bucket_split_pairs"],
                                "different_bucket_merged_pairs": metrics_k["different_bucket_merged_pairs"],
                                "silhouette": c["silhouette"],
                                "calinski_harabasz": c["calinski_harabasz"],
                                "davies_bouldin": c["davies_bouldin"],
                                "combined_score": c["combined_score"],
                            }
                        )
                    if oracle_runs:
                        oracle_best = min(
                            oracle_runs,
                            key=lambda r: (
                                r["pairwise_total_errors"],
                                r["different_bucket_merged_pairs"],
                                r["k"],
                            ),
                        )
                        entry["oracle_best_k_by_labels"] = oracle_best
                        entry["oracle_k_search"] = oracle_runs
            else:
                raise ValueError(f"Unsupported clustering method: {clustering_method}")

            entry["evaluation_seconds"] = round(time.perf_counter() - t_eval0, 3)
            if labeled:
                best = None
                for r in entry["runs"]:
                    pe = r["pairwise_total_errors"]
                    dm = r["different_bucket_merged_pairs"]
                    # Tie-break with more clusters to avoid over-merged solutions on equal errors.
                    cand = (pe, dm, -r["num_clusters"])
                    if best is None or cand < best[0]:
                        best = (cand, r)
                if best:
                    br = best[1]
                    entry["best_run_summary"] = {
                        "clustering_method": clustering_method,
                        "pairwise_total_errors": br["pairwise_total_errors"],
                        "same_bucket_split_pairs": br["same_bucket_split_pairs"],
                        "different_bucket_merged_pairs": br["different_bucket_merged_pairs"],
                        "num_clusters": br["num_clusters"],
                    }
                    if clustering_method == "agglomerative_threshold":
                        entry["best_run_summary"]["distance_threshold"] = br.get("distance_threshold")
                    if clustering_method == "kmeans_auto_k":
                        entry["best_run_summary"]["selected_k"] = br.get("selected_k")
                        entry["best_run_summary"]["silhouette"] = br.get("silhouette")
                        entry["best_run_summary"]["calinski_harabasz"] = br.get("calinski_harabasz")
                        entry["best_run_summary"]["davies_bouldin"] = br.get("davies_bouldin")
                        entry["auto_k_result"] = {
                            "selected_k": br.get("selected_k"),
                            "pairwise_total_errors": br.get("pairwise_total_errors"),
                            "same_bucket_split_pairs": br.get("same_bucket_split_pairs"),
                            "different_bucket_merged_pairs": br.get("different_bucket_merged_pairs"),
                            "num_clusters": br.get("num_clusters"),
                            "silhouette": br.get("silhouette"),
                            "calinski_harabasz": br.get("calinski_harabasz"),
                            "davies_bouldin": br.get("davies_bouldin"),
                        }

        except Exception:
            entry["evaluation_error"] = traceback.format_exc()
        models_out.append(entry)

    return {
        "report_type": "multi_model_embedding_comparison",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "num_input_answers": len(clean_answers),
        "input_answers_cleaned": clean_answers,
        "labeled": labeled,
        "expected_buckets": expected_buckets if labeled else None,
        "preprocessing_note": "strip_lowercase_collapse_ws (matches app NLP pipeline)",
        "clustering_note": (
            "agglomerative_threshold: ward/euclidean/distance_threshold; "
            "kmeans_auto_k: KMeans auto K by normalized silhouette+CH+(1-DB)"
        ),
        "clustering_method": clustering_method,
        "models": models_out,
    }


def run_evaluation(
    answers: list[str],
    thresholds: list[float],
    expected_buckets: list[str] | None,
) -> dict[str, Any]:
    from app.nlp.nlp_pipeline import group_responses  # noqa: E402

    runs: list[dict] = []
    labeled = expected_buckets is not None and len(expected_buckets) == len(answers)

    clean, buckets_for_metrics = answers, expected_buckets
    if labeled:
        clean, buckets_for_metrics = align_labeled(answers, expected_buckets)

    for t in thresholds:
        pipeline_output = group_responses(
            answers,
            processing_config=ProcessingConfig(
                clustering_method="agglomerative_threshold",
                distance_threshold=t,
                embedding_model="sentence-transformers/all-MiniLM-L6-v2",
            ),
        )
        groups = pipeline_output.get("grouped_answers", [])
        run = {
            "distance_threshold": t,
            "num_clusters": len(groups),
            "groups": [
                {
                    "canonical_name": g["canonical_name"],
                    "count": g["count"],
                    "raw_answers_in_group": g["raw_answers_in_group"],
                    "coordinates": g.get("coordinates"),
                }
                for g in groups
            ],
        }
        if labeled:
            metrics = compute_pairwise_label_metrics(
                clean, buckets_for_metrics or [], groups
            )
            run.update(metrics)
        runs.append(run)

    out = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "num_input_answers": len(clean),
        "input_answers": answers if not labeled else clean,
        "labeled": labeled,
        "runs": runs,
        "evaluation_mode": "production_pipeline_default_model",
    }
    if labeled:
        out["expected_buckets"] = buckets_for_metrics
    return out


def print_human_readable(report: dict) -> None:
    print("=" * 72)
    if report.get("report_type") == "multi_model_embedding_comparison":
        print("Multi-model embedding comparison (same clustering as production)")
        print(f"Input answers: {report['num_input_answers']}")
        for m in report.get("models", []):
            print(f"\n--- model={m['model_id']} load_ok={m.get('load_ok')} ---")
            if m.get("load_error"):
                print(m["load_error"][:2000])
                continue
            for run in m.get("runs", []):
                t = run["distance_threshold"]
                n = run["num_clusters"]
                print(f"  threshold={t} clusters={n} errors={run.get('pairwise_total_errors')}")
        print("=" * 72)
        return

    print("Semantic grouping evaluation (group_responses)")
    print(f"Input answers: {report['num_input_answers']}")
    if report.get("labeled"):
        print("Labeled evaluation: yes (pairwise error counts per threshold)")
    print("=" * 72)
    for run in report["runs"]:
        t = run["distance_threshold"]
        n = run["num_clusters"]
        print(f"\n--- threshold={t}  |  clusters={n} ---\n")
        if report.get("labeled"):
            print(
                f"  same_bucket_split_pairs: {run['same_bucket_split_pairs']}\n"
                f"  different_bucket_merged_pairs: {run['different_bucket_merged_pairs']}\n"
                f"  pairwise_total_errors: {run['pairwise_total_errors']}\n"
            )
        for i, g in enumerate(run["groups"], start=1):
            label = g["canonical_name"]
            members = g["raw_answers_in_group"]
            print(f"  [{i}] {label}  (n={g['count']})")
            for line in members:
                print(f"      - {line}")
    print("\n" + "=" * 72)


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate semantic grouping.")
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"JSON input (default: {DEFAULT_INPUT})",
    )
    parser.add_argument(
        "--thresholds",
        type=str,
        default=",".join(str(x) for x in DEFAULT_THRESHOLDS),
        help="Comma-separated distance_threshold values",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=_BACKEND_ROOT / "data" / "evaluation_last_run.json",
        help="Write full report as JSON",
    )
    parser.add_argument("--no-print", action="store_true", help="Only write JSON")
    parser.add_argument(
        "--compare-models",
        type=str,
        default="",
        help=(
            'Comma-separated SentenceTransformer model ids to compare embeddings '
            "(evaluation-only; does not touch production defaults). Leave empty "
            'to evaluate the production pipeline.'
        ),
    )
    parser.add_argument(
        "--clustering-method",
        type=str,
        default="agglomerative_threshold",
        choices=["agglomerative_threshold", "kmeans_auto_k"],
        help="Evaluation-only clustering method.",
    )
    parser.add_argument(
        "--min-k",
        type=int,
        default=2,
        help="Minimum K to try for kmeans_auto_k.",
    )
    parser.add_argument(
        "--max-k",
        type=int,
        default=15,
        help="Maximum K to try for kmeans_auto_k.",
    )
    args = parser.parse_args()

    thresholds = [float(x.strip()) for x in args.thresholds.split(",") if x.strip()]
    if not thresholds:
        print("No thresholds given.", file=sys.stderr)
        sys.exit(1)

    answers, buckets = load_input(args.input.resolve())

    model_ids = [x.strip() for x in args.compare_models.split(",") if x.strip()]

    if model_ids:
        if buckets is None:
            clean = preprocess_like_pipeline(answers)
            buckets_used = None
        else:
            clean, buckets_used = align_labeled(answers, buckets)
        report = run_model_comparison(
            clean,
            buckets_used,
            thresholds,
            model_ids,
            clustering_method=args.clustering_method,
            min_k=args.min_k,
            max_k=args.max_k,
        )
        report["input_file"] = str(args.input.resolve())
        report["thresholds"] = thresholds
    else:
        report = run_evaluation(answers, thresholds, buckets)

    if not args.no_print:
        print_human_readable(report)

    out_path = args.output.resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"\nWrote: {out_path}", file=sys.stderr if args.no_print else sys.stdout)


if __name__ == "__main__":
    main()
