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
    # 1) Prioridad: tomar la `lectura_actual` del periodo cronológicamente
    #    inmediatamente anterior. Usamos `fecha_inicio < periodo.fecha_inicio`
    #    para no depender de que `fecha_fin` sea estrictamente menor que
    #    `fecha_inicio` del actual (periodos contiguos comparten la fecha
    #    pivote y antes quedaban fuera con $lt sobre fecha_fin).
    previous_period = await db.billing_periods.find_one(
        {
            'condominium_id': period['condominium_id'],
            'fecha_inicio': {'$lt': period['fecha_inicio']},
        },
        sort=[('fecha_inicio', -1)],
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

    # 2) Si no hay periodo anterior con lectura, respetar la `lectura_anterior`
    #    ya guardada en el periodo actual (caso de re-edición del mismo periodo).
    existing_current = await db.meter_readings.find_one(
        {'billing_period_id': period_obj_id, 'house_id': house_obj_id}
    )
    if existing_current and existing_current.get('lectura_anterior') is not None:
        return float(existing_current['lectura_anterior']), 'actual'

    # 3) Fallback histórico: última lectura registrada para la casa (cronológica,
    #    no por updated_at, para evitar ediciones recientes sobre periodos viejos).
    latest_reading = await db.meter_readings.find_one(
        {'house_id': house_obj_id},
        sort=[('created_at', -1)],
    )
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


@router.post('/resync-previous')
async def resync_previous_readings(
    billing_period_id: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin', 'operador')),
) -> dict:
    """Recalcula `lectura_anterior` y `consumo` de TODAS las lecturas del periodo
    indicado, tomando la `lectura_actual` del periodo cronológicamente anterior.

    Útil cuando se importaron datos con la columna `lectura_anterior` desfasada
    o cuando un periodo nuevo arrastra valores antiguos. No toca la
    `lectura_actual` capturada por el operador.
    """
    try:
        period_obj_id = to_object_id(billing_period_id, 'billing_period_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='billing_period_id inválido') from exc

    period = await db.billing_periods.find_one({'_id': period_obj_id})
    if not period:
        raise HTTPException(status_code=404, detail='Periodo no encontrado')
    if period.get('estado') == 'cerrado':
        raise HTTPException(status_code=400, detail='El periodo está cerrado. Reábrelo para resincronizar.')

    enforce_tenant_scope(current_user, str(period['condominium_id']))

    readings = await db.meter_readings.find({'billing_period_id': period_obj_id}).to_list(length=None)
    if not readings:
        return {'updated': 0, 'skipped': 0, 'errors': []}

    now = datetime.now(timezone.utc)
    updated_count = 0
    skipped_count = 0
    errors: list[dict] = []

    for reading in readings:
        try:
            new_anterior, source = await _resolve_previous_reading(
                db,
                period=period,
                period_obj_id=period_obj_id,
                house_obj_id=reading['house_id'],
            )
        except Exception as exc:  # noqa: BLE001
            errors.append({'house_id': str(reading['house_id']), 'error': str(exc)})
            continue

        # Si la fuente quedó como 'actual' (sin periodo anterior real), no
        # tiene sentido reescribir el mismo valor — lo saltamos para no
        # disparar audit innecesario.
        if source == 'actual':
            skipped_count += 1
            continue

        lectura_actual = float(reading.get('lectura_actual') or 0)
        if lectura_actual < new_anterior:
            errors.append({
                'house_id': str(reading['house_id']),
                'error': f'lectura_actual ({lectura_actual}) < lectura_anterior recalculada ({new_anterior})',
            })
            continue

        new_consumo = lectura_actual - new_anterior
        await db.meter_readings.update_one(
            {'_id': reading['_id']},
            {
                '$set': {
                    'lectura_anterior': new_anterior,
                    'consumo': new_consumo,
                    'updated_at': now,
                }
            },
        )
        updated_count += 1

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='resync_previous',
        entity='meter_readings',
        entity_id=billing_period_id,
        detail={
            'billing_period_id': billing_period_id,
            'updated': updated_count,
            'skipped': skipped_count,
            'errors_count': len(errors),
        },
    )

    return {'updated': updated_count, 'skipped': skipped_count, 'errors': errors}


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
