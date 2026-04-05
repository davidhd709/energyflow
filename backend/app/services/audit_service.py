from datetime import datetime, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase


async def log_audit(
    db: AsyncIOMotorDatabase,
    *,
    user_id: str,
    action: str,
    entity: str,
    entity_id: str | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    await db.audit_logs.insert_one(
        {
            'user_id': user_id,
            'action': action,
            'entity': entity,
            'entity_id': entity_id,
            'detail': detail or {},
            'timestamp': datetime.now(timezone.utc),
        }
    )
