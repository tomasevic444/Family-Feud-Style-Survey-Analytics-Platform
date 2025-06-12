# backend/app/services/survey_service.py
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from datetime import datetime
from typing import List, Optional

from ..models.survey import SurveyQuestionCreate, SurveyQuestionUpdate, SurveyQuestionInDB
from ..models.grouped_result import SurveyGroupedResults
from ..database import SURVEY_COLLECTION, GROUPED_RESULTS_COLLECTION 

async def create_survey(db: AsyncIOMotorDatabase, survey: SurveyQuestionCreate) -> SurveyQuestionInDB:
    """Creates a new survey question in the database."""
    survey_dict = survey.model_dump()
    survey_dict["created_at"] = datetime.utcnow()
    survey_dict["updated_at"] = datetime.utcnow()

    result = await db[SURVEY_COLLECTION].insert_one(survey_dict)
    created_survey_doc = await db[SURVEY_COLLECTION].find_one({"_id": result.inserted_id})

    if created_survey_doc:
        return SurveyQuestionInDB(**created_survey_doc)
    else:
        raise Exception("Failed to retrieve survey after creation")


async def get_all_surveys(db: AsyncIOMotorDatabase, skip: int = 0, limit: int = 100) -> List[SurveyQuestionInDB]:
    """Retrieves all survey questions with pagination."""
    surveys_cursor = db[SURVEY_COLLECTION].find().sort("created_at", -1).skip(skip).limit(limit) # Sort by newest first
    surveys = await surveys_cursor.to_list(length=limit)
    return [SurveyQuestionInDB(**survey) for survey in surveys]


async def get_survey_by_id(db: AsyncIOMotorDatabase, survey_id: str) -> Optional[SurveyQuestionInDB]:
    """Retrieves a single survey question by its ID."""
    if not ObjectId.is_valid(survey_id):
        return None
    survey_doc = await db[SURVEY_COLLECTION].find_one({"_id": ObjectId(survey_id)})
    if survey_doc:
        return SurveyQuestionInDB(**survey_doc)
    return None


async def update_survey(db: AsyncIOMotorDatabase, survey_id: str, survey_update: SurveyQuestionUpdate) -> Optional[SurveyQuestionInDB]:
    """Updates an existing survey question."""
    if not ObjectId.is_valid(survey_id):
        return None

    update_data = survey_update.model_dump(exclude_unset=True)
    if not update_data: # If no fields to update, return current state
        return await get_survey_by_id(db, survey_id)

    update_data["updated_at"] = datetime.utcnow()
    result = await db[SURVEY_COLLECTION].update_one(
        {"_id": ObjectId(survey_id)},
        {"$set": update_data}
    )

    if result.matched_count:
        updated_survey_doc = await db[SURVEY_COLLECTION].find_one({"_id": ObjectId(survey_id)})
        if updated_survey_doc:
            return SurveyQuestionInDB(**updated_survey_doc)
    return None


async def delete_survey(db: AsyncIOMotorDatabase, survey_id: str) -> bool:
    """Deletes a survey question by its ID."""
    if not ObjectId.is_valid(survey_id):
        return False
    result = await db[SURVEY_COLLECTION].delete_one({"_id": ObjectId(survey_id)})
    return result.deleted_count > 0

async def get_survey_results(db: AsyncIOMotorDatabase, survey_id: str) -> Optional[SurveyGroupedResults]:
    """
    Retrieves the processed and grouped results for a specific survey.
    """
    # 1. Validate Survey ID format
    if not ObjectId.is_valid(survey_id):
        return None 
    survey_id_obj = ObjectId(survey_id)

    # 2. Fetch the grouped results document from the 'grouped_results' collection
    results_doc = await db[GROUPED_RESULTS_COLLECTION].find_one({"survey_id": survey_id_obj})

    if results_doc:
        # Convert the MongoDB document to our Pydantic model
        return SurveyGroupedResults(**results_doc)
    else:
        # No results found for this survey_id
        return None
    
async def update_group_canonical_name(
    db: AsyncIOMotorDatabase,
    survey_id: str,
    current_canonical_name: str,
    new_canonical_name: str
) -> Optional[SurveyGroupedResults]:
    """
    Updates the canonical name of a specific group within a survey's results.
    Returns the updated SurveyGroupedResults document or None if not found/updated.
    """
    if not ObjectId.is_valid(survey_id):
        return None 
    survey_id_obj = ObjectId(survey_id)

    # MongoDB query to find the document and the specific element in the array
    # to update. The '$' positional operator refers to the first element matched
    # by the query in the `grouped_answers` array.
    update_result = await db[GROUPED_RESULTS_COLLECTION].update_one(
        {
            "survey_id": survey_id_obj,
            "grouped_answers.canonical_name": current_canonical_name # Find the group by its current name
        },
        {
            "$set": {
                "grouped_answers.$.canonical_name": new_canonical_name, # Update the name of the matched group
                "processing_time_utc": datetime.utcnow() # Also update the overall processing time
            }
        }
    )

    if update_result.matched_count > 0 and update_result.modified_count > 0:
        # If successful, fetch and return the entire updated results document
        updated_results_doc = await db[GROUPED_RESULTS_COLLECTION].find_one({"survey_id": survey_id_obj})
        if updated_results_doc:
            return SurveyGroupedResults(**updated_results_doc)
    elif update_result.matched_count > 0 and update_result.modified_count == 0:
        # Found the survey and group, but the new name was the same as the old one
        # (or some other reason it wasn't modified). Return current state.
        current_results_doc = await db[GROUPED_RESULTS_COLLECTION].find_one({"survey_id": survey_id_obj})
        if current_results_doc:
            return SurveyGroupedResults(**current_results_doc)

    return None 