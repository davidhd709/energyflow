from time import monotonic
from typing import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.security import decode_token
from app.db.mongo import mongo
from app.utils.object_id import serialize_doc, to_object_id

oauth2_scheme = OAuth2PasswordBearer(tokenUrl='/api/v1/auth/login')
USER_CACHE_TTL_SECONDS = 120.0
USER_CACHE: dict[str, tuple[float, dict]] = {}


async def get_db() -> AsyncIOMotorDatabase:
    if mongo.db is None:
        raise HTTPException(status_code=500, detail='Database not initialized')
    return mongo.db


async def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    payload = getattr(request.state, 'auth_payload', None)
    if payload is None:
        try:
            payload = decode_token(token)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Token inválido') from exc

    user_id = payload.get('sub')
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Token sin subject')

    now = monotonic()
    cached = USER_CACHE.get(user_id)
    if cached and cached[0] > now:
        return cached[1]

    try:
        user = await db.users.find_one(
            {'_id': to_object_id(user_id, 'user_id')},
            {
                'nombre': 1,
                'email': 1,
                'rol': 1,
                'condominium_id': 1,
                'activo': 1,
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Token inválido') from exc

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Usuario no encontrado')
    if not user.get('activo', True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Usuario inactivo')

    user_doc = serialize_doc(user)
    USER_CACHE[user_id] = (now + USER_CACHE_TTL_SECONDS, user_doc)
    return user_doc


def invalidate_user_cache(user_id: str | None = None) -> None:
    if user_id:
        USER_CACHE.pop(user_id, None)
        return
    USER_CACHE.clear()


def require_roles(*roles: str) -> Callable:
    async def role_guard(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user.get('rol') not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='No autorizado')
        return current_user

    return role_guard


def enforce_tenant_scope(current_user: dict, condominium_id: str | None = None) -> str:
    user_role = current_user['rol']
    user_condo = current_user.get('condominium_id')

    if user_role == 'superadmin':
        if not condominium_id:
            raise HTTPException(status_code=400, detail='condominium_id es requerido para superadmin en esta acción')
        return condominium_id

    if not user_condo:
        raise HTTPException(status_code=403, detail='Usuario sin condominio asignado')

    if condominium_id and condominium_id != user_condo:
        raise HTTPException(status_code=403, detail='Acceso denegado al condominio solicitado')

    return user_condo
