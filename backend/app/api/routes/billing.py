from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import get_db, get_current_user, require_roles
from app.schemas import HouseInvoiceSaldoUpdate
from app.services.audit_service import log_audit
from app.services.billing_service import calculate_billing, load_period_scoped
from app.services.pdf_service import save_invoice_pdf
from app.utils.download_names import energy_invoice_filename
from app.utils.object_id import serialize_doc, to_object_id

# Días corridos para la fecha límite de pago tras generar el PDF.
PAYMENT_DUE_DAYS = 6

router = APIRouter()
BASE_DIR = Path(__file__).resolve().parents[3]


async def _with_admin_support_email(db: AsyncIOMotorDatabase, condominium: dict) -> dict:
    condo_id = condominium.get('_id') or condominium.get('id') or condominium.get('condominium_id')
    if not condo_id:
        return condominium

    try:
        condo_obj_id = to_object_id(str(condo_id), 'condominium_id')
    except ValueError:
        return condominium

    admin_user = await db.users.find_one(
        {
            'rol': 'admin',
            'condominium_id': condo_obj_id,
            'activo': {'$ne': False},
        },
        sort=[('created_at', 1)],
    )
    if not admin_user or not admin_user.get('email'):
        return condominium

    enriched = {**condominium}
    enriched['email_contacto'] = admin_user['email']
    return enriched


def _build_invoice_doc(invoice: dict, house: dict, period: dict, reading: dict | None) -> dict:
    """Arma el dict que se pasa al template de PDF, con saldo anterior, total
    a pagar y fecha límite de pago ya calculados/persistidos en la DB."""
    invoice_doc = serialize_doc(invoice)
    house_doc = serialize_doc(house)

    invoice_doc['numero_factura'] = (
        f"{str(invoice.get('billing_period_id') or period.get('_id', ''))[-6:]}-{house_doc.get('numero_casa', '0')}"
    )
    invoice_doc['lectura_actual'] = (reading or {}).get('lectura_actual', 0)
    invoice_doc['lectura_anterior'] = (reading or {}).get('lectura_anterior', 0)
    invoice_doc['foto_medidor_url'] = (reading or {}).get('foto_medidor_url')
    invoice_doc['nombre_usuario'] = house_doc.get('nombre_usuario') or f"CASA {house_doc.get('numero_casa', '-')}"
    invoice_doc['direccion_factura'] = f"CASA {house_doc.get('numero_casa', '-')}"
    invoice_doc['fecha_lectura_actual'] = period.get('fecha_fin')
    invoice_doc['fecha_lectura_anterior'] = period.get('fecha_inicio')
    invoice_doc['dias_facturados'] = period.get('dias', 0)

    saldo_anterior = float(invoice.get('saldo_anterior') or 0)
    total = float(invoice.get('total') or 0)
    invoice_doc['saldo_anterior'] = saldo_anterior
    invoice_doc['total_a_pagar'] = round(total + saldo_anterior, 2)
    invoice_doc['fecha_limite_pago'] = invoice.get('fecha_limite_pago')

    return invoice_doc


