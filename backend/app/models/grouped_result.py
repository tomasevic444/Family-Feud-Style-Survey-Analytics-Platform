# backend/app/models/grouped_result.py
from pydantic import BaseModel, Field, ConfigDict, AliasChoices
from typing import List, Dict, Any, Optional 
from datetime import datetime
from bson import ObjectId
from typing_extensions import Annotated

from .survey import PyObjectId # Reuse PyObjectId

# --- Model for a single grouped answer within the results ---
class GroupedAnswer(BaseModel):
    """Represents a group of similar answers found by the NLP process."""
    canonical_name: str = Field(..., description="The representative name for this group")
    count: int = Field(..., description="The number of raw responses in this group")
    raw_answers: List[str] = Field(..., description="List of the raw answer strings belonging to this group")
    coordinates: Optional[Dict[str, float]] = Field(
        default=None, 
        description="2D coordinates {'x': float, 'y': float} for visualization",
        example={"x": 0.12, "y": -0.85}
    )
    response_similarities: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Optional review metadata with answer-to-centroid cosine similarity values",
    )


class ProcessingRunHistoryEntry(BaseModel):
    """Minimal metadata for one processing run."""
    run_id: str = Field(..., description="Client/worker-correlated id for this run")
    run_timestamp_utc: datetime = Field(default_factory=datetime.utcnow, description="Timestamp for this run event (UTC)")
    status: str = Field(..., description="Run status: queued | processing | completed | completed_no_data | failed")
    input_answer_count: Optional[int] = Field(default=None, description="Number of raw answers used in this run")
    output_group_count: Optional[int] = Field(default=None, description="Number of output groups produced")
    model_name: Optional[str] = Field(default=None, description="Sentence embedding model id used for this run")
    embedding_model: Optional[str] = Field(default=None, description="Embedding model used for this run")
    clustering_method: Optional[str] = Field(default=None, description="Clustering strategy used for this run")
    run_label: Optional[str] = Field(default=None, description="Optional analyst label for this run")
    distance_threshold: Optional[float] = Field(default=None, description="Agglomerative clustering distance threshold used")
    min_k: Optional[int] = Field(default=None, description="Auto-K lower bound when applicable")
    max_k: Optional[int] = Field(default=None, description="Auto-K upper bound when applicable")
    fixed_k: Optional[int] = Field(default=None, description="Fixed K used when applicable")
    selected_k: Optional[int] = Field(default=None, description="Selected K after auto-K search")
    silhouette: Optional[float] = Field(default=None, description="Silhouette score for selected K")
    calinski_harabasz: Optional[float] = Field(default=None, description="Calinski-Harabasz score for selected K")
    davies_bouldin: Optional[float] = Field(default=None, description="Davies-Bouldin score for selected K")
    excluded_answer_count: Optional[int] = Field(default=None, description="How many answers were excluded by excluded words")
    processed_answer_count: Optional[int] = Field(default=None, description="How many answers entered vectorization/clustering")
    excluded_words_used: List[str] = Field(default_factory=list, description="Normalized excluded words used in this run")
    preprocessing_descriptor: Optional[str] = Field(default=None, description="Preprocessing label used for this run")
    embedding_descriptor: Optional[str] = Field(default=None, description="Embedding descriptor used for this run")
    error_summary: Optional[str] = Field(default=None, description="Short error summary when run fails")


class KSelectionDiagnosticEntry(BaseModel):
    """Compact auto-K score diagnostics for one tested K."""
    k: int = Field(..., description="Tested cluster count")
    silhouette: Optional[float] = Field(default=None, description="Silhouette score for this K")
    calinski_harabasz: Optional[float] = Field(default=None, description="Calinski-Harabasz score for this K")
    davies_bouldin: Optional[float] = Field(default=None, description="Davies-Bouldin score for this K")
    normalized_silhouette: Optional[float] = Field(default=None, description="Min-max normalized silhouette")
    normalized_calinski_harabasz: Optional[float] = Field(default=None, description="Min-max normalized Calinski-Harabasz")
    normalized_davies_bouldin: Optional[float] = Field(default=None, description="Min-max normalized Davies-Bouldin (raw direction; lower is better)")
    combined_score: Optional[float] = Field(default=None, description="Normalized combined score used to select K")
    selected: bool = Field(
        default=False,
        validation_alias=AliasChoices("selected", "is_selected"),
        description="Whether this K was selected as best",
    )


