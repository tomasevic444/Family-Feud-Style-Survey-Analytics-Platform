# backend/app/routers/responses.py
from fastapi import APIRouter, Depends, HTTPException, status, Body, Path, Query # Import Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Annotated, List # Import List

from ..database import get_database
from ..models.response import AnswerCreate, AnswerInDB
from ..services import response_service
# Create an API router
router = APIRouter(
    prefix="/surveys/{survey_id}/responses",
    tags=["Responses"],
    responses={
        404: {"description": "Survey not found"},
        400: {"description": "Bad Request (e.g., survey inactive, limit reached, invalid ID)"}
    },
)

@router.post(
    "/",
    response_model=AnswerInDB,
    status_code=status.HTTP_201_CREATED,
    summary="Submit an Answer to a Survey",
    description="Submits a participant's answer to the specified survey question, subject to validation checks."
)
async def submit_answer_to_survey(
    survey_id: Annotated[str, Path(description="The ID of the survey to submit an answer for")],
    answer: AnswerCreate = Body(..., description="The answer data being submitted"),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Handles the submission of a single answer to a specific survey:

    - **survey_id**: The ID of the target survey (from URL path).
    - **answer**: The answer text provided in the request body.

    Checks if the survey exists, is active, and if the participant limit has been reached
    before saving the response.
    """
    # The exception handling is now largely moved into the service
    created_response = await response_service.create_response(db, survey_id, answer)
    return created_response

# --- Add this new endpoint ---
@router.get(
    "/raw", # New path segment
    response_model=List[AnswerInDB],
    summary="Get All Raw Responses for a Survey",
    description="Retrieves a list of all raw answers submitted for a specific survey question."
)
async def read_raw_responses_for_survey(
    survey_id: Annotated[str, Path(description="The ID of the survey to retrieve responses for")],
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Fetches all raw responses for a given survey ID.
    """
    # The service layer handles ID validation and fetching
    raw_responses = await response_service.get_raw_responses_for_survey(db, survey_id)
    # Note: It returns an empty list if no responses or if survey doesn't exist
    # You might want to add a survey existence check here if you prefer 404 for non-existent surveys
    return raw_responses