# backend/app/services/survey_service.py
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from ..models.survey import SurveyQuestionCreate, SurveyQuestionUpdate, SurveyQuestionInDB
from ..models.grouped_result import SurveyGroupedResults, MoveAnswerRequest, MergeGroupsRequest
from ..models.processing_config import ProcessingConfig
from ..models.processing_run import ProcessingRunSummary, ProcessingRunSnapshot
from ..database import (
    SURVEY_COLLECTION,
    RESPONSE_COLLECTION,
    GROUPED_RESULTS_COLLECTION,
    SURVEY_PROCESSING_RUNS_COLLECTION,
)

MAX_PROCESSING_HISTORY = 20

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
    if not update_data: 
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
    """Deletes a survey question by its ID, and cascades deletion to responses and grouped results."""
    if not ObjectId.is_valid(survey_id):
        return False
    survey_id_obj = ObjectId(survey_id)
    await db[RESPONSE_COLLECTION].delete_many({"survey_id": survey_id_obj})
    await db[GROUPED_RESULTS_COLLECTION].delete_many({"survey_id": survey_id_obj})
    await db[SURVEY_PROCESSING_RUNS_COLLECTION].delete_many({"survey_id": survey_id_obj})
    result = await db[SURVEY_COLLECTION].delete_one({"_id": survey_id_obj})
    return result.deleted_count > 0

async def get_survey_results(db: AsyncIOMotorDatabase, survey_id: str) -> Optional[SurveyGroupedResults]:
    """
    Retrieves the processed and grouped results for a specific survey.
    """
    if not ObjectId.is_valid(survey_id):
        return None 
    survey_id_obj = ObjectId(survey_id)

    results_doc = await db[GROUPED_RESULTS_COLLECTION].find_one({"survey_id": survey_id_obj})

    if results_doc:
        if results_doc.get("status") is None:
            results_doc["status"] = "completed"
        if results_doc.get("grouped_answers") is None:
            results_doc["grouped_answers"] = []
        if results_doc.get("errors") is None:
            results_doc["errors"] = []
        if results_doc.get("processing_history") is None:
            results_doc["processing_history"] = []
        if results_doc.get("similar_group_pairs") is None:
            results_doc["similar_group_pairs"] = []
        if results_doc.get("excluded_words_used") is None:
            results_doc["excluded_words_used"] = []
        return SurveyGroupedResults(**results_doc)
    else:
        return None


