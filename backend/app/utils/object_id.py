from datetime import date, datetime
from decimal import Decimal
from typing import Any

from bson import ObjectId


def to_object_id(value: str | ObjectId | None, field_name: str = 'id') -> ObjectId:
    if isinstance(value, ObjectId):
        return value
    if not value or not ObjectId.is_valid(value):
        raise ValueError(f'Invalid {field_name}')
    return ObjectId(value)


def serialize_doc(data: Any) -> Any:
    if isinstance(data, list):
        return [serialize_doc(item) for item in data]
    if isinstance(data, dict):
        serialized: dict[str, Any] = {}
        for key, value in data.items():
            if isinstance(value, ObjectId):
                serialized[key] = str(value)
            else:
                serialized[key] = serialize_doc(value)
        return serialized
    if isinstance(data, datetime):
        if (
            data.hour == 0
            and data.minute == 0
            and data.second == 0
            and data.microsecond == 0
        ):
            return data.date().isoformat()
        return data.isoformat()
    if isinstance(data, date):
        return data.isoformat()
    if isinstance(data, Decimal):
        return float(data)
    return data
