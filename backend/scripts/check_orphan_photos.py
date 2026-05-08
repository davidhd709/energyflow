"""Detecta fotos de medidores huérfanas: registros con foto_medidor_url
en DB pero cuyo archivo no existe en disco.

Uso desde backend/:
    # Solo reporta, no modifica nada:
    python -m scripts.check_orphan_photos

    # Limpia: pone foto_medidor_url = null en cada huérfano detectado:
    python -m scripts.check_orphan_photos --clean
"""

import argparse
import asyncio
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _resolve_static_path(static_url: str) -> Path | None:
    if not static_url:
        return None
    raw = static_url.split('?', 1)[0].strip()
    if raw.startswith(('http://', 'https://')):
        from urllib.parse import urlparse
        raw = urlparse(raw).path or ''
    rel = raw.lstrip('/')
    candidates = []
    if rel.startswith('static/'):
        candidates.append(BACKEND_DIR / rel)
    else:
        candidates.append(BACKEND_DIR / 'static' / rel)
        candidates.append(BACKEND_DIR / rel)
    for path in candidates:
        try:
            if path.exists() and path.is_file():
                return path
        except OSError:
            continue
    return None


async def run(clean: bool = False) -> None:
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DB_NAME]

    cursor = db.meter_readings.find(
        {'foto_medidor_url': {'$nin': [None, '']}},
        {'foto_medidor_url': 1, 'house_id': 1, 'billing_period_id': 1}
    )

    total = 0
    orphans: list[tuple[str, str]] = []
    async for doc in cursor:
        total += 1
        url = doc.get('foto_medidor_url') or ''
        local = _resolve_static_path(url)
        if local is None:
            orphans.append((str(doc['_id']), url))

    print(f'Lecturas con foto_medidor_url: {total}')
    print(f'Huérfanas (archivo no encontrado): {len(orphans)}')
    for reading_id, url in orphans:
        print(f'  - reading {reading_id}  ->  {url}')

    if clean and orphans:
        ids = [oid for oid, _ in orphans]
        from bson import ObjectId
        result = await db.meter_readings.update_many(
            {'_id': {'$in': [ObjectId(x) for x in ids]}},
            {'$set': {'foto_medidor_url': None}},
        )
        print(f'\nLimpieza: foto_medidor_url puesto en null en {result.modified_count} documentos.')

    client.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Detecta fotos de medidores huérfanas.')
    parser.add_argument('--clean', action='store_true', help='Limpia foto_medidor_url de los huérfanos detectados.')
    args = parser.parse_args()
    asyncio.run(run(clean=args.clean))
