from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import enforce_tenant_scope, get_current_user, get_db, require_roles
from app.schemas import CondominiumCreate, CondominiumUpdate
from app.services.audit_service import log_audit
from app.services.upload_service import save_image_upload
from app.utils.object_id import serialize_doc, to_object_id

router = APIRouter()


@router.get('')
async def list_condominiums(
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: dict = Depends(require_roles('superadmin')),
) -> list[dict]:
    docs = await db.condominiums.find().sort('nombre', 1).to_list(length=None)
    return serialize_doc(docs)


@router.post('')
async def create_condominium(
    payload: CondominiumCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin')),
) -> dict:
    now = datetime.now(timezone.utc)
    doc = {
        'nombre': payload.nombre,
        'direccion': payload.direccion,
        'porcentaje_alumbrado': payload.porcentaje_alumbrado,
        'cuenta_bancaria': payload.cuenta_bancaria,
        'email_contacto': payload.email_contacto,
        'logo_url': payload.logo_url,
        'created_at': now,
        'updated_at': now,
    }
    res = await db.condominiums.insert_one(doc)
    created = await db.condominiums.find_one({'_id': res.inserted_id})
    created_doc = serialize_doc(created)

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='create',
        entity='condominiums',
        entity_id=created_doc['_id'],
        detail={'nombre': payload.nombre},
    )

    return created_doc


@router.patch('/{condominium_id}')
async def update_condominium(
    condominium_id: str,
    payload: CondominiumUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin')),
) -> dict:
    try:
        condo_obj_id = to_object_id(condominium_id, 'condominium_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='condominium_id inválido') from exc

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail='No hay campos para actualizar')

    updates['updated_at'] = datetime.now(timezone.utc)
    result = await db.condominiums.update_one({'_id': condo_obj_id}, {'$set': updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Condominio no encontrado')

    updated = await db.condominiums.find_one({'_id': condo_obj_id})
    updated_doc = serialize_doc(updated)

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='update',
        entity='condominiums',
        entity_id=condominium_id,
        detail=updates,
    )

    return updated_doc


@router.delete('/{condominium_id}')
async def delete_condominium(
    condominium_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin')),
) -> dict:
    try:
        condo_obj_id = to_object_id(condominium_id, 'condominium_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='condominium_id inválido') from exc

    result = await db.condominiums.delete_one({'_id': condo_obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Condominio no encontrado')

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='delete',
        entity='condominiums',
        entity_id=condominium_id,
    )

    return {'message': 'Condominio eliminado'}


@router.post('/{condominium_id}/logo')
async def upload_condominium_logo(
    condominium_id: str,
    file: UploadFile = File(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin')),
) -> dict:
    try:
        condo_obj_id = to_object_id(condominium_id, 'condominium_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='condominium_id inválido') from exc

    condo = await db.condominiums.find_one({'_id': condo_obj_id})
    if not condo:
        raise HTTPException(status_code=404, detail='Condominio no encontrado')

    logo_url = await save_image_upload(file, folder='logos', prefix=f'condo_{condominium_id}')

    await db.condominiums.update_one(
        {'_id': condo_obj_id},
        {'$set': {'logo_url': logo_url, 'updated_at': datetime.now(timezone.utc)}},
    )

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='upload_logo',
        entity='condominiums',
        entity_id=condominium_id,
        detail={'logo_url': logo_url},
    )

    return {'message': 'Logo actualizado', 'logo_url': logo_url}


@router.get('/me')
async def get_my_condominium(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    condo_id = enforce_tenant_scope(current_user, current_user.get('condominium_id'))

    try:
        condo_obj_id = to_object_id(condo_id, 'condominium_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='condominium_id inválido') from exc

    condominium = await db.condominiums.find_one({'_id': condo_obj_id})
    if not condominium:
        raise HTTPException(status_code=404, detail='Condominio no encontrado')

    return serialize_doc(condominium)
