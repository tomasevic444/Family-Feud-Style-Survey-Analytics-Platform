# backend/app/services/survey_service.py
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from datetime import datetime
from typing import List, Optional

from ..models.survey import SurveyQuestionCreate, SurveyQuestionUpdate, SurveyQuestionInDB
from ..database import SURVEY_COLLECTION # Import collection name

async def create_survey(db: AsyncIOMotorDatabase, survey: SurveyQuestionCreate) -> SurveyQuestionInDB:
    """Creates a new survey question in the database."""
    survey_dict = survey.model_dump() # Use model_dump() in Pydantic v2
    survey_dict["created_at"] = datetime.utcnow()
    survey_dict["updated_at"] = datetime.utcnow()

    result = await db[SURVEY_COLLECTION].insert_one(survey_dict)

    # Retrieve the newly created document to include the generated _id and timestamps
    created_survey = await db[SURVEY_COLLECTION].find_one({"_id": result.inserted_id})

    if created_survey:
        return SurveyQuestionInDB(**created_survey)
    else:
        # This should ideally not happen if insert was successful
        raise Exception("Failed to retrieve survey after creation")


async def get_all_surveys(db: AsyncIOMotorDatabase, skip: int = 0, limit: int = 100) -> List[SurveyQuestionInDB]:
    """Retrieves all survey questions with pagination."""
    surveys_cursor = db[SURVEY_COLLECTION].find().skip(skip).limit(limit)
    surveys = await surveys_cursor.to_list(length=limit)
    return [SurveyQuestionInDB(**survey) for survey in surveys]


async def get_survey_by_id(db: AsyncIOMotorDatabase, survey_id: str) -> Optional[SurveyQuestionInDB]:
    """Retrieves a single survey question by its ID."""
    if not ObjectId.is_valid(survey_id):
        return None # Or raise a specific validation error
    survey = await db[SURVEY_COLLECTION].find_one({"_id": ObjectId(survey_id)})
    if survey:
        return SurveyQuestionInDB(**survey)
    return None


async def update_survey(db: AsyncIOMotorDatabase, survey_id: str, survey_update: SurveyQuestionUpdate) -> Optional[SurveyQuestionInDB]:
    """Updates an existing survey question."""
    if not ObjectId.is_valid(survey_id):
        return None # Or raise validation error

    # Get update data, excluding unset fields to avoid overwriting with None
    update_data = survey_update.model_dump(exclude_unset=True)

    if not update_data:
        # No fields to update
        return await get_survey_by_id(db, survey_id) # Return current state

    # Add timestamp for update
    update_data["updated_at"] = datetime.utcnow()

    result = await db[SURVEY_COLLECTION].update_one(
        {"_id": ObjectId(survey_id)},
        {"$set": update_data}
    )

    if result.matched_count:
        updated_survey = await db[SURVEY_COLLECTION].find_one({"_id": ObjectId(survey_id)})
        if updated_survey:
            return SurveyQuestionInDB(**updated_survey)
    return None # Return None if survey_id didn't exist or update failed unexpectedly


async def delete_survey(db: AsyncIOMotorDatabase, survey_id: str) -> bool:
    """Deletes a survey question by its ID."""
    if not ObjectId.is_valid(survey_id):
        return False # Or raise validation error

    result = await db[SURVEY_COLLECTION].delete_one({"_id": ObjectId(survey_id)})
    return result.deleted_count > 0