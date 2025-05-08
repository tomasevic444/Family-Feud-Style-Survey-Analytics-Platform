# backend/app/celery_worker.py
from celery import Celery
from .config import settings
import logging
import pymongo
from bson import ObjectId

from .nlp import nlp_pipeline
from .database import RESPONSE_COLLECTION


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

    db_client = None # Use None for potential error handling
    try:
        # 1. Get database connection within the task 
        import certifi # Ensure certifi is imported if needed for tlsCAFile
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
        # Convert cursor to list synchronously
        raw_responses_docs = list(responses_cursor) # <-- No 'await', use list()

        raw_answer_texts = [doc.get("answer_text", "") for doc in raw_responses_docs]

        logger.info(f"Fetched {len(raw_answer_texts)} raw responses.")

        # 3. Run the NLP pipeline (dummy)
        logger.info("Starting NLP pipeline...")
        # Ensure your nlp_pipeline.group_responses returns a serializable dict/list
        grouped_results_data = nlp_pipeline.group_responses(raw_answer_texts) 
        logger.info("NLP pipeline finished.")

        # 4. Save the grouped results (TODO)

        # Return a JSON serializable result
        return {"status": "Completed", "survey_id": survey_id, "grouped_results_summary": f"{len(grouped_results_data)} groups found (dummy)"}

    except Exception as e:
        logger.error(f"An error occurred during processing task for survey ID {survey_id}: {e}", exc_info=True)
        return {"status": "Failed", "survey_id": survey_id, "error": str(e)}

    finally:
        # Close the database connection (Synchronous)
        if db_client:
            db_client.close()
            logger.info("MongoDB connection closed for task.")