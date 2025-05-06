# backend/app/celery_worker.py

import eventlet

from celery import Celery
from .config import settings
import logging

# Configure logging for Celery worker
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
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
    """
    logger.info(f"Celery task received for processing survey ID: {survey_id}")
    # Note: DB connection within the task needs careful handling (see note below)

    # --- Dummy Processing ---
    print(f"Processing responses for survey {survey_id}...")
    # *** TODO: Fetch responses using service/DB connection here ***
    # *** TODO: Run NLP pipeline on responses ***
    # *** TODO: Save grouped results to DB ***
    print(f"Finished dummy processing for survey {survey_id}.")

    return {"status": "Processing initiated", "survey_id": survey_id}