async def mark_processing_queued(
    db: AsyncIOMotorDatabase,
    survey_id: str,
    processing_config: ProcessingConfig,
) -> Optional[str]:
    """Persist grouped_results row as queued before Celery picks up the task."""
    if not ObjectId.is_valid(survey_id):
        return None
    survey_id_obj = ObjectId(survey_id)
    now = datetime.utcnow()
    run_id = str(uuid4())
    run_doc = {
        "run_id": run_id,
        "run_timestamp_utc": now,
        "status": "queued",
        "run_label": processing_config.run_label,
        "input_answer_count": None,
        "processed_answer_count": None,
        "excluded_answer_count": None,
        "output_group_count": None,
        "model_name": None,
        "embedding_model": processing_config.embedding_model,
        "clustering_method": processing_config.clustering_method,
        "distance_threshold": processing_config.distance_threshold,
        "min_k": processing_config.min_k,
        "max_k": processing_config.max_k,
        "fixed_k": processing_config.fixed_k,
        "selected_k": None,
        "silhouette": None,
        "calinski_harabasz": None,
        "davies_bouldin": None,
        "preprocessing_descriptor": None,
        "embedding_descriptor": None,
        "excluded_words_used": processing_config.excluded_words if processing_config.use_excluded_words else [],
        "error_summary": None,
    }
    await db[GROUPED_RESULTS_COLLECTION].update_one(
        {"survey_id": survey_id_obj},
        {
            "$set": {
                "survey_id": survey_id_obj,
                "status": "queued",
                "processing_time_utc": now,
                "run_label": processing_config.run_label,
                "grouped_answers": [],
                "similar_group_pairs": [],
                "errors": [],
                "input_answer_count": None,
                "processed_answer_count": None,
                "excluded_answer_count": None,
                "output_group_count": None,
                "model_name": None,
                "embedding_model": processing_config.embedding_model,
                "clustering_method": processing_config.clustering_method,
                "distance_threshold": processing_config.distance_threshold,
                "min_k": processing_config.min_k,
                "max_k": processing_config.max_k,
                "fixed_k": processing_config.fixed_k,
                "selected_k": None,
                "silhouette": None,
                "calinski_harabasz": None,
                "davies_bouldin": None,
                "preprocessing_descriptor": None,
                "embedding_descriptor": None,
                "excluded_words_used": processing_config.excluded_words if processing_config.use_excluded_words else [],
            }
        },
        upsert=True,
    )
    await db[GROUPED_RESULTS_COLLECTION].update_one(
        {"survey_id": survey_id_obj},
        {
            "$push": {
                "processing_history": {
                    "$each": [run_doc],
                    "$position": 0,
                    "$slice": MAX_PROCESSING_HISTORY,
                }
            }
        },
        upsert=True,
    )
    return run_id


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

    update_result = await db[GROUPED_RESULTS_COLLECTION].update_one(
        {
            "survey_id": survey_id_obj,
            "grouped_answers.canonical_name": current_canonical_name 
        },
        {
            "$set": {
                "grouped_answers.$.canonical_name": new_canonical_name, 
                "processing_time_utc": datetime.utcnow(),
                "manual_edits_applied": True,
            }
        }
    )

    if update_result.matched_count > 0 and update_result.modified_count > 0:
        updated_results_doc = await db[GROUPED_RESULTS_COLLECTION].find_one({"survey_id": survey_id_obj})
        if updated_results_doc:
            return SurveyGroupedResults(**updated_results_doc)
    elif update_result.matched_count > 0 and update_result.modified_count == 0:
        current_results_doc = await db[GROUPED_RESULTS_COLLECTION].find_one({"survey_id": survey_id_obj})
        if current_results_doc:
            return SurveyGroupedResults(**current_results_doc)

    return None 

async def move_answer_between_groups(
    db: AsyncIOMotorDatabase,
    survey_id: str,
    move_request: MoveAnswerRequest
) -> Optional[SurveyGroupedResults]:
    """
    Moves a raw answer from a source group to a destination group within a survey's results.
    If the destination group does not exist, it is created.
    If the source group becomes empty after the move, it is removed.
    Returns the updated SurveyGroupedResults document or None if not found/update fails.
    """
    if not ObjectId.is_valid(survey_id):
        return None
    survey_id_obj = ObjectId(survey_id)

    results_doc = await db[GROUPED_RESULTS_COLLECTION].find_one({"survey_id": survey_id_obj})
    if not results_doc:
        return None 

    current_results = SurveyGroupedResults(**results_doc)
    grouped_answers_list = current_results.grouped_answers

    source_group_found = False
    answer_found_in_source = False
    destination_group_index = -1

    for i, group in enumerate(grouped_answers_list):
        if group.canonical_name == move_request.source_group_canonical_name:
            source_group_found = True
            if move_request.raw_answer_text in group.raw_answers:
                group.raw_answers.remove(move_request.raw_answer_text)
                group.count -= 1
                answer_found_in_source = True
            break 

    if not source_group_found or not answer_found_in_source:
        return None 

    for i, group in enumerate(grouped_answers_list):
        if group.canonical_name == move_request.destination_group_canonical_name:
            destination_group_index = i
            break

    if destination_group_index != -1: 
        grouped_answers_list[destination_group_index].raw_answers.append(move_request.raw_answer_text)
        grouped_answers_list[destination_group_index].count += 1
    else: 
        new_group = {
            "canonical_name": move_request.destination_group_canonical_name,
            "count": 1,
            "raw_answers": [move_request.raw_answer_text]
        }
        grouped_answers_list.append(new_group)


    new_grouped_answers_list = [
        group for group in grouped_answers_list if not (
            group.canonical_name == move_request.source_group_canonical_name and group.count == 0
        )
    ]
    final_grouped_answers_for_model = [
        group if isinstance(group, dict) else group.model_dump() for group in new_grouped_answers_list
    ]


    updated_doc_to_save = {
        "survey_id": survey_id_obj,
        "processing_time_utc": datetime.utcnow(), 
        "status": current_results.status, 
        "grouped_answers": final_grouped_answers_for_model,
        "errors": current_results.errors
    }

    update_result = await db[GROUPED_RESULTS_COLLECTION].update_one(
        {"survey_id": survey_id_obj},
        {"$set": {
            "grouped_answers": final_grouped_answers_for_model,
            "processing_time_utc": datetime.utcnow(),
            "manual_edits_applied": True,
        }}
    )

    if update_result.modified_count > 0 or update_result.matched_count > 0: 
        final_results_doc = await db[GROUPED_RESULTS_COLLECTION].find_one({"survey_id": survey_id_obj})
        if final_results_doc:
            return SurveyGroupedResults(**final_results_doc)

    return None 

