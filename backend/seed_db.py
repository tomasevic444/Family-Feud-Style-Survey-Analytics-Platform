import asyncio
import json
import os
import random
import logging
from typing import List, Dict, Any
from datetime import datetime
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

load_dotenv()

MONGO_URI = os.getenv("MONGO_CONNECTION_STRING", "mongodb://localhost:27017")
DB_NAME = os.getenv("DATABASE_NAME", "familyFeudDB")
DATA_FILE_PATH = os.path.join("data", "questions.json")

async def seed_data() -> None:
    """
    Reads data from a JSON file and populates the MongoDB database.
    Simulates user input variation for realistic testing.
    """
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]

    try:
        await client.admin.command('ping')
        logger.info(f"Connected to MongoDB at {MONGO_URI}")

        if not os.path.exists(DATA_FILE_PATH):
            logger.error(f"Data file not found at: {DATA_FILE_PATH}")
            return

        with open(DATA_FILE_PATH, "r", encoding='utf-8') as f:
            data: List[Dict[str, Any]] = json.load(f)

        logger.info(f"Found {len(data)} surveys to import.")

        surveys_collection = db["surveys"]
        responses_collection = db["responses"]

        for entry in data:
            survey_doc = {
                "question_text": entry["question"],
                "is_active": True,
                "participant_limit": 500,
                "tags": ["seeded", "demo"],
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            result = await surveys_collection.insert_one(survey_doc)
            survey_id = result.inserted_id
            logger.info(f"Created Survey: {entry['question']} (ID: {survey_id})")

            responses_to_insert = []
            for ans in entry["answers"]:
                count = ans.get("count", 0)
                base_text = ans.get("text", "")
                
                for _ in range(count):
                    final_text = base_text
                    rand_val = random.random()
                    
                    if rand_val < 0.1:
                        final_text = base_text.lower()
                    elif rand_val < 0.2:
                        final_text = base_text.upper()
                    elif rand_val < 0.25:
                        final_text = f"{base_text} " 
                    
                    response_doc = {
                        "survey_id": survey_id,
                        "answer_text": final_text,
                        "created_at": datetime.utcnow()
                    }
                    responses_to_insert.append(response_doc)

            if responses_to_insert:
                await responses_collection.insert_many(responses_to_insert)
                logger.info(f"Inserted {len(responses_to_insert)} responses for survey ID {survey_id}.")

        logger.info("Database seeding completed successfully.")

    except Exception as e:
        logger.error(f"An error occurred during seeding: {e}")
    finally:
        client.close()
        logger.info("MongoDB connection closed.")

if __name__ == "__main__":
    asyncio.run(seed_data())