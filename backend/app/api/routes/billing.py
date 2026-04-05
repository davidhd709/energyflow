from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import get_db, get_current_user, require_roles
from app.services.audit_service import log_audit
from app.services.billing_service import calculate_billing, load_period_scoped
from app.services.pdf_service import save_invoice_pdf
from app.utils.download_names import energy_invoice_filename
from app.utils.object_id import serialize_doc, to_object_id

router = APIRouter()
BASE_DIR = Path(__file__).resolve().parents[3]


@router.post('/{billing_period_id}/calculate')
async def run_calculation(
    billing_period_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin', 'operador')),
) -> dict:
    result = await calculate_billing(db, billing_period_id, current_user)

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='calculate',
        entity='billing_periods',
        entity_id=billing_period_id,
        detail=result,
    )
    return result


@router.get('/{billing_period_id}/house-invoices')
async def list_house_invoices(
    billing_period_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    scoped = await load_period_scoped(db, billing_period_id, current_user)
    invoices = await db.house_invoices.find({'billing_period_id': scoped['period_obj_id']}).to_list(length=None)
    return serialize_doc(invoices)


@router.post('/house-invoices/{house_invoice_id}/generate-pdf')
async def generate_house_invoice_pdf(
    house_invoice_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin', 'operador')),
) -> dict:
    try:
        invoice_obj_id = to_object_id(house_invoice_id, 'house_invoice_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='house_invoice_id inválido') from exc

    invoice = await db.house_invoices.find_one({'_id': invoice_obj_id})
    if not invoice:
        raise HTTPException(status_code=404, detail='Factura por casa no encontrada')

    period = await db.billing_periods.find_one({'_id': invoice['billing_period_id']})
    if not period:
        raise HTTPException(status_code=404, detail='Periodo no encontrado')

    scoped = await load_period_scoped(db, str(period['_id']), current_user)

    house = await db.houses.find_one({'_id': invoice['house_id']})
    if not house:
        raise HTTPException(status_code=404, detail='Casa no encontrada')

    reading = await db.meter_readings.find_one(
        {'billing_period_id': invoice['billing_period_id'], 'house_id': invoice['house_id']}
    )

    invoice_doc = serialize_doc(invoice)
    house_doc = serialize_doc(house)
    period_doc = scoped['period']

    invoice_doc['numero_factura'] = f"{str(period['_id'])[-6:]}-{house_doc.get('numero_casa', '0')}"
    invoice_doc['lectura_actual'] = (reading or {}).get('lectura_actual', 0)
    invoice_doc['lectura_anterior'] = (reading or {}).get('lectura_anterior', 0)
    invoice_doc['foto_medidor_url'] = (reading or {}).get('foto_medidor_url')
    invoice_doc['nombre_usuario'] = house_doc.get('nombre_usuario') or f"CASA {house_doc.get('numero_casa', '-')}"
    invoice_doc['direccion_factura'] = f"CASA {house_doc.get('numero_casa', '-')}"
    invoice_doc['fecha_lectura_actual'] = period_doc.get('fecha_fin')
    invoice_doc['fecha_lectura_anterior'] = period_doc.get('fecha_inicio')
    invoice_doc['dias_facturados'] = period_doc.get('dias', 0)

    pdf_url = save_invoice_pdf(invoice_doc, house_doc, period_doc, scoped['condominium'])

    await db.house_invoices.update_one(
        {'_id': invoice_obj_id},
        {
            '$set': {
                'pdf_url': pdf_url,
                'estado_entrega': 'generado',
                'updated_at': datetime.now(timezone.utc),
            }
        },
    )

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='generate_pdf',
        entity='house_invoices',
        entity_id=house_invoice_id,
    )

    return {'message': 'PDF generado', 'pdf_url': pdf_url}


@router.post('/{billing_period_id}/generate-all-pdfs')
async def generate_all_pdfs(
    billing_period_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin', 'operador')),
) -> dict:
    scoped = await load_period_scoped(db, billing_period_id, current_user)

    invoices = await db.house_invoices.find({'billing_period_id': scoped['period_obj_id']}).to_list(length=None)
    if not invoices:
        raise HTTPException(status_code=404, detail='No hay facturas para este periodo')

    results: list[dict] = []
    for invoice in invoices:
        house = await db.houses.find_one({'_id': invoice['house_id']})
        if not house:
            continue

        reading = await db.meter_readings.find_one(
            {'billing_period_id': invoice['billing_period_id'], 'house_id': invoice['house_id']}
        )

        invoice_doc = serialize_doc(invoice)
        house_doc = serialize_doc(house)
        invoice_doc['numero_factura'] = f"{str(invoice['billing_period_id'])[-6:]}-{house_doc.get('numero_casa', '0')}"
        invoice_doc['lectura_actual'] = (reading or {}).get('lectura_actual', 0)
        invoice_doc['lectura_anterior'] = (reading or {}).get('lectura_anterior', 0)
        invoice_doc['foto_medidor_url'] = (reading or {}).get('foto_medidor_url')
        invoice_doc['nombre_usuario'] = house_doc.get('nombre_usuario') or f"CASA {house_doc.get('numero_casa', '-')}"
        invoice_doc['direccion_factura'] = f"CASA {house_doc.get('numero_casa', '-')}"
        invoice_doc['fecha_lectura_actual'] = scoped['period'].get('fecha_fin')
        invoice_doc['fecha_lectura_anterior'] = scoped['period'].get('fecha_inicio')
        invoice_doc['dias_facturados'] = scoped['period'].get('dias', 0)

        pdf_url = save_invoice_pdf(invoice_doc, house_doc, scoped['period'], scoped['condominium'])

        await db.house_invoices.update_one(
            {'_id': invoice['_id']},
            {
                '$set': {
                    'pdf_url': pdf_url,
                    'estado_entrega': 'generado',
                    'updated_at': datetime.now(timezone.utc),
                }
            },
        )

        results.append({'house_invoice_id': str(invoice['_id']), 'pdf_url': pdf_url})

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='generate_all_pdfs',
        entity='billing_periods',
        entity_id=billing_period_id,
        detail={'count': len(results)},
    )

    return {'message': 'PDFs generados', 'results': results}


