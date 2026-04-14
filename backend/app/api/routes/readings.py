from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import get_db, get_current_user, require_roles, enforce_tenant_scope
from app.schemas import MeterReadingUpsert
from app.services.audit_service import log_audit
from app.services.upload_service import save_image_upload
from app.utils.object_id import serialize_doc, to_object_id

router = APIRouter()


async def _resolve_previous_reading(
    db: AsyncIOMotorDatabase,
    *,
    period: dict,
    period_obj_id,
    house_obj_id,
) -> tuple[float, str]:
    existing_current = await db.meter_readings.find_one({'billing_period_id': period_obj_id, 'house_id': house_obj_id})
    if existing_current and existing_current.get('lectura_anterior') is not None:
        return float(existing_current['lectura_anterior']), 'actual'

    previous_period = await db.billing_periods.find_one(
        {
            'condominium_id': period['condominium_id'],
            'fecha_fin': {'$lt': period['fecha_inicio']},
        },
        sort=[('fecha_fin', -1)],
    )
    if previous_period:
        previous_reading = await db.meter_readings.find_one(
            {
                'billing_period_id': previous_period['_id'],
                'house_id': house_obj_id,
            }
        )
        if previous_reading and previous_reading.get('lectura_actual') is not None:
            return float(previous_reading['lectura_actual']), 'periodo_anterior'

    latest_reading = await db.meter_readings.find_one({'house_id': house_obj_id}, sort=[('updated_at', -1), ('created_at', -1)])
    if latest_reading and latest_reading.get('lectura_actual') is not None:
        return float(latest_reading['lectura_actual']), 'historico'

    return 0.0, 'default'


@router.get('')
async def list_readings(
    billing_period_id: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    try:
        period_obj_id = to_object_id(billing_period_id, 'billing_period_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='billing_period_id inválido') from exc

    period = await db.billing_periods.find_one({'_id': period_obj_id})
    if not period:
        raise HTTPException(status_code=404, detail='Periodo no encontrado')

    enforce_tenant_scope(current_user, str(period['condominium_id']))

    readings = await db.meter_readings.find({'billing_period_id': period_obj_id}).to_list(length=None)
    return serialize_doc(readings)


@router.get('/prefill')
async def prefill_reading(
    billing_period_id: str = Query(...),
    house_id: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    try:
        period_obj_id = to_object_id(billing_period_id, 'billing_period_id')
        house_obj_id = to_object_id(house_id, 'house_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='IDs inválidos') from exc

    period = await db.billing_periods.find_one({'_id': period_obj_id})
    if not period:
        raise HTTPException(status_code=404, detail='Periodo no encontrado')

    house = await db.houses.find_one({'_id': house_obj_id})
    if not house:
        raise HTTPException(status_code=404, detail='Casa no encontrada')

    if house['condominium_id'] != period['condominium_id']:
        raise HTTPException(status_code=400, detail='La casa no pertenece al condominio del periodo')

    enforce_tenant_scope(current_user, str(period['condominium_id']))

    lectura_anterior, source = await _resolve_previous_reading(
        db,
        period=period,
        period_obj_id=period_obj_id,
        house_obj_id=house_obj_id,
    )

    return {
        'lectura_anterior': lectura_anterior,
        'source': source,
    }


@router.put('')
async def upsert_reading(
    payload: MeterReadingUpsert,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin', 'operador')),
) -> dict:
    try:
        period_obj_id = to_object_id(payload.billing_period_id, 'billing_period_id')
        house_obj_id = to_object_id(payload.house_id, 'house_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='IDs inválidos') from exc

    period = await db.billing_periods.find_one({'_id': period_obj_id})
    if not period:
        raise HTTPException(status_code=404, detail='Periodo no encontrado')
    if period.get('estado') == 'cerrado':
        raise HTTPException(status_code=400, detail='El periodo está cerrado. Debe reabrirse para editar lecturas.')

    house = await db.houses.find_one({'_id': house_obj_id})
    if not house:
        raise HTTPException(status_code=404, detail='Casa no encontrada')

    if house['condominium_id'] != period['condominium_id']:
        raise HTTPException(status_code=400, detail='La casa no pertenece al condominio del periodo')

    enforce_tenant_scope(current_user, str(period['condominium_id']))

    lectura_anterior = payload.lectura_anterior
    if lectura_anterior is None:
        lectura_anterior, _ = await _resolve_previous_reading(
            db,
            period=period,
            period_obj_id=period_obj_id,
            house_obj_id=house_obj_id,
        )

    if payload.lectura_actual < lectura_anterior:
        raise HTTPException(status_code=400, detail='lectura_actual debe ser mayor o igual a lectura_anterior')

    consumo = payload.lectura_actual - lectura_anterior
    if consumo < 0:
        raise HTTPException(status_code=400, detail='Consumo negativo detectado')

    now = datetime.now(timezone.utc)
    doc = {
        'billing_period_id': period_obj_id,
        'house_id': house_obj_id,
        'lectura_anterior': lectura_anterior,
        'lectura_actual': payload.lectura_actual,
        'consumo': consumo,
        'observaciones': payload.observaciones or '',
        'updated_at': now,
    }

    existing = await db.meter_readings.find_one({'billing_period_id': period_obj_id, 'house_id': house_obj_id})
    if existing:
        await db.meter_readings.update_one({'_id': existing['_id']}, {'$set': doc})
        reading_id = str(existing['_id'])
        action = 'update'
    else:
        doc['created_at'] = now
        result = await db.meter_readings.insert_one(doc)
        reading_id = str(result.inserted_id)
        action = 'create'

    updated = await db.meter_readings.find_one({'billing_period_id': period_obj_id, 'house_id': house_obj_id})
    updated_doc = serialize_doc(updated)

    await log_audit(
        db,
        user_id=current_user['_id'],
        action=action,
        entity='meter_readings',
        entity_id=reading_id,
        detail={
            'house_id': payload.house_id,
            'billing_period_id': payload.billing_period_id,
            'consumo': consumo,
        },
    )

    return updated_doc


@router.post('/{reading_id}/photo')
async def upload_meter_photo(
    reading_id: str,
    file: UploadFile = File(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin', 'operador')),
) -> dict:
    try:
        reading_obj_id = to_object_id(reading_id, 'reading_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='reading_id inválido') from exc

    reading = await db.meter_readings.find_one({'_id': reading_obj_id})
    if not reading:
        raise HTTPException(status_code=404, detail='Lectura no encontrada')

    period = await db.billing_periods.find_one({'_id': reading['billing_period_id']})
    if not period:
        raise HTTPException(status_code=404, detail='Periodo no encontrado')
    if period.get('estado') == 'cerrado':
        raise HTTPException(status_code=400, detail='El periodo está cerrado. Debe reabrirse para editar lecturas.')

    enforce_tenant_scope(current_user, str(period['condominium_id']))

    photo_url = await save_image_upload(file, folder='meter-readings', prefix=f'reading_{reading_id}')
    await db.meter_readings.update_one(
        {'_id': reading_obj_id},
        {'$set': {'foto_medidor_url': photo_url, 'updated_at': datetime.now(timezone.utc)}},
    )

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='upload_photo',
        entity='meter_readings',
        entity_id=reading_id,
        detail={'foto_medidor_url': photo_url},
    )

    return {'message': 'Foto del medidor guardada', 'foto_medidor_url': photo_url}
