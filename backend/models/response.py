# backend/app/models/response.py
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from bson import ObjectId
from .survey import PyObjectId

class AnswerBase(BaseModel):
    """Base model for an answer."""
    answer_text: str = Field(..., min_length=1, max_length=500, description="The text of the participant's answer")

class AnswerCreate(AnswerBase):
    """Model used when a participant submits a new answer via API."""
    # For now, we only need the text. Survey ID comes from the URL path.
    # We could add participant_id here later if needed.
    pass

class AnswerInDB(AnswerBase):
    """Model representing an answer as stored in the database."""
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}, # Helps FastAPI serialize ObjectId to JSON string
        json_schema_extra={
            "example": {
                "_id": "655e4a9b3e8a4f3a8e7d1c1a", # Example ObjectId string
                "survey_id": "654e4a9b3e8a4f3a8e7d1c0f", # Example Survey ObjectId string
                "answer_text": "Blue",
                "created_at": "2023-11-22T10:00:00.000Z",
            }
        }
    )

    # Use the enhanced PyObjectId from survey models for consistency
    id: PyObjectId = Field(..., alias="_id", description="Unique identifier for the answer (MongoDB ObjectId)")
    survey_id: PyObjectId = Field(..., description="ObjectId of the survey this answer belongs to")
    created_at: datetime = Field(..., description="Timestamp when the answer was submitted (UTC)")