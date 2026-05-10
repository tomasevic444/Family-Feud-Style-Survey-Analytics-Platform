# backend/app/celery_worker.py
from celery import Celery
from .config import settings
import logging
import pymongo
from bson import ObjectId
from datetime import datetime
from typing import List
from uuid import uuid4

from .nlp import nlp_pipeline
from .database import RESPONSE_COLLECTION, GROUPED_RESULTS_COLLECTION
from .models.grouped_result import SurveyGroupedResults, GroupedAnswer
from .models.processing_config import ProcessingConfig
import certifi

logger = logging.getLogger(__name__)

celery_app = Celery(
    'family_feud_tasks',
    broker=settings.celery_broker_url,
    backend=settings.celery_backend_url
)


def _run_metadata(
    config: ProcessingConfig,
    input_count: int,
    processed_count: int,
    excluded_count: int,
    output_count: int,
    run_meta: dict | None = None,
) -> dict:
    run_meta = run_meta or {}
    return {
        "input_answer_count": input_count,
        "processed_answer_count": processed_count,
        "excluded_answer_count": excluded_count,
        "output_group_count": output_count,
        "model_name": config.embedding_model,
        "embedding_model": config.embedding_model,
        "clustering_method": config.clustering_method,
        "run_label": config.run_label,
        "distance_threshold": run_meta.get("distance_threshold", config.distance_threshold),
        "min_k": run_meta.get("min_k", config.min_k),
        "max_k": run_meta.get("max_k", config.max_k),
        "fixed_k": run_meta.get("fixed_k", config.fixed_k),
        "selected_k": run_meta.get("selected_k"),
        "silhouette": run_meta.get("silhouette"),
        "calinski_harabasz": run_meta.get("calinski_harabasz"),
        "davies_bouldin": run_meta.get("davies_bouldin"),
        "excluded_words_used": run_meta.get("excluded_words_used", config.excluded_words if config.use_excluded_words else []),
        "preprocessing_descriptor": nlp_pipeline.PREPROCESSING_DESCRIPTOR,
        "embedding_descriptor": nlp_pipeline.EMBEDDING_DESCRIPTOR,
    }


def _history_patch(
    config: ProcessingConfig,
    status: str,
    input_count: int | None,
    processed_count: int | None,
    excluded_count: int | None,
    output_count: int | None,
    run_meta: dict | None,
    error_summary: str | None,
) -> dict:
    run_meta = run_meta or {}
    return {
        "run_timestamp_utc": datetime.utcnow(),
        "status": status,
        "run_label": config.run_label,
        "input_answer_count": input_count,
        "processed_answer_count": processed_count,
        "excluded_answer_count": excluded_count,
        "output_group_count": output_count,
        "model_name": config.embedding_model,
        "embedding_model": config.embedding_model,
        "clustering_method": config.clustering_method,
        "distance_threshold": run_meta.get("distance_threshold", config.distance_threshold),
        "min_k": run_meta.get("min_k", config.min_k),
        "max_k": run_meta.get("max_k", config.max_k),
        "fixed_k": run_meta.get("fixed_k", config.fixed_k),
        "selected_k": run_meta.get("selected_k"),
        "silhouette": run_meta.get("silhouette"),
        "calinski_harabasz": run_meta.get("calinski_harabasz"),
        "davies_bouldin": run_meta.get("davies_bouldin"),
        "excluded_words_used": run_meta.get("excluded_words_used", config.excluded_words if config.use_excluded_words else []),
        "preprocessing_descriptor": nlp_pipeline.PREPROCESSING_DESCRIPTOR,
        "embedding_descriptor": nlp_pipeline.EMBEDDING_DESCRIPTOR,
        "error_summary": error_summary,
    }


def _update_history_run(db, survey_id_obj: ObjectId, run_id: str, patch: dict) -> None:
    db[GROUPED_RESULTS_COLLECTION].update_one(
        {"survey_id": survey_id_obj, "processing_history.run_id": run_id},
        {"$set": {f"processing_history.$.{k}": v for k, v in patch.items()}},
    )