async def merge_groups(
    db: AsyncIOMotorDatabase,
    survey_id: str,
    merge_request: MergeGroupsRequest
) -> Optional[SurveyGroupedResults]:
    """
    Merges multiple source groups into a single destination group.
    The original source groups are removed.
    Returns the updated SurveyGroupedResults document or None if update fails.
    """
    if not ObjectId.is_valid(survey_id):
        return None
    survey_id_obj = ObjectId(survey_id)

    results_doc = await db[GROUPED_RESULTS_COLLECTION].find_one({"survey_id": survey_id_obj})
    if not results_doc:
        return None

    grouped_answers_list = results_doc.get("grouped_answers", [])

    newly_merged_group = {
        "canonical_name": merge_request.destination_canonical_name,
        "count": 0,
        "raw_answers": []
    }
    remaining_groups = []
    source_groups_found_count = 0

    for group in grouped_answers_list:
        if group["canonical_name"] in merge_request.source_group_names:
            newly_merged_group["raw_answers"].extend(group["raw_answers"])
            newly_merged_group["count"] += group["count"]
            source_groups_found_count += 1
        else:
            remaining_groups.append(group)

    if source_groups_found_count != len(merge_request.source_group_names):
        return None 

    remaining_groups.append(newly_merged_group)

    update_result = await db[GROUPED_RESULTS_COLLECTION].update_one(
        {"survey_id": survey_id_obj},
        {"$set": {
            "grouped_answers": remaining_groups,
            "processing_time_utc": datetime.utcnow(),
            "manual_edits_applied": True,
        }}
    )

    if update_result.modified_count > 0:
        final_results_doc = await db[GROUPED_RESULTS_COLLECTION].find_one({"survey_id": survey_id_obj})
        if final_results_doc:
            return SurveyGroupedResults(**final_results_doc)

    return None


# --- Processing runs (snapshots) -------------------------------------------------

_RUN_SUMMARY_PROJECTION = {
    "grouped_answers": 0,
    "similar_group_pairs": 0,
    "processing_config": 0,
    "errors": 0,
}


async def list_processing_runs(
    db: AsyncIOMotorDatabase, survey_id: str
) -> Optional[List[ProcessingRunSummary]]:
    """Newest-first lightweight list of processing run snapshots for a survey."""
    if not ObjectId.is_valid(survey_id):
        return None
    survey_id_obj = ObjectId(survey_id)

    active_run_id: Optional[str] = None
    results_doc = await db[GROUPED_RESULTS_COLLECTION].find_one(
        {"survey_id": survey_id_obj}, {"active_run_id": 1}
    )
    if results_doc:
        active_run_id = results_doc.get("active_run_id")

    cursor = (
        db[SURVEY_PROCESSING_RUNS_COLLECTION]
        .find({"survey_id": survey_id_obj}, _RUN_SUMMARY_PROJECTION)
        .sort("run_timestamp_utc", -1)
    )
    docs = await cursor.to_list(length=200)
    summaries: List[ProcessingRunSummary] = []
    for doc in docs:
        doc.setdefault("group_summary", [])
        doc.setdefault("excluded_words_used", [])
        doc["is_active"] = bool(active_run_id and doc.get("run_id") == active_run_id)
        summaries.append(ProcessingRunSummary(**doc))
    return summaries


