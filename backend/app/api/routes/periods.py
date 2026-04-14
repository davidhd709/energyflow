from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import enforce_tenant_scope, get_db, get_current_user, require_roles
from app.schemas import BillingPeriodCreate, BillingPeriodReopenRequest, BillingPeriodUpdate
from app.services.audit_service import log_audit
from app.utils.object_id import serialize_doc, to_object_id

router = APIRouter()


def _period_days(start, end) -> int:
    return (end - start).days + 1


def _as_date(value) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    raise HTTPException(status_code=400, detail='Formato de fecha inválido')


def _to_utc_datetime(value: date) -> datetime:
    return datetime.combine(value, time.min, tzinfo=timezone.utc)


@router.get('')
async def list_periods(
    condominium_id: str | None = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    tenant_condo_id = enforce_tenant_scope(current_user, condominium_id)
    condo_obj_id = to_object_id(tenant_condo_id, 'condominium_id')

    docs = await db.billing_periods.find({'condominium_id': condo_obj_id}).sort('fecha_inicio', -1).to_list(length=None)
    return serialize_doc(docs)


@router.post('')
async def create_period(
    payload: BillingPeriodCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin', 'operador')),
) -> dict:
    if payload.fecha_fin < payload.fecha_inicio:
        raise HTTPException(status_code=400, detail='fecha_fin debe ser mayor o igual a fecha_inicio')

    tenant_condo_id = enforce_tenant_scope(current_user, payload.condominium_id)
    condo_obj_id = to_object_id(tenant_condo_id, 'condominium_id')

    now = datetime.now(timezone.utc)
    fecha_inicio = _to_utc_datetime(payload.fecha_inicio)
    fecha_fin = _to_utc_datetime(payload.fecha_fin)
    doc = {
        'condominium_id': condo_obj_id,
        'fecha_inicio': fecha_inicio,
        'fecha_fin': fecha_fin,
        'dias': _period_days(payload.fecha_inicio, payload.fecha_fin),
        'estado': 'abierto',
        'created_at': now,
        'updated_at': now,
    }

    res = await db.billing_periods.insert_one(doc)
    created = await db.billing_periods.find_one({'_id': res.inserted_id})
    created_doc = serialize_doc(created)

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='create',
        entity='billing_periods',
        entity_id=created_doc['_id'],
        detail={'fecha_inicio': str(payload.fecha_inicio), 'fecha_fin': str(payload.fecha_fin)},
    )

    return created_doc


@router.patch('/{billing_period_id}')
async def update_period(
    billing_period_id: str,
    payload: BillingPeriodUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin', 'operador')),
) -> dict:
    try:
        period_obj_id = to_object_id(billing_period_id, 'billing_period_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='billing_period_id inválido') from exc

    period = await db.billing_periods.find_one({'_id': period_obj_id})
    if not period:
        raise HTTPException(status_code=404, detail='Periodo no encontrado')

    enforce_tenant_scope(current_user, str(period['condominium_id']))

    if period.get('estado') == 'cerrado':
        raise HTTPException(
            status_code=400,
            detail='El periodo está cerrado. Solo superadmin puede reabrirlo con motivo para permitir ediciones.',
        )

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail='No hay campos para actualizar')

    fecha_inicio_date = _as_date(updates.get('fecha_inicio', period['fecha_inicio']))
    fecha_fin_date = _as_date(updates.get('fecha_fin', period['fecha_fin']))
    fecha_inicio = _to_utc_datetime(fecha_inicio_date)
    fecha_fin = _to_utc_datetime(fecha_fin_date)
    if fecha_fin < fecha_inicio:
        raise HTTPException(status_code=400, detail='fecha_fin debe ser mayor o igual a fecha_inicio')

    updates['fecha_inicio'] = fecha_inicio
    updates['fecha_fin'] = fecha_fin
    updates['dias'] = _period_days(fecha_inicio_date, fecha_fin_date)
    updates['updated_at'] = datetime.now(timezone.utc)

    await db.billing_periods.update_one({'_id': period_obj_id}, {'$set': updates})
    updated = await db.billing_periods.find_one({'_id': period_obj_id})
    updated_doc = serialize_doc(updated)

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='update',
        entity='billing_periods',
        entity_id=billing_period_id,
        detail=updates,
    )

    return updated_doc


@router.post('/{billing_period_id}/close')
async def close_period(
    billing_period_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin', 'operador')),
) -> dict:
    try:
        period_obj_id = to_object_id(billing_period_id, 'billing_period_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='billing_period_id inválido') from exc

    period = await db.billing_periods.find_one({'_id': period_obj_id})
    if not period:
        raise HTTPException(status_code=404, detail='Periodo no encontrado')

    condo_id = str(period['condominium_id'])
    enforce_tenant_scope(current_user, condo_id)

    if period.get('estado') == 'cerrado':
        raise HTTPException(status_code=400, detail='El periodo ya está cerrado')

    houses = await db.houses.find({'condominium_id': period['condominium_id'], 'activo': True}).to_list(length=None)
    readings = await db.meter_readings.find({'billing_period_id': period_obj_id}).to_list(length=None)
    reading_house_ids = {str(reading['house_id']) for reading in readings}

    missing = [house['numero_casa'] for house in houses if str(house['_id']) not in reading_house_ids]
    if missing:
        raise HTTPException(
            status_code=400,
            detail={
                'message': 'No se puede cerrar periodo: faltan lecturas',
                'houses': missing,
            },
        )

    await db.billing_periods.update_one(
        {'_id': period_obj_id},
        {
            '$set': {
                'estado': 'cerrado',
                'updated_at': datetime.now(timezone.utc),
            }
        },
    )

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='close',
        entity='billing_periods',
        entity_id=billing_period_id,
    )

    return {'message': 'Periodo cerrado exitosamente'}


@router.post('/{billing_period_id}/reopen')
async def reopen_period(
    billing_period_id: str,
    payload: BillingPeriodReopenRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin')),
) -> dict:
    try:
        period_obj_id = to_object_id(billing_period_id, 'billing_period_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='billing_period_id inválido') from exc

    period = await db.billing_periods.find_one({'_id': period_obj_id})
    if not period:
        raise HTTPException(status_code=404, detail='Periodo no encontrado')

    enforce_tenant_scope(current_user, str(period['condominium_id']))

    if period.get('estado') != 'cerrado':
        raise HTTPException(status_code=400, detail='Solo se pueden reabrir periodos cerrados')

    now = datetime.now(timezone.utc)
    await db.billing_periods.update_one(
        {'_id': period_obj_id},
        {
            '$set': {
                'estado': 'abierto',
                'updated_at': now,
            },
            '$push': {
                'reopen_history': {
                    'motivo': payload.motivo.strip(),
                    'reopened_by': current_user['_id'],
                    'timestamp': now,
                }
            },
        },
    )

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='reopen',
        entity='billing_periods',
        entity_id=billing_period_id,
        detail={'motivo': payload.motivo.strip()},
    )

    return {'message': 'Periodo reabierto exitosamente'}
