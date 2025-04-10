# backend/app/services/response_service.py
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from datetime import datetime
from fastapi import HTTPException, status
from typing import Optional

# Import models
from ..models.response import AnswerCreate, AnswerInDB
from ..models.survey import SurveyQuestionInDB # Need this to check survey details

# Import other services or database details needed
from . import survey_service # Service to get survey details
from ..database import RESPONSE_COLLECTION, get_database # Collection name

async def count_responses_for_survey(db: AsyncIOMotorDatabase, survey_id_obj: ObjectId) -> int:
    """Counts the number of responses submitted for a specific survey."""
    count = await db[RESPONSE_COLLECTION].count_documents({"survey_id": survey_id_obj})
    return count

async def create_response(db: AsyncIOMotorDatabase, survey_id: str, answer: AnswerCreate) -> AnswerInDB:
    """
    Creates a new response for a given survey, performing necessary checks.
    Raises HTTPException for validation errors (survey not found, inactive, limit reached).
    """
    # 1. Validate Survey ID format first
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid survey ID format: {survey_id}"
        )
    survey_id_obj = ObjectId(survey_id)

    # 2. Fetch the survey details
    survey: Optional[SurveyQuestionInDB] = await survey_service.get_survey_by_id(db, survey_id)
    if survey is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Survey with id '{survey_id}' not found"
        )

    # 3. Check if the survey is active
    if not survey.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Survey '{survey_id}' is not currently active and cannot accept responses."
        )

    # 4. Check participant limit
    current_response_count = await count_responses_for_survey(db, survey_id_obj)
    if current_response_count >= survey.participant_limit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Participant limit ({survey.participant_limit}) reached for survey '{survey_id}'. No more responses accepted."
        )

    # 5. Prepare the response document for insertion
    response_doc = answer.model_dump() # Get dict from AnswerCreate
    response_doc["survey_id"] = survey_id_obj # Add the validated ObjectId
    response_doc["created_at"] = datetime.utcnow()

    # 6. Insert the response into the database
    result = await db[RESPONSE_COLLECTION].insert_one(response_doc)

    # 7. Retrieve and return the created response document
    created_response = await db[RESPONSE_COLLECTION].find_one({"_id": result.inserted_id})

    if created_response:
        # Convert the retrieved dict back into the Pydantic model for response
        return AnswerInDB(**created_response)
    else:
        # This indicates an unexpected issue after successful insertion
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve response after creation."
        )