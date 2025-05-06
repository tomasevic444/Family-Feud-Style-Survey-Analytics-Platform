# backend/app/services/response_service.py
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from datetime import datetime
from fastapi import HTTPException, status
from typing import List, Optional 
# Import models
from ..models.response import AnswerCreate, AnswerInDB
from ..models.survey import SurveyQuestionInDB
# Import other services or database details needed
from . import survey_service
from ..database import RESPONSE_COLLECTION, get_database

async def count_responses_for_survey(db: AsyncIOMotorDatabase, survey_id_obj: ObjectId) -> int:
    """Counts the number of responses submitted for a specific survey."""
    count = await db[RESPONSE_COLLECTION].count_documents({"survey_id": survey_id_obj})
    return count

async def create_response(db: AsyncIOMotorDatabase, survey_id: str, answer: AnswerCreate) -> AnswerInDB:
    """
    Creates a new response for a given survey, performing necessary checks.
    Raises HTTPException for validation errors (survey not found, inactive, limit reached).
    """
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid survey ID format: {survey_id}"
        )
    survey_id_obj = ObjectId(survey_id)

    survey: Optional[SurveyQuestionInDB] = await survey_service.get_survey_by_id(db, survey_id)
    if survey is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Survey with id '{survey_id}' not found"
        )

    if not survey.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Survey '{survey.question_text}' is not currently active and cannot accept responses." # Use question_text for clarity
        )

    current_response_count = await count_responses_for_survey(db, survey_id_obj)
    if current_response_count >= survey.participant_limit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Participant limit ({survey.participant_limit}) reached for survey '{survey.question_text}'. No more responses accepted." # Use question_text for clarity
        )

    response_doc = answer.model_dump()
    response_doc["survey_id"] = survey_id_obj
    response_doc["created_at"] = datetime.utcnow()

    result = await db[RESPONSE_COLLECTION].insert_one(response_doc)

    created_response = await db[RESPONSE_COLLECTION].find_one({"_id": result.inserted_id})

    if created_response:
        return AnswerInDB(**created_response)
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while saving the response."
        )

# --- Add this new function ---
async def get_raw_responses_for_survey(db: AsyncIOMotorDatabase, survey_id: str) -> List[AnswerInDB]:
    """
    Retrieves all raw responses for a specific survey.
    Used for NLP processing and potential admin view.
    """
    # Validate Survey ID format
    if not ObjectId.is_valid(survey_id):
         raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid survey ID format: {survey_id}"
        )
    survey_id_obj = ObjectId(survey_id)


  
    responses_cursor = db[RESPONSE_COLLECTION].find({"survey_id": survey_id_obj}).sort("created_at", 1) 
    raw_responses = await responses_cursor.to_list(length=1000) # Limit retrieval, maybe make limit configurable?

    # Convert MongoDB documents to Pydantic models
    return [AnswerInDB(**response) for response in raw_responses]