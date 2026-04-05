from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import get_db, require_roles
from app.services.audit_service import log_audit
from app.utils.object_id import serialize_doc, to_object_id

router = APIRouter()


@router.get('/global')
async def get_global_settings(
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: dict = Depends(require_roles('superadmin')),
) -> dict:
    settings = await db.system_settings.find_one({'_id': 'global'})
    if not settings:
        return {
            '_id': 'global',
            'default_porcentaje_alumbrado': 15.0,
            'default_email_soporte': '',
            'updated_at': None,
        }
    return serialize_doc(settings)


@router.put('/global')
async def update_global_settings(
    payload: dict[str, Any],
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin')),
) -> dict:
    now = datetime.now(timezone.utc)
    payload['updated_at'] = now

    await db.system_settings.update_one(
        {'_id': 'global'},
        {
            '$set': payload,
            '$setOnInsert': {'created_at': now},
        },
        upsert=True,
    )

    current = await db.system_settings.find_one({'_id': 'global'})
    current_doc = serialize_doc(current)

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='update',
        entity='system_settings',
        entity_id='global',
        detail=payload,
    )

    return current_doc


@router.post('/reset-data')
async def reset_all_data_keep_current_superadmin(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin')),
) -> dict:
    superadmin_obj_id = to_object_id(current_user['_id'], 'superadmin_id')
    now = datetime.now(timezone.utc)

    collections_to_clean = [
        'condominiums',
        'houses',
        'billing_periods',
        'meter_readings',
        'supplier_invoices',
        'house_invoices',
        'audit_logs',
        'system_settings',
    ]

    deleted_counts: dict[str, int] = {}
    for collection_name in collections_to_clean:
        result = await db[collection_name].delete_many({})
        deleted_counts[collection_name] = result.deleted_count

    users_deleted = await db.users.delete_many({'_id': {'$ne': superadmin_obj_id}})
    deleted_counts['users_removed'] = users_deleted.deleted_count

    await db.users.update_one(
        {'_id': superadmin_obj_id},
        {
            '$set': {
                'rol': 'superadmin',
                'condominium_id': None,
                'activo': True,
                'updated_at': now,
            }
        },
    )

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='reset_data',
        entity='system',
        entity_id='global',
        detail=deleted_counts,
    )

    return {
        'message': 'Base de datos limpiada. Solo permanece el superadmin actual.',
        'deleted': deleted_counts,
    }
