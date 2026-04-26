"""
Minimal evaluation helper for semantic grouping (group_responses).

Does not change the NLP pipeline; only calls it with different distance_threshold values.

Run from the backend directory:
  python scripts/evaluate_grouping.py

Or with options:
  python scripts/evaluate_grouping.py --input data/evaluation_answers.json --thresholds 1.0,1.5,2.0
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Allow "from app...." when run as a script
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.nlp.nlp_pipeline import group_responses  # noqa: E402


DEFAULT_INPUT = _BACKEND_ROOT / "data" / "evaluation_answers.json"
DEFAULT_THRESHOLDS = (1.0, 1.25, 1.5, 1.75, 2.0)


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


def run_evaluation(
    answers: list[str],
    thresholds: list[float],
    expected_buckets: list[str] | None,
) -> dict:
    runs: list[dict] = []
    labeled = expected_buckets is not None and len(expected_buckets) == len(answers)

    for t in thresholds:
        pipeline_output = group_responses(answers, distance_threshold=t)
        groups = pipeline_output.get("grouped_answers", [])
        run: dict[str, Any] = {
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
            metrics = compute_pairwise_label_metrics(answers, expected_buckets, groups)
            run.update(metrics)
        runs.append(run)

    out: dict[str, Any] = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "num_input_answers": len(answers),
        "input_answers": answers,
        "labeled": labeled,
        "runs": runs,
    }
    if labeled:
        out["expected_buckets"] = expected_buckets
    return out


def print_human_readable(report: dict) -> None:
    print("=" * 72)
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
    parser = argparse.ArgumentParser(description="Evaluate group_responses at several thresholds.")
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"JSON file: list of strings or {{\"answers\": [...]}} (default: {DEFAULT_INPUT})",
    )
    parser.add_argument(
        "--thresholds",
        type=str,
        default=",".join(str(x) for x in DEFAULT_THRESHOLDS),
        help="Comma-separated distance_threshold values (default: several around 1.5)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=_BACKEND_ROOT / "data" / "evaluation_last_run.json",
        help="Write full report as JSON for diffing / archiving",
    )
    parser.add_argument(
        "--no-print",
        action="store_true",
        help="Only write JSON, do not print clusters to stdout",
    )
    args = parser.parse_args()

    thresholds = [float(x.strip()) for x in args.thresholds.split(",") if x.strip()]
    if not thresholds:
        print("No thresholds given.", file=sys.stderr)
        sys.exit(1)

    answers, buckets = load_input(args.input.resolve())
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
