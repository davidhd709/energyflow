from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import settings


class MongoConnection:
    def __init__(self) -> None:
        self.client: AsyncIOMotorClient | None = None
        self.db: AsyncIOMotorDatabase | None = None
        self.last_error: str | None = None

    async def connect(self, strict: bool = True) -> None:
        if self.client is not None and self.db is not None:
            return

        client = AsyncIOMotorClient(
            settings.MONGODB_URI,
            maxPoolSize=50,
            minPoolSize=5,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=15000,
        )

        try:
            # Warm up Atlas connection at startup to avoid first-request latency.
            await client.admin.command('ping')
        except Exception as exc:
            self.last_error = str(exc)
            client.close()
            self.client = None
            self.db = None
            if strict:
                raise
            return

        self.client = client
        self.db = client[settings.MONGODB_DB_NAME]
        self.last_error = None

    async def disconnect(self) -> None:
        if self.client:
            self.client.close()
        self.client = None
        self.db = None

    async def ensure_connected(self) -> None:
        if self.db is None:
            await self.connect(strict=True)


mongo = MongoConnection()
