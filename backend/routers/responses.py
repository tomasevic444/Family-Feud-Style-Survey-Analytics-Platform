# backend/app/routers/responses.py
from fastapi import APIRouter, Depends, HTTPException, status, Body, Path
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Annotated # Use Annotated for Path validation

from ..database import get_database
from ..models.response import AnswerCreate, AnswerInDB
from ..services import response_service # Import the new service

# Create an API router
router = APIRouter(
    # Define prefix here for clarity, applies to all routes in this file
    prefix="/surveys/{survey_id}/responses",
    tags=["Responses"], # Tag for Swagger UI documentation grouping
    # Default responses can be defined here or per-route
    responses={
        404: {"description": "Survey not found"},
        400: {"description": "Bad Request (e.g., survey inactive, limit reached, invalid ID)"}
    },
)

@router.post(
    "/", # The path relative to the router's prefix
    response_model=AnswerInDB,
    status_code=status.HTTP_201_CREATED,
    summary="Submit an Answer to a Survey",
    description="Submits a participant's answer to the specified survey question, subject to validation checks."
)
async def submit_answer_to_survey(
    # Use Annotated with Path for more control over the path parameter validation
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
    try:
        created_response = await response_service.create_response(db, survey_id, answer)
        return created_response
    except HTTPException as e:
        # Re-raise HTTPExceptions raised by the service layer
        raise e
    except Exception as e:
        # Catch unexpected errors during the process
        # Log the error e for debugging
        print(f"Unexpected error submitting response: {e}") # Replace with proper logging
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while submitting the response."
        )