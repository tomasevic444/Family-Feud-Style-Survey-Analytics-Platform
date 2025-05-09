# backend/app/celery_worker.py
from celery import Celery
from .config import settings
import logging
import pymongo
from bson import ObjectId
from datetime import datetime 

from .nlp import nlp_pipeline
from .database import RESPONSE_COLLECTION, GROUPED_RESULTS_COLLECTION
from .models.grouped_result import SurveyGroupedResults, GroupedAnswer
import certifi

logger = logging.getLogger(__name__)

celery_app = Celery(
    'family_feud_tasks',
    broker=settings.celery_broker_url,
    backend=settings.celery_backend_url
)

@celery_app.task(name='process_survey_responses')
def process_survey_responses_task(survey_id: str):
    """
    Celery task to trigger NLP processing for a survey.
    Fetches raw responses, runs NLP, saves results .
    """
    logger.info(f"Celery task received for processing survey ID: {survey_id}")

    db_client = None
    try:
        # 1. Get database connection within the task 
        db_client = pymongo.MongoClient(settings.mongo_connection_string, tlsCAFile=certifi.where())
        db = db_client[settings.database_name]

        # Validate Survey ID format
        if not ObjectId.is_valid(survey_id):
             logger.error(f"Invalid survey ID format received by task: {survey_id}")
             return {"status": "Error", "message": "Invalid survey ID format"}
        survey_id_obj = ObjectId(survey_id)

        # 2. Fetch raw responses (Synchronous)
        logger.info(f"Fetching raw responses for survey ID: {survey_id}")
        responses_cursor = db[RESPONSE_COLLECTION].find({"survey_id": survey_id_obj})
        raw_responses_docs = list(responses_cursor)

        # Filter out potential None or non-string answers before passing to NLP
        raw_answer_texts = [
            doc.get("answer_text", "") for doc in raw_responses_docs if isinstance(doc.get("answer_text"), str)
        ]

        logger.info(f"Fetched {len(raw_answer_texts)} valid raw answer texts.")

        if not raw_answer_texts:
            logger.info(f"No valid answer texts to process for survey ID: {survey_id}.")
            empty_results_doc = {
                "survey_id": survey_id_obj,
                "processing_time_utc": datetime.utcnow(),
                "status": "completed_no_data",
                "grouped_answers": [],
                "errors": ["No valid answer texts found to process."]
            }
            db[GROUPED_RESULTS_COLLECTION].update_one(
                {"survey_id": survey_id_obj},
                {"$set": empty_results_doc},
                upsert=True
            )
            logger.info(f"Saved empty/no_data result for survey ID: {survey_id}")
            return {"status": "Completed (No Data)", "survey_id": survey_id}


        # 3. Run the NLP pipeline
        logger.info("Starting NLP pipeline...")
        # The nlp_pipeline.group_responses now returns a list of dicts
        grouped_data_from_nlp = nlp_pipeline.group_responses(raw_answer_texts) # Pass only the texts
        logger.info("NLP pipeline finished.")

        # 4. Structure and Save the grouped results to MongoDB
        logger.info(f"Structuring and saving grouped results for survey ID: {survey_id}")

        # Convert the list of dicts from NLP into a list of GroupedAnswer Pydantic models
        grouped_answers_models: List[GroupedAnswer] = []
        for group_dict in grouped_data_from_nlp:
            grouped_answers_models.append(
                GroupedAnswer(
                    canonical_name=group_dict["canonical_name"],
                    count=group_dict["count"],
                    raw_answers=group_dict["raw_answers_in_group"] # Ensure key matches
                )
            )

        results_to_save_model = SurveyGroupedResults(
            survey_id=survey_id_obj, 
            processing_time_utc=datetime.utcnow(),
            status="completed",
            grouped_answers=grouped_answers_models,
            errors=[] # Assuming no errors from NLP for now
        )
        # Convert Pydantic model to dict, excluding 'id' as MongoDB will generate '_id'
        document_to_save = results_to_save_model.model_dump(by_alias=True, exclude_none=True, exclude={'id'})

        db[GROUPED_RESULTS_COLLECTION].update_one(
            {"survey_id": survey_id_obj}, # Filter to find existing results for this survey
            {"$set": document_to_save},   # Data to set (replaces entire doc if matched, or sets on new)
            upsert=True                   # Create the document if it doesn't exist
        )
        logger.info(f"Saved/Updated grouped results in MongoDB for survey ID: {survey_id}")

        return {"status": "Completed", "survey_id": survey_id, "groups_found": len(grouped_answers_models)}

    except Exception as e:
        logger.error(f"An error occurred during processing task for survey ID {survey_id}: {e}", exc_info=True)
        try:
            if db_client and ObjectId.is_valid(survey_id): # Check if db_client is initialized
                error_doc = {
                    "survey_id": ObjectId(survey_id),
                    "processing_time_utc": datetime.utcnow(),
                    "status": "failed",
                    "grouped_answers": [],
                    "errors": [str(e)]
                }
                db[GROUPED_RESULTS_COLLECTION].update_one(
                    {"survey_id": ObjectId(survey_id)},
                    {"$set": error_doc},
                    upsert=True
                )
        except Exception as db_error:
            logger.error(f"Failed to save error state to DB for survey {survey_id}: {db_error}")

        return {"status": "Failed", "survey_id": survey_id, "error": str(e)}

    finally:
        # Close the database connection
        if db_client:
            db_client.close()
            logger.info("MongoDB connection closed for task.")