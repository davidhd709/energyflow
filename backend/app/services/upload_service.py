from pathlib import Path
from secrets import token_hex

from fastapi import HTTPException, UploadFile

BASE_DIR = Path(__file__).resolve().parents[2]
UPLOADS_DIR = BASE_DIR / 'static' / 'uploads'
MAX_FILE_SIZE = 8 * 1024 * 1024
ALLOWED_MIME_TYPES = {'image/jpeg', 'image/png', 'image/webp'}
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}


def _extension_from_upload(file: UploadFile) -> str:
    ext = Path(file.filename or '').suffix.lower()
    if ext in ALLOWED_EXTENSIONS:
        return ext

    fallback_map = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
    }
    return fallback_map.get(file.content_type or '', '')


async def save_image_upload(file: UploadFile, folder: str, prefix: str) -> str:
    if (file.content_type or '').lower() not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail='Formato inválido. Usa JPG, PNG o WEBP.')

    ext = _extension_from_upload(file)
    if not ext:
        raise HTTPException(status_code=400, detail='No se pudo determinar la extensión del archivo.')

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail='Archivo vacío.')
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail='Archivo demasiado grande. Máximo 8MB.')

    target_dir = UPLOADS_DIR / folder
    target_dir.mkdir(parents=True, exist_ok=True)

    filename = f'{prefix}_{token_hex(8)}{ext}'
    filepath = target_dir / filename
    filepath.write_bytes(content)

    return f'/static/uploads/{folder}/{filename}'
