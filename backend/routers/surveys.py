# backend/app/routers/surveys.py
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body, Path
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List, Optional, Annotated
from bson import ObjectId # Import ObjectId
import urllib.parse # For URL encoding/decoding path parameters

from ..database import get_database
from ..models.survey import SurveyQuestionCreate, SurveyQuestionUpdate, SurveyQuestionInDB
# --- Import the model for grouped results ---
from ..models.grouped_result import SurveyGroupedResults, UpdateCanonicalNameRequest 
from ..services import survey_service
# --- Import the Celery app and task ---
from ..celery_worker import celery_app, process_survey_responses_task

# Create an API router
router = APIRouter(
    prefix="/surveys",
    tags=["Surveys"],
    responses={404: {"description": "Not found"}},
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
    created_survey = await survey_service.create_survey(db, survey)
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
    surveys = await survey_service.get_all_surveys(db, skip=skip, limit=limit)
    return surveys

@router.get(
    "/{survey_id}",
    response_model=SurveyQuestionInDB,
    summary="Get a specific Survey Question by ID",
    description="Retrieves details of a single survey question using its unique MongoDB ObjectId."
)
async def read_survey_by_id(
    survey_id: Annotated[str, Path(description="The ID of the survey to retrieve")], # Using Annotated Path
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid survey ID format: {survey_id}")
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
    survey_id: Annotated[str, Path(description="The ID of the survey to update")],
    survey_update: SurveyQuestionUpdate = Body(...),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid survey ID format: {survey_id}")
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
    survey_id: Annotated[str, Path(description="The ID of the survey to delete")],
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid survey ID format: {survey_id}")
    deleted = await survey_service.delete_survey(db, survey_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Survey with id '{survey_id}' not found")
    return None # FastAPI will return 204 No Content

@router.post(
    "/{survey_id}/process",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger Response Processing for Survey",
    description="Queues a background task to process and group responses for the specified survey using NLP."
)
async def trigger_response_processing(
    survey_id: Annotated[str, Path(description="The ID of the survey whose responses should be processed")],
):
    
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid survey ID format: {survey_id}")
    task_result = process_survey_responses_task.delay(survey_id)
    return {"message": "Processing task queued", "task_id": task_result.id, "survey_id": survey_id}


@router.get(
    "/{survey_id}/results",
    response_model=SurveyGroupedResults,
    summary="Get Processed Survey Results",
    description="Retrieves the NLP-processed and grouped results for a specific survey."
)
async def read_survey_results(
    survey_id: Annotated[str, Path(description="The ID of the survey to retrieve results for")],
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Triggers the background processing task for a survey's responses.

    - **survey_id**: The ID of the survey to process.

    The request returns immediately with a 202 Accepted status,
    and the actual processing happens in the background.
    """
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid survey ID format: {survey_id}")

    results = await survey_service.get_survey_results(db, survey_id)
    if results is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Processed results not found for survey ID '{survey_id}'. Please ensure the survey exists and has been processed."
        )
    return results

@router.put(
    "/{survey_id}/results/groups/{current_group_name_encoded}", # Use URL encoded name
    response_model=SurveyGroupedResults,
    summary="Update Canonical Name of a Group",
    description="Updates the canonical name for a specific group within a survey's processed results."
)
async def update_survey_group_canonical_name(
    survey_id: Annotated[str, Path(description="The ID of the survey containing the results.")],
    current_group_name_encoded: Annotated[str, Path(description="The URL-encoded current canonical name of the group to update.")],
    update_request: UpdateCanonicalNameRequest = Body(...),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Updates the canonical name of a group.
    The `current_group_name_encoded` must be URL-encoded if it contains special characters.
    """
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid survey ID format: {survey_id}")

    # Decode the group name from the URL path
    current_group_name = urllib.parse.unquote_plus(current_group_name_encoded)

    updated_results = await survey_service.update_group_canonical_name(
        db,
        survey_id,
        current_group_name,
        update_request.new_canonical_name
    )

    if updated_results is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Survey results or group '{current_group_name}' not found for survey ID '{survey_id}', or update failed."
        )
    return updated_results