from datetime import date, datetime
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import enforce_tenant_scope, get_db, get_current_user
from app.services.billing_service import build_general_report
from app.services.excel_service import build_report_excel
from app.services.report_pdf_service import (
    build_house_monthly_pdf,
    build_houses_chart_data,
    build_houses_report_pdf,
)
from app.utils.download_names import general_report_filename, house_report_filename
from app.utils.object_id import serialize_doc, to_object_id

router = APIRouter()


def _as_date(value) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    raise HTTPException(status_code=400, detail='Formato de fecha inválido')


def _month_label_es(value) -> str:
    parsed = _as_date(value)
    names = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
    return f"{names[parsed.month - 1]} {parsed.year}"


async def _build_house_history(
    db: AsyncIOMotorDatabase,
    billing_period_id: str,
    house_id: str,
    current_user: dict,
) -> dict:
    try:
        period_obj_id = to_object_id(billing_period_id, 'billing_period_id')
        house_obj_id = to_object_id(house_id, 'house_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='ID inválido') from exc

    period = await db.billing_periods.find_one({'_id': period_obj_id})
    if not period:
        raise HTTPException(status_code=404, detail='Periodo no encontrado')

    enforce_tenant_scope(current_user, str(period['condominium_id']))

    house = await db.houses.find_one({'_id': house_obj_id, 'condominium_id': period['condominium_id']})
    if not house:
        raise HTTPException(status_code=404, detail='Casa no encontrada en el condominio del periodo')

    periods = await db.billing_periods.find(
        {
            'condominium_id': period['condominium_id'],
            'fecha_fin': {'$lte': period['fecha_fin']},
        }
    ).sort('fecha_fin', -1).to_list(length=6)

    if not periods:
        return {'period': period, 'house': house, 'history': []}

    period_ids = [item['_id'] for item in periods]
    readings = await db.meter_readings.find({'house_id': house_obj_id, 'billing_period_id': {'$in': period_ids}}).to_list(length=None)
    invoices = await db.house_invoices.find({'house_id': house_obj_id, 'billing_period_id': {'$in': period_ids}}).to_list(length=None)

    reading_map = {str(item['billing_period_id']): item for item in readings}
    invoice_map = {str(item['billing_period_id']): item for item in invoices}

    rows: list[dict] = []
    for item in reversed(periods):
        period_id_str = str(item['_id'])
        reading = reading_map.get(period_id_str, {})
        invoice = invoice_map.get(period_id_str, {})
        rows.append(
            {
                'period_id': period_id_str,
                'mes': _month_label_es(item.get('fecha_fin')),
                'consumo_kwh': float(reading.get('consumo', invoice.get('consumo_kwh', 0))),
                'total_factura': float(invoice.get('total', 0)),
                'lectura_anterior': float(reading.get('lectura_anterior', 0)),
                'lectura_actual': float(reading.get('lectura_actual', 0)),
            }
        )

    return {'period': period, 'house': house, 'history': rows}


@router.get('/{billing_period_id}/general')
async def general_report(
    billing_period_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    return await build_general_report(db, billing_period_id, current_user)


@router.get('/{billing_period_id}/excel')
async def general_report_excel(
    billing_period_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    report = await build_general_report(db, billing_period_id, current_user)
    payload = build_report_excel(report['rows'], report['totals'])
    filename = general_report_filename(report['period'].get('fecha_fin'), 'xlsx')

    return StreamingResponse(
        BytesIO(payload),
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': f'attachment; filename={filename}'},
    )


@router.get('/{billing_period_id}/houses-chart')
async def houses_chart_report(
    billing_period_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    report = await build_general_report(db, billing_period_id, current_user)
    return {
        'period': report['period'],
        'condominium': report['condominium'],
        'rows': build_houses_chart_data(report['rows']),
        'totals': report['totals'],
    }


@router.get('/{billing_period_id}/houses-pdf')
async def houses_report_pdf(
    billing_period_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    report = await build_general_report(db, billing_period_id, current_user)
    payload = build_houses_report_pdf(report)
    filename = general_report_filename(report['period'].get('fecha_fin'), 'pdf')
    return StreamingResponse(
        BytesIO(payload),
        media_type='application/pdf',
        headers={'Content-Disposition': f'attachment; filename={filename}'},
    )


@router.get('/{billing_period_id}/house-history')
async def house_history_report(
    billing_period_id: str,
    house_id: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    data = await _build_house_history(db, billing_period_id, house_id, current_user)
    return {
        'period': serialize_doc(data['period']),
        'house': serialize_doc(data['house']),
        'history': data['history'],
    }


@router.get('/{billing_period_id}/house-pdf')
async def house_monthly_pdf(
    billing_period_id: str,
    house_id: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    data = await _build_house_history(db, billing_period_id, house_id, current_user)
    condo = await db.condominiums.find_one({'_id': data['period']['condominium_id']})
    if not condo:
        raise HTTPException(status_code=404, detail='Condominio no encontrado')

    payload = build_house_monthly_pdf(condo, data['period'], data['house'], data['history'])
    filename = house_report_filename(data['house'].get('numero_casa'), data['period'].get('fecha_fin'))
    return StreamingResponse(
        BytesIO(payload),
        media_type='application/pdf',
        headers={'Content-Disposition': f'attachment; filename={filename}'},
    )