@router.get('/house-invoices/{house_invoice_id}/download')
async def download_house_invoice_pdf(
    house_invoice_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> FileResponse:
    try:
        invoice_obj_id = to_object_id(house_invoice_id, 'house_invoice_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='house_invoice_id inválido') from exc

    invoice = await db.house_invoices.find_one({'_id': invoice_obj_id})
    if not invoice:
        raise HTTPException(status_code=404, detail='Factura por casa no encontrada')

    period = await db.billing_periods.find_one({'_id': invoice['billing_period_id']})
    if not period:
        raise HTTPException(status_code=404, detail='Periodo no encontrado')

    scoped = await load_period_scoped(db, str(period['_id']), current_user)
    house = await db.houses.find_one({'_id': invoice['house_id']})
    if not house:
        raise HTTPException(status_code=404, detail='Casa no encontrada')

    pdf_url = invoice.get('pdf_url')
    file_path: Path | None = None
    if pdf_url:
        file_path = BASE_DIR / str(pdf_url).lstrip('/')
        if not file_path.exists():
            file_path = None

    if file_path is None:
        reading = await db.meter_readings.find_one(
            {'billing_period_id': invoice['billing_period_id'], 'house_id': invoice['house_id']}
        )
        invoice_doc = serialize_doc(invoice)
        house_doc = serialize_doc(house)
        period_doc = scoped['period']

        invoice_doc['numero_factura'] = f"{str(period['_id'])[-6:]}-{house_doc.get('numero_casa', '0')}"
        invoice_doc['lectura_actual'] = (reading or {}).get('lectura_actual', 0)
        invoice_doc['lectura_anterior'] = (reading or {}).get('lectura_anterior', 0)
        invoice_doc['foto_medidor_url'] = (reading or {}).get('foto_medidor_url')
        invoice_doc['nombre_usuario'] = house_doc.get('nombre_usuario') or f"CASA {house_doc.get('numero_casa', '-')}"
        invoice_doc['direccion_factura'] = f"CASA {house_doc.get('numero_casa', '-')}"
        invoice_doc['fecha_lectura_actual'] = period_doc.get('fecha_fin')
        invoice_doc['fecha_lectura_anterior'] = period_doc.get('fecha_inicio')
        invoice_doc['dias_facturados'] = period_doc.get('dias', 0)

        pdf_url = save_invoice_pdf(invoice_doc, house_doc, period_doc, scoped['condominium'])
        await db.house_invoices.update_one(
            {'_id': invoice_obj_id},
            {
                '$set': {
                    'pdf_url': pdf_url,
                    'estado_entrega': 'generado',
                    'updated_at': datetime.now(timezone.utc),
                }
            },
        )
        file_path = BASE_DIR / str(pdf_url).lstrip('/')

    if not file_path.exists():
        raise HTTPException(status_code=404, detail='No se encontró el archivo PDF')

    download_name = energy_invoice_filename(house.get('numero_casa'), scoped['period'].get('fecha_fin'))
    return FileResponse(path=str(file_path), media_type='application/pdf', filename=download_name)
