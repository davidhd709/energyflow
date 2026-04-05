from pathlib import Path
from tempfile import NamedTemporaryFile

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import enforce_tenant_scope, get_current_user, get_db, require_roles
from scripts.import_historical_excel import import_file

router = APIRouter()


@router.post('/historical-excel')
async def import_historical_excel(
    files: list[UploadFile] = File(...),
    dry_run: bool = Form(True),
    omit_common_zones: bool = Form(True),
    condominium_id: str | None = Form(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin', 'operador')),
) -> dict:
    if not files:
        raise HTTPException(status_code=400, detail='Debes adjuntar al menos un archivo Excel.')

    if current_user['rol'] == 'superadmin':
        if not condominium_id or not ObjectId.is_valid(condominium_id):
            raise HTTPException(status_code=400, detail='condominium_id inválido para superadmin')
        target_condo_id = condominium_id
    else:
        target_condo_id = enforce_tenant_scope(current_user)

    condo = await db.condominiums.find_one({'_id': ObjectId(target_condo_id)})
    if not condo:
        raise HTTPException(status_code=404, detail='Condominio no encontrado')

    temp_paths: list[Path] = []
    results: list[dict] = []
    errors: list[dict] = []

    try:
        for upload in files:
            if not upload.filename:
                continue

            suffix = Path(upload.filename).suffix.lower()
            if suffix not in {'.xlsx', '.xlsm', '.xltx', '.xltm'}:
                errors.append({'file': upload.filename, 'error': 'Formato no soportado. Usa .xlsx'})
                continue

            with NamedTemporaryFile(delete=False, suffix=suffix) as temp:
                payload = await upload.read()
                temp.write(payload)
                temp_path = Path(temp.name)
                temp_paths.append(temp_path)

            try:
                result = await import_file(
                    db=db,
                    condominium_id=ObjectId(target_condo_id),
                    excel_path=temp_path,
                    photos_base=None,
                    dry_run=dry_run,
                    omit_common_zones=omit_common_zones,
                )
                result['file'] = upload.filename
                results.append(result)
            except Exception as exc:  # pragma: no cover
                errors.append({'file': upload.filename, 'error': str(exc)})
    finally:
        for path in temp_paths:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass

    if not results and errors:
        raise HTTPException(status_code=400, detail={'message': 'No se pudo importar ningún archivo', 'errors': errors})

    return {
        'message': 'Validación completada' if dry_run else 'Importación completada',
        'dry_run': dry_run,
        'omit_common_zones': omit_common_zones,
        'condominium': {'_id': str(condo['_id']), 'nombre': condo.get('nombre', '')},
        'processed': len(results),
        'results': results,
        'errors': errors,
    }
