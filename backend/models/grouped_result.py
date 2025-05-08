# backend/app/models/grouped_result.py
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Any
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


# --- Model for the overall grouped results of a survey ---
class SurveyGroupedResults(BaseModel):
    """Represents the aggregated and grouped results for a survey."""
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str},
        json_schema_extra={
            "example": {
                "_id": "656e4a9b3e8a4f3a8e7d1c2b", # Example ObjectId string
                "survey_id": "654e4a9b3e8a4f3a8e7d1c0f", # Example Survey ObjectId string
                "processing_time_utc": "2023-11-23T15:00:00.000Z", # When processing occurred
                "status": "completed", # Or "processing", "failed"
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
                # You might store details about failed answers or errors
                "errors": []
            }
        }
    )

    id: PyObjectId = Field(..., alias="_id", description="Unique identifier for the grouped results document")
    survey_id: PyObjectId = Field(..., description="ObjectId of the survey these results belong to")
    processing_time_utc: datetime = Field(default_factory=datetime.utcnow, description="Timestamp when the results were generated (UTC)")
    status: str = Field(..., description="Status of the processing ('completed', 'failed', etc.)")
    grouped_answers: List[GroupedAnswer] = Field(..., description="The list of grouped answers and their counts")
    # Consider adding fields for errors, unprocessed answers, etc.
    errors: List[str] = Field(default_factory=list, description="List of errors encountered during processing")


# --- Collection Name ---
GROUPED_RESULTS_COLLECTION = "grouped_results"