from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.security import decode_token


class AuthMiddleware(BaseHTTPMiddleware):
    PUBLIC_PATHS = {
        '/health',
        f'{settings.API_PREFIX}/health',
        f'{settings.API_PREFIX}/auth/login',
        f'{settings.API_PREFIX}/auth/logout',
        f'{settings.API_PREFIX}/users/bootstrap-superadmin',
    }

    async def dispatch(self, request: Request, call_next):
        if request.method == 'OPTIONS':
            return await call_next(request)

        path = request.url.path
        if path in self.PUBLIC_PATHS or not path.startswith(settings.API_PREFIX):
            return await call_next(request)

        token = self._extract_token(request)
        if not token:
            return JSONResponse(status_code=401, content={'detail': 'Token requerido'})

        try:
            payload = decode_token(token)
        except ValueError:
            return JSONResponse(status_code=401, content={'detail': 'Token inválido'})

        request.state.auth_payload = payload
        return await call_next(request)

    @staticmethod
    def _extract_token(request: Request) -> str | None:
        # Prioridad: cookie HttpOnly. Fallback: header Authorization (compat con clientes que aún manden Bearer).
        cookie_token = request.cookies.get(settings.AUTH_COOKIE_NAME)
        if cookie_token:
            return cookie_token.strip()

        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            return auth_header.replace('Bearer ', '', 1).strip()

        return None
