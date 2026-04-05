from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import get_db, get_current_user, invalidate_user_cache, require_roles
from app.core.security import hash_password
from app.schemas import UserCreate, UserUpdate
from app.services.audit_service import log_audit
from app.utils.object_id import serialize_doc, to_object_id

router = APIRouter()


@router.get('')
async def list_users(
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: dict = Depends(require_roles('superadmin')),
) -> list[dict]:
    users = await db.users.find().sort('created_at', -1).to_list(length=None)
    docs: list[dict] = []
    for user in users:
        item = serialize_doc(user)
        item.pop('password_hash', None)
        docs.append(item)
    return docs


@router.post('')
async def create_user(
    payload: UserCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin')),
) -> dict:
    email = payload.email.lower().strip()
    existing = await db.users.find_one({'email': email})
    if existing:
        raise HTTPException(status_code=409, detail='El email ya está registrado')

    condominium_obj_id = None
    condominium_id_str = None
    if payload.rol != 'superadmin':
        if not payload.condominium_id:
            raise HTTPException(status_code=400, detail='condominium_id es obligatorio para admin/operador')
        try:
            condominium_obj_id = to_object_id(payload.condominium_id, 'condominium_id')
        except ValueError as exc:
            raise HTTPException(status_code=400, detail='condominium_id inválido') from exc

        condominium = await db.condominiums.find_one({'_id': condominium_obj_id})
        if not condominium:
            raise HTTPException(status_code=404, detail='Condominio no encontrado')
        condominium_id_str = str(condominium_obj_id)

    now = datetime.now(timezone.utc)
    user_doc = {
        'nombre': payload.nombre,
        'email': email,
        'password_hash': hash_password(payload.password),
        'rol': payload.rol,
        'condominium_id': condominium_obj_id,
        'activo': True,
        'created_at': now,
        'updated_at': now,
    }

    result = await db.users.insert_one(user_doc)
    created = await db.users.find_one({'_id': result.inserted_id})
    created_doc = serialize_doc(created)
    created_doc.pop('password_hash', None)

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='create',
        entity='users',
        entity_id=created_doc['_id'],
        detail={
            'role': payload.rol,
            'condominium_id': condominium_id_str,
        },
    )

    invalidate_user_cache(created_doc['_id'])
    return created_doc


@router.patch('/{user_id}')
async def update_user(
    user_id: str,
    payload: UserUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin')),
) -> dict:
    try:
        user_obj_id = to_object_id(user_id, 'user_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='user_id inválido') from exc

    existing = await db.users.find_one({'_id': user_obj_id})
    if not existing:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')

    raw_updates = payload.model_dump(exclude_unset=True)
    if not raw_updates:
        raise HTTPException(status_code=400, detail='No hay cambios para actualizar')

    updates: dict = {}

    if 'email' in raw_updates and raw_updates['email'] is not None:
        email = str(raw_updates['email']).lower().strip()
        email_owner = await db.users.find_one({'email': email, '_id': {'$ne': user_obj_id}}, {'_id': 1})
        if email_owner:
            raise HTTPException(status_code=409, detail='El email ya está registrado')
        updates['email'] = email

    if 'nombre' in raw_updates and raw_updates['nombre'] is not None:
        updates['nombre'] = raw_updates['nombre']

    if raw_updates.get('password'):
        updates['password_hash'] = hash_password(raw_updates['password'])

    target_role = raw_updates.get('rol', existing.get('rol'))
    target_condo_id = raw_updates.get('condominium_id', None if target_role == 'superadmin' else existing.get('condominium_id'))

    if target_role != 'superadmin':
        if not target_condo_id:
            raise HTTPException(status_code=400, detail='condominium_id es obligatorio para admin/operador')
        try:
            condo_obj_id = to_object_id(target_condo_id, 'condominium_id')
        except ValueError as exc:
            raise HTTPException(status_code=400, detail='condominium_id inválido') from exc
        condominium = await db.condominiums.find_one({'_id': condo_obj_id}, {'_id': 1})
        if not condominium:
            raise HTTPException(status_code=404, detail='Condominio no encontrado')
        updates['condominium_id'] = condo_obj_id
    else:
        updates['condominium_id'] = None

    if 'rol' in raw_updates and raw_updates['rol'] is not None:
        updates['rol'] = raw_updates['rol']

    if 'activo' in raw_updates and raw_updates['activo'] is not None:
        if str(existing['_id']) == current_user['_id'] and raw_updates['activo'] is False:
            raise HTTPException(status_code=400, detail='No puedes desactivar tu propio usuario')
        updates['activo'] = raw_updates['activo']

    updates['updated_at'] = datetime.now(timezone.utc)

    await db.users.update_one({'_id': user_obj_id}, {'$set': updates})
    updated = await db.users.find_one({'_id': user_obj_id})
    updated_doc = serialize_doc(updated)
    updated_doc.pop('password_hash', None)

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='update',
        entity='users',
        entity_id=user_id,
        detail={k: v for k, v in updates.items() if k != 'password_hash'},
    )

    invalidate_user_cache(user_id)
    invalidate_user_cache(current_user['_id'])
    return updated_doc


@router.post('/bootstrap-superadmin')
async def bootstrap_superadmin(payload: UserCreate, db: AsyncIOMotorDatabase = Depends(get_db)) -> dict:
    users_count = await db.users.count_documents({})
    if users_count > 0:
        raise HTTPException(status_code=403, detail='Bootstrap solo permitido cuando no hay usuarios')
    if payload.rol != 'superadmin':
        raise HTTPException(status_code=400, detail='El bootstrap debe crear un superadmin')

    now = datetime.now(timezone.utc)
    doc = {
        'nombre': payload.nombre,
        'email': payload.email.lower().strip(),
        'password_hash': hash_password(payload.password),
        'rol': 'superadmin',
        'condominium_id': None,
        'activo': True,
        'created_at': now,
        'updated_at': now,
    }
    res = await db.users.insert_one(doc)
    created = await db.users.find_one({'_id': res.inserted_id})
    out = serialize_doc(created)
    out.pop('password_hash', None)
    return out


@router.get('/me')
async def current_user_profile(current_user: dict = Depends(get_current_user)) -> dict:
    profile = current_user.copy()
    profile.pop('password_hash', None)
    return profile
