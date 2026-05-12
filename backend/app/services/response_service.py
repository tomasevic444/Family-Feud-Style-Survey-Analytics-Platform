# backend/app/services/response_service.py
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from datetime import datetime
from fastapi import HTTPException, status
import csv
import io
from typing import List, Optional 
from ..models.response import AnswerCreate, AnswerInDB, CsvImportResponse
from ..models.survey import SurveyQuestionInDB
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

async def get_raw_responses_for_survey(db: AsyncIOMotorDatabase, survey_id: str) -> List[AnswerInDB]:
    """
    Retrieves all raw responses for a specific survey.
    Used for NLP processing and potential admin view.
    """
    if not ObjectId.is_valid(survey_id):
         raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid survey ID format: {survey_id}"
        )
    survey_id_obj = ObjectId(survey_id)


  
    responses_cursor = db[RESPONSE_COLLECTION].find({"survey_id": survey_id_obj}).sort("created_at", 1) 
    raw_responses = await responses_cursor.to_list(length=1000) # Limit retrieval, maybe make limit configurable?

    return [AnswerInDB(**response) for response in raw_responses]


async def import_responses_from_csv(
    db: AsyncIOMotorDatabase,
    survey_id: str,
    file_bytes: bytes,
    answer_column: str,
    delimiter: str = ",",
) -> CsvImportResponse:
    """Import raw responses from CSV into an existing survey."""
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid survey ID format: {survey_id}",
        )
    survey = await survey_service.get_survey_by_id(db, survey_id)
    if survey is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Survey with id '{survey_id}' not found",
        )

    answer_column = (answer_column or "").strip()
    if not answer_column:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="answer_column is required.",
        )
    if not delimiter:
        delimiter = ","
    if len(delimiter) != 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="delimiter must be a single character.",
        )

    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file is empty.",
        )

    max_bytes = 5 * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file is too large (max 5 MB).",
        )

    try:
        decoded = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV must be UTF-8 encoded.",
        )

    csv_stream = io.StringIO(decoded, newline="")
    reader = csv.DictReader(csv_stream, delimiter=delimiter)
    if not reader.fieldnames:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV must contain a header row.",
        )
    if answer_column not in reader.fieldnames:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Column '{answer_column}' not found in CSV header.",
        )

    survey_id_obj = ObjectId(survey_id)
    current_count = await count_responses_for_survey(db, survey_id_obj)
    remaining_capacity = max(0, survey.participant_limit - current_count)

    imported_docs = []
    skipped_empty_count = 0
    skipped_invalid_count = 0
    skipped_limit_count = 0
    total_rows = 0
    now = datetime.utcnow()

    for row in reader:
        total_rows += 1
        if row is None:
            skipped_invalid_count += 1
            continue

        value = row.get(answer_column)
        if value is None:
            skipped_invalid_count += 1
            continue
        answer_text = str(value).strip()
        if not answer_text:
            skipped_empty_count += 1
            continue
        if len(answer_text) > 500:
            skipped_invalid_count += 1
            continue

        if len(imported_docs) >= remaining_capacity:
            skipped_limit_count += 1
            continue

        imported_docs.append(
            {
                "survey_id": survey_id_obj,
                "answer_text": answer_text,
                "created_at": now,
            }
        )

    if total_rows == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV must contain at least one data row.",
        )

    if imported_docs:
        await db[RESPONSE_COLLECTION].insert_many(imported_docs, ordered=False)

    return CsvImportResponse(
        imported_count=len(imported_docs),
        skipped_empty_count=skipped_empty_count,
        skipped_invalid_count=skipped_invalid_count,
        skipped_limit_count=skipped_limit_count,
        answer_column=answer_column,
        total_rows=total_rows,
    )