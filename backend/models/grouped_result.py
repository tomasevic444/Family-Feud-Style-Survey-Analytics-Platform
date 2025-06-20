# backend/app/models/grouped_result.py
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Any, Optional # Import Optional
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
    status: str = Field(..., description="Status of the processing ('completed', 'failed', etc.)")
    grouped_answers: List[GroupedAnswer] = Field(..., description="The list of grouped answers and their counts")
    errors: List[str] = Field(default_factory=list, description="List of errors encountered during processing")

class UpdateCanonicalNameRequest(BaseModel):
    new_canonical_name: str = Field(..., min_length=1, description="The new canonical name for the group.")

class MoveAnswerRequest(BaseModel):
    raw_answer_text: str = Field(..., description="The specific raw answer text to move.")
    source_group_canonical_name: str = Field(..., description="The current canonical name of the group the answer belongs to.")
    destination_group_canonical_name: str = Field(..., min_length=1, description="The canonical name of the group to move the answer to. If it doesn't exist, it will be created.")
# --- Collection Name ---
GROUPED_RESULTS_COLLECTION = "grouped_results"