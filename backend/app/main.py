from contextlib import asynccontextmanager
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.auth_middleware import AuthMiddleware
from app.core.config import settings
from app.db.mongo import mongo

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await mongo.connect(strict=False)

    db = mongo.db
    if db is not None:
        await db.users.create_index('email', unique=True)
        await db.houses.create_index([('condominium_id', 1), ('numero_casa', 1)], unique=True)
        await db.meter_readings.create_index([('billing_period_id', 1), ('house_id', 1)], unique=True)
        await db.supplier_invoices.create_index('billing_period_id', unique=True)
    else:
        logger.warning('MongoDB no disponible al iniciar: %s', mongo.last_error or 'sin detalle')

    yield

    await mongo.disconnect()


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)
app.add_middleware(AuthMiddleware)

BASE_DIR = Path(__file__).resolve().parents[1]
app.mount('/static', StaticFiles(directory=str(BASE_DIR / 'static')), name='static')
app.include_router(api_router, prefix=settings.API_PREFIX)


@app.get('/health')
async def health() -> dict:
    if mongo.client is None:
        return {'status': 'degraded', 'db': 'disconnected'}

    try:
        await mongo.client.admin.command('ping')
        return {'status': 'ok', 'db': 'ok'}
    except Exception:
        return {'status': 'degraded', 'db': 'error'}
