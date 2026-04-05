from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import settings


class MongoConnection:
    def __init__(self) -> None:
        self.client: AsyncIOMotorClient | None = None
        self.db: AsyncIOMotorDatabase | None = None

    async def connect(self) -> None:
        self.client = AsyncIOMotorClient(
            settings.MONGODB_URI,
            maxPoolSize=50,
            minPoolSize=5,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=15000,
        )
        self.db = self.client[settings.MONGODB_DB_NAME]
        # Warm up Atlas connection at startup to avoid first-request latency.
        await self.client.admin.command('ping')

    async def disconnect(self) -> None:
        if self.client:
            self.client.close()


mongo = MongoConnection()