@celery_app.task(name='process_survey_responses')
def process_survey_responses_task(
    survey_id: str,
    run_id: str | None = None,
    processing_config: dict | None = None,
):
    logger.info(f"Celery task received for processing survey ID: {survey_id}")

    db_client = None
    db = None
    raw_answer_texts: list[str] = []
    config = ProcessingConfig(**(processing_config or {}))
    run_meta: dict | None = None
    try:
        db_client = pymongo.MongoClient(settings.mongo_connection_string)

        db = db_client[settings.database_name]
        if not ObjectId.is_valid(survey_id):
             logger.error(f"Invalid survey ID format received by task: {survey_id}")
             return {"status": "Error", "message": "Invalid survey ID format"}
        survey_id_obj = ObjectId(survey_id)
        actual_run_id = run_id or str(uuid4())

        db[GROUPED_RESULTS_COLLECTION].update_one(
            {"survey_id": survey_id_obj},
            {"$set": {
                "status": "processing",
                "processing_time_utc": datetime.utcnow(),
                "run_label": config.run_label,
                "grouped_answers": [],
                "errors": [],
            }},
            upsert=True,
        )
        _update_history_run(
            db,
            survey_id_obj,
            actual_run_id,
            _history_patch(config, "processing", None, None, None, None, run_meta, None),
        )

        logger.info(f"Fetching raw responses for survey ID: {survey_id}")
        responses_cursor = db[RESPONSE_COLLECTION].find({"survey_id": survey_id_obj})
        raw_responses_docs = list(responses_cursor)

        raw_answer_texts = [
            doc.get("answer_text", "") for doc in raw_responses_docs if isinstance(doc.get("answer_text"), str)
        ]

        logger.info(f"Fetched {len(raw_answer_texts)} valid raw answer texts.")

        db[GROUPED_RESULTS_COLLECTION].update_one(
            {"survey_id": survey_id_obj},
            {"$set": {
                "input_answer_count": len(raw_answer_texts),
                "processing_time_utc": datetime.utcnow(),
            }},
        )
        _update_history_run(
            db,
            survey_id_obj,
            actual_run_id,
            _history_patch(config, "processing", len(raw_answer_texts), None, None, None, run_meta, None),
        )

        if not raw_answer_texts:
            logger.info(f"No valid answer texts to process for survey ID: {survey_id}.")
            empty_results_doc = {
                "survey_id": survey_id_obj,
                "processing_time_utc": datetime.utcnow(),
                "status": "completed_no_data",
                "grouped_answers": [],
                "similar_group_pairs": [],
                "errors": ["No valid answer texts found to process."],
                **_run_metadata(config, 0, 0, 0, 0, run_meta),
            }
            db[GROUPED_RESULTS_COLLECTION].update_one(
                {"survey_id": survey_id_obj},
                {"$set": empty_results_doc},
                upsert=True
            )
            _update_history_run(
                db,
                survey_id_obj,
                actual_run_id,
                _history_patch(config, "completed_no_data", 0, 0, 0, 0, run_meta, "No valid answer texts found to process."),
            )
            logger.info(f"Saved empty/no_data result for survey ID: {survey_id}")
            return {"status": "Completed (No Data)", "survey_id": survey_id}


        logger.info("Starting NLP pipeline...")
        grouped_data_from_nlp = nlp_pipeline.group_responses(raw_answer_texts, processing_config=config)
        logger.info("NLP pipeline finished.")

        grouped_answers_payload = grouped_data_from_nlp.get("grouped_answers", [])
        similar_group_pairs = grouped_data_from_nlp.get("similar_group_pairs", [])
        run_meta = grouped_data_from_nlp.get("run_metadata", {})

        logger.info(f"Structuring and saving grouped results for survey ID: {survey_id}")

        grouped_answers_models: List[GroupedAnswer] = []
        for group_dict in grouped_answers_payload:
            grouped_answers_models.append(
                GroupedAnswer(
                    canonical_name=group_dict["canonical_name"],
                    count=group_dict["count"],
                    raw_answers=group_dict["raw_answers_in_group"],
                    coordinates=group_dict.get("coordinates"),
                    response_similarities=group_dict.get("response_similarities", []),
                )
            )
        n_in = len(raw_answer_texts)
        n_processed = run_meta.get("processed_answer_count", n_in)
        n_excluded = run_meta.get("excluded_answer_count", 0)
        n_groups = len(grouped_answers_models)
        meta = _run_metadata(config, n_in, n_processed, n_excluded, n_groups, run_meta)

        results_to_save_model = SurveyGroupedResults(
            survey_id=survey_id_obj,
            processing_time_utc=datetime.utcnow(),
            status="completed",
            grouped_answers=grouped_answers_models,
            errors=[],
            input_answer_count=meta["input_answer_count"],
            output_group_count=meta["output_group_count"],
            model_name=meta["model_name"],
            embedding_model=meta["embedding_model"],
            clustering_method=meta["clustering_method"],
            run_label=meta["run_label"],
            distance_threshold=meta["distance_threshold"],
            min_k=meta["min_k"],
            max_k=meta["max_k"],
            fixed_k=meta["fixed_k"],
            selected_k=meta["selected_k"],
            silhouette=meta["silhouette"],
            calinski_harabasz=meta["calinski_harabasz"],
            davies_bouldin=meta["davies_bouldin"],
            excluded_answer_count=meta["excluded_answer_count"],
            processed_answer_count=meta["processed_answer_count"],
            excluded_words_used=meta["excluded_words_used"],
            preprocessing_descriptor=meta["preprocessing_descriptor"],
            embedding_descriptor=meta["embedding_descriptor"],
            similar_group_pairs=similar_group_pairs,
        )
        document_to_save = results_to_save_model.model_dump(by_alias=True, exclude_none=True, exclude={'id'})

        db[GROUPED_RESULTS_COLLECTION].update_one(
            {"survey_id": survey_id_obj},
            {"$set": document_to_save},
            upsert=True
        )
        _update_history_run(
            db,
            survey_id_obj,
            actual_run_id,
            _history_patch(config, "completed", n_in, n_processed, n_excluded, n_groups, run_meta, None),
        )
        logger.info(f"Saved/Updated grouped results in MongoDB for survey ID: {survey_id}")

        return {"status": "Completed", "survey_id": survey_id, "groups_found": len(grouped_answers_models)}

    except Exception as e:
        logger.error(f"An error occurred during processing task for survey ID {survey_id}: {e}", exc_info=True)
        try:
            if db_client and db is not None and ObjectId.is_valid(survey_id):
                n_in = len(raw_answer_texts)
                n_processed = run_meta.get("processed_answer_count", n_in) if run_meta else n_in
                n_excluded = run_meta.get("excluded_answer_count", 0) if run_meta else 0
                error_doc = {
                    "survey_id": ObjectId(survey_id),
                    "processing_time_utc": datetime.utcnow(),
                    "status": "failed",
                    "grouped_answers": [],
                    "similar_group_pairs": [],
                    "errors": [str(e)],
                    **_run_metadata(config, n_in, n_processed, n_excluded, 0, run_meta),
                }
                db[GROUPED_RESULTS_COLLECTION].update_one(
                    {"survey_id": ObjectId(survey_id)},
                    {"$set": error_doc},
                    upsert=True
                )
                if run_id:
                    _update_history_run(
                        db,
                        ObjectId(survey_id),
                        run_id,
                        _history_patch(config, "failed", n_in, n_processed, n_excluded, 0, run_meta, str(e)),
                    )
        except Exception as db_error:
            logger.error(f"Failed to save error state to DB for survey {survey_id}: {db_error}")

        return {"status": "Failed", "survey_id": survey_id, "error": str(e)}

    finally:
        if db_client:
            db_client.close()
            logger.info("MongoDB connection closed for task.")