async def get_processing_run(
    db: AsyncIOMotorDatabase, survey_id: str, run_id: str
) -> Optional[ProcessingRunSnapshot]:
    """Return the full snapshot for one processing run, or None if missing."""
    if not ObjectId.is_valid(survey_id) or not run_id:
        return None
    survey_id_obj = ObjectId(survey_id)

    doc = await db[SURVEY_PROCESSING_RUNS_COLLECTION].find_one(
        {"survey_id": survey_id_obj, "run_id": run_id}
    )
    if not doc:
        return None

    active_run_id: Optional[str] = None
    results_doc = await db[GROUPED_RESULTS_COLLECTION].find_one(
        {"survey_id": survey_id_obj}, {"active_run_id": 1}
    )
    if results_doc:
        active_run_id = results_doc.get("active_run_id")

    doc.setdefault("group_summary", [])
    doc.setdefault("grouped_answers", [])
    doc.setdefault("similar_group_pairs", [])
    doc.setdefault("processing_config", {})
    doc.setdefault("excluded_words_used", [])
    doc.setdefault("errors", [])
    doc["is_active"] = bool(active_run_id and doc.get("run_id") == active_run_id)
    return ProcessingRunSnapshot(**doc)


class ActivateRunError(Exception):
    """Raised by activate_processing_run when activation is not allowed."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


async def activate_processing_run(
    db: AsyncIOMotorDatabase, survey_id: str, run_id: str
) -> SurveyGroupedResults:
    """Copy a completed run snapshot into grouped_results as the active result."""
    if not ObjectId.is_valid(survey_id):
        raise ActivateRunError("Invalid survey ID format", 400)
    survey_id_obj = ObjectId(survey_id)

    snapshot = await db[SURVEY_PROCESSING_RUNS_COLLECTION].find_one(
        {"survey_id": survey_id_obj, "run_id": run_id}
    )
    if not snapshot:
        raise ActivateRunError(
            f"Processing run '{run_id}' not found for survey '{survey_id}'", 404
        )

    if snapshot.get("status") != "completed":
        raise ActivateRunError(
            "Only completed runs can be set as the active result.", 400
        )

    grouped_answers = snapshot.get("grouped_answers") or []
    if not grouped_answers:
        raise ActivateRunError(
            "Selected run has no grouped result data to activate.", 400
        )

    now = datetime.utcnow()
    activation_doc = {
        "survey_id": survey_id_obj,
        "status": "completed",
        "processing_time_utc": now,
        "grouped_answers": grouped_answers,
        "similar_group_pairs": snapshot.get("similar_group_pairs") or [],
        "errors": [],
        "run_label": snapshot.get("run_label"),
        "input_answer_count": snapshot.get("input_answer_count"),
        "processed_answer_count": snapshot.get("processed_answer_count"),
        "excluded_answer_count": snapshot.get("excluded_answer_count"),
        "output_group_count": snapshot.get("output_group_count")
        or len(grouped_answers),
        "model_name": snapshot.get("model_name"),
        "embedding_model": snapshot.get("embedding_model"),
        "clustering_method": snapshot.get("clustering_method"),
        "distance_threshold": snapshot.get("distance_threshold"),
        "min_k": snapshot.get("min_k"),
        "max_k": snapshot.get("max_k"),
        "fixed_k": snapshot.get("fixed_k"),
        "selected_k": snapshot.get("selected_k"),
        "silhouette": snapshot.get("silhouette"),
        "calinski_harabasz": snapshot.get("calinski_harabasz"),
        "davies_bouldin": snapshot.get("davies_bouldin"),
        "excluded_words_used": snapshot.get("excluded_words_used") or [],
        "preprocessing_descriptor": snapshot.get("preprocessing_descriptor"),
        "embedding_descriptor": snapshot.get("embedding_descriptor"),
        "active_run_id": run_id,
        "manual_edits_applied": False,
    }

    await db[GROUPED_RESULTS_COLLECTION].update_one(
        {"survey_id": survey_id_obj},
        {"$set": activation_doc},
        upsert=True,
    )

    updated_doc = await db[GROUPED_RESULTS_COLLECTION].find_one(
        {"survey_id": survey_id_obj}
    )
    if not updated_doc:
        raise ActivateRunError("Activation failed to persist.", 500)

    updated_doc.setdefault("processing_history", [])
    updated_doc.setdefault("similar_group_pairs", [])
    updated_doc.setdefault("excluded_words_used", [])
    updated_doc.setdefault("errors", [])
    return SurveyGroupedResults(**updated_doc)
