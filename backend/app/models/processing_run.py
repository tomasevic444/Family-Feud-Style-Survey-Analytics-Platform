"""Models for full processing-run snapshots stored in survey_processing_runs."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field
from bson import ObjectId

from .grouped_result import GroupedAnswer, KSelectionDiagnosticEntry
from .survey import PyObjectId


class GroupSummaryItem(BaseModel):
    """Compact summary entry used in lightweight list responses."""
    canonical_name: str
    count: int


class ProcessingRunSummary(BaseModel):
    """Lightweight metadata for a processing run (no raw grouped_answers)."""
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str},
    )

    run_id: str
    survey_id: PyObjectId
    run_label: Optional[str] = None
    status: str
    run_timestamp_utc: datetime
    processing_time_utc: Optional[datetime] = None
    clustering_method: Optional[str] = None
    embedding_model: Optional[str] = None
    model_name: Optional[str] = None
    distance_threshold: Optional[float] = None
    min_k: Optional[int] = None
    max_k: Optional[int] = None
    fixed_k: Optional[int] = None
    selected_k: Optional[int] = None
    silhouette: Optional[float] = None
    calinski_harabasz: Optional[float] = None
    davies_bouldin: Optional[float] = None
    k_selection_diagnostics: List[KSelectionDiagnosticEntry] = Field(default_factory=list)
    input_answer_count: Optional[int] = None
    processed_answer_count: Optional[int] = None
    excluded_answer_count: Optional[int] = None
    output_group_count: Optional[int] = None
    excluded_words_used: List[str] = Field(default_factory=list)
    use_excluded_words: Optional[bool] = None
    preprocessing_descriptor: Optional[str] = None
    embedding_descriptor: Optional[str] = None
    group_summary: List[GroupSummaryItem] = Field(default_factory=list)
    error_summary: Optional[str] = None
    is_active: bool = False


class ProcessingRunSnapshot(ProcessingRunSummary):
    """Full snapshot of a processing run, including grouped_answers."""
    grouped_answers: List[GroupedAnswer] = Field(default_factory=list)
    similar_group_pairs: List[Dict[str, Any]] = Field(default_factory=list)
    processing_config: Dict[str, Any] = Field(default_factory=dict)
    errors: List[str] = Field(default_factory=list)


__all__ = [
    "GroupSummaryItem",
    "ProcessingRunSummary",
    "ProcessingRunSnapshot",
]
