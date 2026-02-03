import asyncio
import json
import os
import random
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

MONGO_URI = os.getenv("MONGO_CONNECTION_STRING", "mongodb://localhost:27017")
DB_NAME = os.getenv("DATABASE_NAME", "familyFeudDB")

async def seed_data():
    print(f"Connecting to {MONGO_URI}...")
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]

    # Load the JSON data
    file_path = os.path.join("data", "questions.json")
    if not os.path.exists(file_path):
        print("Error: data/questions.json not found!")
        return

    with open(file_path, "r") as f:
        data = json.load(f)

    print(f"Found {len(data)} surveys to import.")

    surveys_collection = db["surveys"]
    responses_collection = db["responses"]


    for entry in data:
        survey_doc = {
            "question_text": entry["question"],
            "is_active": True,
            "participant_limit": 500,
            "tags": ["seeded", "general"],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        result = await surveys_collection.insert_one(survey_doc)
        survey_id = result.inserted_id
        print(f"Created Survey: {entry['question']} (ID: {survey_id})")

        
        responses_to_insert = []
        for ans in entry["answers"]:
            count = ans["count"]
            text = ans["text"]
            
            for _ in range(count):
                noise_chance = random.random()
                final_text = text
                if noise_chance < 0.1:
                    final_text = text.lower()
                elif noise_chance < 0.2:
                    final_text = text + " " 
                
                response_doc = {
                    "survey_id": survey_id,
                    "answer_text": final_text,
                    "created_at": datetime.utcnow()
                }
                responses_to_insert.append(response_doc)

        if responses_to_insert:
            await responses_collection.insert_many(responses_to_insert)
            print(f"  -> Inserted {len(responses_to_insert)} simulated responses.")

    print("Seeding complete!")
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_data())