# --- Model for the overall grouped results of a survey ---
class SurveyGroupedResults(BaseModel):
    """Represents the aggregated and grouped results for a survey."""
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str},
        json_schema_extra={
            "example": {
                "_id": "656e4a9b3e8a4f3a8e7d1c2b",
                "survey_id": "654e4a9b3e8a4f3a8e7d1c0f",
                "processing_time_utc": "2023-11-23T15:00:00.000Z",
                "status": "completed",
                "grouped_answers": [
                    {
                        "canonical_name": "Dog",
                        "count": 15,
                        "raw_answers": ["dog", "dogs", "puppy", "my dog"]
                    },
                    {
                        "canonical_name": "Cat",
                        "count": 10,
                        "raw_answers": ["cat", "kitty"]
                    }
                ],
                "errors": []
            }
        }
    )


    id: Optional[PyObjectId] = Field(default=None, alias="_id", description="Unique identifier for the grouped results document")

    survey_id: PyObjectId = Field(..., description="ObjectId of the survey these results belong to")
    processing_time_utc: datetime = Field(default_factory=datetime.utcnow, description="Timestamp when the results were generated (UTC)")
    status: str = Field(
        ...,
        description="Lifecycle: queued | processing | completed | completed_no_data | failed",
    )
    grouped_answers: List[GroupedAnswer] = Field(..., description="The list of grouped answers and their counts")
    errors: List[str] = Field(default_factory=list, description="List of errors encountered during processing")
    input_answer_count: Optional[int] = Field(default=None, description="Number of raw answers fed into clustering for this run")
    output_group_count: Optional[int] = Field(default=None, description="Number of clusters produced")
    model_name: Optional[str] = Field(default=None, description="Sentence embedding model id")
    embedding_model: Optional[str] = Field(default=None, description="Embedding model id")
    clustering_method: Optional[str] = Field(default=None, description="Clustering method used")
    run_label: Optional[str] = Field(default=None, description="Optional analyst-provided run label")
    distance_threshold: Optional[float] = Field(default=None, description="Agglomerative clustering distance threshold")
    min_k: Optional[int] = Field(default=None, description="Auto-K lower bound")
    max_k: Optional[int] = Field(default=None, description="Auto-K upper bound")
    fixed_k: Optional[int] = Field(default=None, description="Fixed K when using fixed KMeans")
    selected_k: Optional[int] = Field(default=None, description="Selected K for auto-K run")
    silhouette: Optional[float] = Field(default=None, description="Silhouette score for selected K")
    calinski_harabasz: Optional[float] = Field(default=None, description="Calinski-Harabasz score for selected K")
    davies_bouldin: Optional[float] = Field(default=None, description="Davies-Bouldin score for selected K")
    excluded_answer_count: Optional[int] = Field(default=None, description="Count of answers removed by excluded words")
    processed_answer_count: Optional[int] = Field(default=None, description="Count of answers clustered after exclusions")
    excluded_words_used: List[str] = Field(default_factory=list, description="Excluded words applied for this run")
    preprocessing_descriptor: Optional[str] = Field(default=None, description="Short label for answer preprocessing")
    embedding_descriptor: Optional[str] = Field(default=None, description="Short label for embedding normalization/encoding")
    k_selection_diagnostics: List[KSelectionDiagnosticEntry] = Field(
        default_factory=list,
        description="Auto-K diagnostics for tested K values (kmeans_auto_k only)",
    )
    similar_group_pairs: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Optional review hints of semantically close output groups",
    )
    processing_history: List[ProcessingRunHistoryEntry] = Field(default_factory=list, description="Most recent processing runs (newest first)")
    active_run_id: Optional[str] = Field(default=None, description="run_id of the snapshot currently exposed as the active grouped result")
    manual_edits_applied: bool = Field(default=False, description="True when the active result has been edited (rename/move/merge) since the last run was activated")

class UpdateCanonicalNameRequest(BaseModel):
    new_canonical_name: str = Field(..., min_length=1, description="The new canonical name for the group.")

class MoveAnswerRequest(BaseModel):
    raw_answer_text: str = Field(..., description="The specific raw answer text to move.")
    source_group_canonical_name: str = Field(..., description="The current canonical name of the group the answer belongs to.")
    destination_group_canonical_name: str = Field(..., min_length=1, description="The canonical name of the group to move the answer to. If it doesn't exist, it will be created.")

class MergeGroupsRequest(BaseModel):
    source_group_names: List[str] = Field(..., min_items=2, description="A list of the canonical names of the groups to merge.")
    destination_canonical_name: str = Field(..., min_length=1, description="The canonical name for the new, merged group.")
# --- Collection Name ---
GROUPED_RESULTS_COLLECTION = "grouped_results"