from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.security import decode_token


class AuthMiddleware(BaseHTTPMiddleware):
    PUBLIC_PATHS = {
        '/health',
        f'{settings.API_PREFIX}/auth/login',
        f'{settings.API_PREFIX}/users/bootstrap-superadmin',
    }

    async def dispatch(self, request: Request, call_next):
        if request.method == 'OPTIONS':
            return await call_next(request)

        path = request.url.path
        if path in self.PUBLIC_PATHS or not path.startswith(settings.API_PREFIX):
            return await call_next(request)

        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return JSONResponse(status_code=401, content={'detail': 'Token requerido'})

        token = auth_header.replace('Bearer ', '', 1).strip()
        try:
            payload = decode_token(token)
        except ValueError:
            return JSONResponse(status_code=401, content={'detail': 'Token inválido'})

        request.state.auth_payload = payload
        return await call_next(request)
