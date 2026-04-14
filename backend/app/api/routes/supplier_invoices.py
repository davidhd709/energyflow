from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import enforce_tenant_scope, get_db, get_current_user, require_roles
from app.schemas import SupplierInvoiceUpsert
from app.services.audit_service import log_audit
from app.utils.object_id import serialize_doc, to_object_id

router = APIRouter()


@router.get('')
async def get_supplier_invoice(
    billing_period_id: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    try:
        period_obj_id = to_object_id(billing_period_id, 'billing_period_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='billing_period_id inválido') from exc

    period = await db.billing_periods.find_one({'_id': period_obj_id})
    if not period:
        raise HTTPException(status_code=404, detail='Periodo no encontrado')

    enforce_tenant_scope(current_user, str(period['condominium_id']))

    invoice = await db.supplier_invoices.find_one({'billing_period_id': period_obj_id})
    if not invoice:
        raise HTTPException(status_code=404, detail='Factura global no encontrada')

    return serialize_doc(invoice)


@router.put('')
async def upsert_supplier_invoice(
    payload: SupplierInvoiceUpsert,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles('superadmin', 'operador')),
) -> dict:
    try:
        period_obj_id = to_object_id(payload.billing_period_id, 'billing_period_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='billing_period_id inválido') from exc

    period = await db.billing_periods.find_one({'_id': period_obj_id})
    if not period:
        raise HTTPException(status_code=404, detail='Periodo no encontrado')
    if period.get('estado') == 'cerrado':
        raise HTTPException(status_code=400, detail='El periodo está cerrado. Debe reabrirse para editar la factura global.')

    enforce_tenant_scope(current_user, str(period['condominium_id']))

    tarifa_kwh = payload.valor_consumo_total / payload.consumo_total_kwh if payload.consumo_total_kwh > 0 else 0.0
    now = datetime.now(timezone.utc)

    doc = {
        'billing_period_id': period_obj_id,
        'consumo_total_kwh': payload.consumo_total_kwh,
        'valor_consumo_total': payload.valor_consumo_total,
        'tarifa_kwh': round(tarifa_kwh, 2),
        'valor_alumbrado_total': payload.valor_alumbrado_total,
        'valor_aseo': payload.valor_aseo,
        'total_factura': payload.total_factura,
        'updated_at': now,
    }

    existing = await db.supplier_invoices.find_one({'billing_period_id': period_obj_id})
    if existing:
        await db.supplier_invoices.update_one({'_id': existing['_id']}, {'$set': doc})
        invoice_id = str(existing['_id'])
        action = 'update'
    else:
        doc['created_at'] = now
        result = await db.supplier_invoices.insert_one(doc)
        invoice_id = str(result.inserted_id)
        action = 'create'

    updated = await db.supplier_invoices.find_one({'billing_period_id': period_obj_id})
    updated_doc = serialize_doc(updated)

    await log_audit(
        db,
        user_id=current_user['_id'],
        action=action,
        entity='supplier_invoices',
        entity_id=invoice_id,
        detail={'billing_period_id': payload.billing_period_id, 'total_factura': payload.total_factura},
    )

    return updated_doc
