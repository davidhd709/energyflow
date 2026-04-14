from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import enforce_tenant_scope, get_db, get_current_user, require_roles
from app.schemas import HouseCreate, HouseUpdate
from app.services.audit_service import log_audit
from app.utils.object_id import serialize_doc, to_object_id

router = APIRouter()


@router.get('')
async def list_houses(
    condominium_id: str | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    tenant_condo_id = enforce_tenant_scope(current_user, condominium_id)
    condo_obj_id = to_object_id(tenant_condo_id, 'condominium_id')

    query: dict = {'condominium_id': condo_obj_id}
    if not include_inactive:
        query['activo'] = True

    houses = await db.houses.find(query).sort('numero_casa', 1).to_list(length=None)
    return serialize_doc(houses)


@router.post('')
async def create_house(
    payload: HouseCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin', 'operador')),
) -> dict:
    tenant_condo_id = enforce_tenant_scope(current_user, payload.condominium_id)
    condo_obj_id = to_object_id(tenant_condo_id, 'condominium_id')

    exists = await db.houses.find_one({'condominium_id': condo_obj_id, 'numero_casa': payload.numero_casa})
    if exists:
        raise HTTPException(status_code=409, detail='Ya existe una casa con ese número en el condominio')

    now = datetime.now(timezone.utc)
    doc = {
        'condominium_id': condo_obj_id,
        'nombre_usuario': payload.nombre_usuario or '',
        'numero_casa': payload.numero_casa,
        'ubicacion': payload.ubicacion,
        'serie_medidor': payload.serie_medidor,
        'serial_nuevo': payload.serial_nuevo or '',
        'tipo_medidor': payload.tipo_medidor or 'digital',
        'es_zona_comun': payload.es_zona_comun,
        'incluir_en_liquidacion': payload.incluir_en_liquidacion,
        'activo': payload.activo,
        'created_at': now,
        'updated_at': now,
    }

    res = await db.houses.insert_one(doc)
    created = await db.houses.find_one({'_id': res.inserted_id})
    created_doc = serialize_doc(created)

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='create',
        entity='houses',
        entity_id=created_doc['_id'],
        detail={
            'nombre_usuario': payload.nombre_usuario or '',
            'numero_casa': payload.numero_casa,
            'es_zona_comun': payload.es_zona_comun,
            'incluir_en_liquidacion': payload.incluir_en_liquidacion,
        },
    )

    return created_doc


@router.patch('/{house_id}')
async def update_house(
    house_id: str,
    payload: HouseUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin', 'operador')),
) -> dict:
    try:
        house_obj_id = to_object_id(house_id, 'house_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='house_id inválido') from exc

    current_doc = await db.houses.find_one({'_id': house_obj_id})
    if not current_doc:
        raise HTTPException(status_code=404, detail='Casa no encontrada')

    enforce_tenant_scope(current_user, str(current_doc['condominium_id']))

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail='No hay campos para actualizar')

    updates['updated_at'] = datetime.now(timezone.utc)
    await db.houses.update_one({'_id': house_obj_id}, {'$set': updates})

    updated = await db.houses.find_one({'_id': house_obj_id})
    updated_doc = serialize_doc(updated)

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='update',
        entity='houses',
        entity_id=house_id,
        detail=updates,
    )

    return updated_doc


@router.delete('/{house_id}')
async def delete_house(
    house_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin', 'operador')),
) -> dict:
    try:
        house_obj_id = to_object_id(house_id, 'house_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='house_id inválido') from exc

    current_doc = await db.houses.find_one({'_id': house_obj_id})
    if not current_doc:
        raise HTTPException(status_code=404, detail='Casa no encontrada')

    enforce_tenant_scope(current_user, str(current_doc['condominium_id']))

    await db.houses.update_one(
        {'_id': house_obj_id},
        {
            '$set': {
                'activo': False,
                'updated_at': datetime.now(timezone.utc),
            }
        },
    )

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='delete',
        entity='houses',
        entity_id=house_id,
        detail={'soft_delete': True},
    )

    return {'message': 'Casa desactivada correctamente'}