@router.patch('/house-invoices/{house_invoice_id}/saldo-anterior')
async def update_house_invoice_saldo(
    house_invoice_id: str,
    payload: HouseInvoiceSaldoUpdate,
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

    # Reutilizamos el guard de tenant + período via load_period_scoped.
    await load_period_scoped(db, str(period['_id']), current_user)

    if period.get('estado') == 'cerrado':
        raise HTTPException(
            status_code=400,
            detail='El periodo está cerrado. Reábrelo para editar el saldo anterior.',
        )

    saldo = round(float(payload.saldo_anterior), 2)
    total = float(invoice.get('total') or 0)
    total_a_pagar = round(total + saldo, 2)

    await db.house_invoices.update_one(
        {'_id': invoice_obj_id},
        {
            '$set': {
                'saldo_anterior': saldo,
                'total_a_pagar': total_a_pagar,
                'updated_at': datetime.now(timezone.utc),
            }
        },
    )

    await log_audit(
        db,
        user_id=current_user['_id'],
        action='update_saldo_anterior',
        entity='house_invoices',
        entity_id=house_invoice_id,
        detail={'saldo_anterior': saldo, 'total_a_pagar': total_a_pagar},
    )

    updated = await db.house_invoices.find_one({'_id': invoice_obj_id})
    return serialize_doc(updated)


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

    period_doc = scoped['period']
    now = datetime.now(timezone.utc)
    fecha_limite_pago = now + timedelta(days=PAYMENT_DUE_DAYS)

    # Persiste fecha_limite_pago al momento de generar el PDF para que
    # subsiguientes descargas/regeneraciones muestren la misma fecha.
    saldo_anterior = round(float(invoice.get('saldo_anterior') or 0), 2)
    total = float(invoice.get('total') or 0)
    invoice['saldo_anterior'] = saldo_anterior
    invoice['total_a_pagar'] = round(total + saldo_anterior, 2)
    invoice['fecha_limite_pago'] = fecha_limite_pago

    invoice_doc = _build_invoice_doc(invoice, house, period_doc, reading)
    house_doc = serialize_doc(house)

    condo_for_pdf = await _with_admin_support_email(db, scoped['condominium'])
    pdf_url = save_invoice_pdf(invoice_doc, house_doc, period_doc, condo_for_pdf)

    await db.house_invoices.update_one(
        {'_id': invoice_obj_id},
        {
            '$set': {
                'pdf_url': pdf_url,
                'estado_entrega': 'generado',
                'fecha_limite_pago': fecha_limite_pago,
                'fecha_pdf_generado': now,
                'saldo_anterior': saldo_anterior,
                'total_a_pagar': invoice['total_a_pagar'],
                'updated_at': now,
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
    condo_for_pdf = await _with_admin_support_email(db, scoped['condominium'])

    invoices = await db.house_invoices.find({'billing_period_id': scoped['period_obj_id']}).to_list(length=None)
    if not invoices:
        raise HTTPException(status_code=404, detail='No hay facturas para este periodo')

    results: list[dict] = []
    now = datetime.now(timezone.utc)
    fecha_limite_pago = now + timedelta(days=PAYMENT_DUE_DAYS)

    for invoice in invoices:
        house = await db.houses.find_one({'_id': invoice['house_id']})
        if not house:
            continue

        reading = await db.meter_readings.find_one(
            {'billing_period_id': invoice['billing_period_id'], 'house_id': invoice['house_id']}
        )

        saldo_anterior = round(float(invoice.get('saldo_anterior') or 0), 2)
        total = float(invoice.get('total') or 0)
        invoice['saldo_anterior'] = saldo_anterior
        invoice['total_a_pagar'] = round(total + saldo_anterior, 2)
        invoice['fecha_limite_pago'] = fecha_limite_pago

        invoice_doc = _build_invoice_doc(invoice, house, scoped['period'], reading)
        house_doc = serialize_doc(house)

        pdf_url = save_invoice_pdf(invoice_doc, house_doc, scoped['period'], condo_for_pdf)

        await db.house_invoices.update_one(
            {'_id': invoice['_id']},
            {
                '$set': {
                    'pdf_url': pdf_url,
                    'estado_entrega': 'generado',
                    'fecha_limite_pago': fecha_limite_pago,
                    'fecha_pdf_generado': now,
                    'saldo_anterior': saldo_anterior,
                    'total_a_pagar': invoice['total_a_pagar'],
                    'updated_at': now,
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
        period_doc = scoped['period']
        now = datetime.now(timezone.utc)

        # Si la factura ya tenía fecha_limite_pago, la conservamos. Si no
        # (regeneración después de borrar PDF físico), seteamos una nueva.
        if not invoice.get('fecha_limite_pago'):
            invoice['fecha_limite_pago'] = now + timedelta(days=PAYMENT_DUE_DAYS)

        saldo_anterior = round(float(invoice.get('saldo_anterior') or 0), 2)
        total = float(invoice.get('total') or 0)
        invoice['saldo_anterior'] = saldo_anterior
        invoice['total_a_pagar'] = round(total + saldo_anterior, 2)

        invoice_doc = _build_invoice_doc(invoice, house, period_doc, reading)
        house_doc = serialize_doc(house)

        condo_for_pdf = await _with_admin_support_email(db, scoped['condominium'])
        pdf_url = save_invoice_pdf(invoice_doc, house_doc, period_doc, condo_for_pdf)
        await db.house_invoices.update_one(
            {'_id': invoice_obj_id},
            {
                '$set': {
                    'pdf_url': pdf_url,
                    'estado_entrega': 'generado',
                    'fecha_limite_pago': invoice['fecha_limite_pago'],
                    'fecha_pdf_generado': now,
                    'saldo_anterior': saldo_anterior,
                    'total_a_pagar': invoice['total_a_pagar'],
                    'updated_at': now,
                }
            },
        )
        file_path = BASE_DIR / str(pdf_url).lstrip('/')

    if not file_path.exists():
        raise HTTPException(status_code=404, detail='No se encontró el archivo PDF')

    download_name = energy_invoice_filename(house.get('numero_casa'), scoped['period'].get('fecha_fin'))
    return FileResponse(path=str(file_path), media_type='application/pdf', filename=download_name)
