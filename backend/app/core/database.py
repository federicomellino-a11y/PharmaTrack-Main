import os
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL'].strip()
database_name = os.environ['DB_NAME'].strip()
client = AsyncIOMotorClient(mongo_url)
db = client[database_name]
