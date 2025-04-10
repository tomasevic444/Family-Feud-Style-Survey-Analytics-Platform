# backend/app/routers/surveys.py
from fastapi import APIRouter, Depends, HTTPException, Query, status, Body
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List

from ..database import get_database
from ..models.survey import SurveyQuestionCreate, SurveyQuestionUpdate, SurveyQuestionInDB
from ..services import survey_service

# Create an API router
router = APIRouter(
    prefix="/surveys", # All routes in this file will start with /surveys
    tags=["Surveys"], # Tag for Swagger UI documentation grouping
    responses={404: {"description": "Not found"}}, # Default response for errors
)

@router.post(
    "/",
    response_model=SurveyQuestionInDB,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new Survey Question",
    description="Adds a new survey question to the database."
)
async def create_new_survey(
    survey: SurveyQuestionCreate = Body(...),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Creates a new survey question. Requires question text.
    Other fields have defaults.
    """
    created_survey = await survey_service.create_survey(db, survey)
    if not created_survey:
        # Consider more specific error handling if create_survey could fail meaningfully
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create survey")
    return created_survey

@router.get(
    "/",
    response_model=List[SurveyQuestionInDB],
    summary="Get all Survey Questions",
    description="Retrieves a list of all survey questions with pagination."
)
async def read_all_surveys(
    skip: int = Query(0, ge=0, description="Number of records to skip for pagination"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of records to return"),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Retrieves a list of survey questions. Supports pagination via `skip` and `limit` query parameters.
    """
    surveys = await survey_service.get_all_surveys(db, skip=skip, limit=limit)
    return surveys

@router.get(
    "/{survey_id}",
    response_model=SurveyQuestionInDB,
    summary="Get a specific Survey Question by ID",
    description="Retrieves details of a single survey question using its unique MongoDB ObjectId."
)
async def read_survey_by_id(
    survey_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Fetches a single survey question based on its `survey_id`.
    Returns 404 if the ID is not valid or not found.
    """
    survey = await survey_service.get_survey_by_id(db, survey_id)
    if survey is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Survey with id '{survey_id}' not found")
    return survey

@router.put(
    "/{survey_id}",
    response_model=SurveyQuestionInDB,
    summary="Update a Survey Question",
    description="Updates specific fields of an existing survey question."
)
async def update_existing_survey(
    survey_id: str,
    survey_update: SurveyQuestionUpdate = Body(...),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Updates a survey question identified by `survey_id`.
    Only the fields provided in the request body will be updated.
    Returns 404 if the ID is not found.
    """
    updated_survey = await survey_service.update_survey(db, survey_id, survey_update)
    if updated_survey is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Survey with id '{survey_id}' not found or update failed")
    return updated_survey

@router.delete(
    "/{survey_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a Survey Question",
    description="Permanently removes a survey question from the database."
)
async def delete_existing_survey(
    survey_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Deletes the survey question specified by `survey_id`.
    Returns 204 No Content on successful deletion.
    Returns 404 if the ID is not found.
    """
    deleted = await survey_service.delete_survey(db, survey_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Survey with id '{survey_id}' not found")
    # No content to return on successful delete
    return None # FastAPI handles the 204 response correctly when None is returned