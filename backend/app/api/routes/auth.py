from fastapi import APIRouter, Depends, HTTPException, Response
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.deps import get_current_user, get_db
from app.core.security import create_access_token, verify_password
from app.schemas import LoginRequest, TokenResponse
from app.utils.object_id import serialize_doc

router = APIRouter()


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.AUTH_COOKIE_NAME,
        value=token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        domain=settings.AUTH_COOKIE_DOMAIN,
        path='/',
    )


def _clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.AUTH_COOKIE_NAME,
        domain=settings.AUTH_COOKIE_DOMAIN,
        path='/',
    )


@router.post('/login', response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> TokenResponse:
    user = await db.users.find_one(
        {'email': payload.email.lower().strip()},
        {
            'nombre': 1,
            'email': 1,
            'rol': 1,
            'condominium_id': 1,
            'activo': 1,
            'password_hash': 1,
        },
    )
    if not user or not verify_password(payload.password, user.get('password_hash', '')):
        raise HTTPException(status_code=401, detail='Credenciales inválidas')

    if not user.get('activo', True):
        raise HTTPException(status_code=403, detail='Usuario inactivo')

    user_doc = serialize_doc(user)
    token = create_access_token(user_doc['_id'], user_doc['rol'], user_doc.get('condominium_id'))

    safe_user = {
        '_id': user_doc['_id'],
        'nombre': user_doc['nombre'],
        'email': user_doc['email'],
        'rol': user_doc['rol'],
        'condominium_id': user_doc.get('condominium_id'),
    }

    _set_auth_cookie(response, token)
    return TokenResponse(access_token=token, user=safe_user)


@router.post('/logout', status_code=204)
async def logout(response: Response) -> Response:
    _clear_auth_cookie(response)
    response.status_code = 204
    return response


@router.get('/me')
async def me(current_user: dict = Depends(get_current_user)) -> dict:
    return {
        '_id': current_user['_id'],
        'nombre': current_user['nombre'],
        'email': current_user['email'],
        'rol': current_user['rol'],
        'condominium_id': current_user.get('condominium_id'),
    }
