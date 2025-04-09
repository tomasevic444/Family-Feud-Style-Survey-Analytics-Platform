# backend/app/models/survey.py
from pydantic import (
    BaseModel,
    Field,
    BeforeValidator,
    ConfigDict,
    WithJsonSchema 
)
from typing import Optional, List, Any 
from datetime import datetime
from bson import ObjectId
from typing_extensions import Annotated

# --- Helper Function for ObjectId Validation  ---
def validate_objectid(value):
    """Checks if a value is a valid ObjectId or can be converted to one."""
    if isinstance(value, ObjectId):
        return value
    if ObjectId.is_valid(value):
        return ObjectId(value)
    raise ValueError(f"Value '{value}' is not a valid ObjectId")

# --- Custom Type using Annotated with Explicit JSON Schema ---
# This now tells Pydantic how to represent this type in JSON Schema.
PyObjectId = Annotated[
    ObjectId, # The actual Python type
    BeforeValidator(validate_objectid), # How to validate incoming data
    WithJsonSchema( # How to represent this in JSON Schema (OpenAPI)
        {'type': 'string', 
         'example': '654e4a9b3e8a4f3a8e7d1c0f', 
         'description': 'MongoDB ObjectId as a 24-character hex string'
        },
        mode='serialization' 
    )
]

# --- Base Model (remains the same) ---
class SurveyQuestionBase(BaseModel):
    question_text: str = Field(..., min_length=5, max_length=500, description="The text of the survey question")
    is_active: bool = Field(default=False, description="Whether the survey is currently accepting responses")
    participant_limit: int = Field(default=500, gt=0, description="Maximum number of participants allowed")
    tags: Optional[List[str]] = Field(default=None, description="Optional tags for categorizing the survey")

# --- Model for Creation (remains the same) ---
class SurveyQuestionCreate(SurveyQuestionBase):
    pass

# --- Model for Updates (remains the same) ---
class SurveyQuestionUpdate(BaseModel):
    question_text: Optional[str] = Field(None, min_length=5, max_length=500)
    is_active: Optional[bool] = None
    participant_limit: Optional[int] = Field(None, gt=0)
    tags: Optional[List[str]] = None

# --- Model Representing Data from DB (Config simplified slightly) ---
class SurveyQuestionInDB(SurveyQuestionBase):
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True, 
        json_encoders={ObjectId: str},
        json_schema_extra={
            "example": {
                "_id": "654e4a9b3e8a4f3a8e7d1c0f", # Example matches PyObjectId schema
                "question_text": "Name something you find in a kitchen.",
                "is_active": True,
                "participant_limit": 500,
                "tags": ["household", "common items"],
                "created_at": "2023-11-10T12:00:00.000Z",
                "updated_at": "2023-11-10T12:30:00.000Z"
            }
        }
    )

    id: PyObjectId = Field(..., alias="_id", description="Unique identifier for the survey question (MongoDB ObjectId)") # Use the enhanced PyObjectId
    created_at: datetime = Field(..., description="Timestamp when the survey was created (UTC)")
    updated_at: datetime = Field(..., description="Timestamp when the survey was last updated (UTC)")