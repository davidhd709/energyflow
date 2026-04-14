from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import enforce_tenant_scope
from app.utils.object_id import serialize_doc, to_object_id


def _round2(value: float) -> float:
    return round(float(value), 2)


async def load_period_scoped(
    db: AsyncIOMotorDatabase,
    billing_period_id: str,
    current_user: dict,
) -> dict[str, Any]:
    try:
        period_obj_id = to_object_id(billing_period_id, 'billing_period_id')
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='billing_period_id inválido') from exc

    period = await db.billing_periods.find_one({'_id': period_obj_id})
    if not period:
        raise HTTPException(status_code=404, detail='Periodo no encontrado')

    scoped_condo = enforce_tenant_scope(current_user, str(period['condominium_id']))
    if scoped_condo != str(period['condominium_id']):
        raise HTTPException(status_code=403, detail='Periodo fuera de alcance')

    condominium = await db.condominiums.find_one({'_id': period['condominium_id']})
    if not condominium:
        raise HTTPException(status_code=404, detail='Condominio no encontrado')

    return {
        'period': serialize_doc(period),
        'period_obj_id': period_obj_id,
        'condominium': serialize_doc(condominium),
    }


async def calculate_billing(
    db: AsyncIOMotorDatabase,
    billing_period_id: str,
    current_user: dict,
) -> dict[str, Any]:
    scoped = await load_period_scoped(db, billing_period_id, current_user)
    period = scoped['period']
    period_obj_id = scoped['period_obj_id']
    condominium = scoped['condominium']
    condominium_obj_id = to_object_id(period['condominium_id'], 'condominium_id')

    if period.get('estado') == 'cerrado':
        raise HTTPException(status_code=400, detail='El periodo está cerrado. Debe reabrirse para recalcular.')

    supplier_invoice = await db.supplier_invoices.find_one({'billing_period_id': period_obj_id})
    if not supplier_invoice:
        raise HTTPException(status_code=400, detail='No existe factura global del proveedor para este periodo')

    houses = await db.houses.find(
        {
            'condominium_id': condominium_obj_id,
            'activo': True,
            'incluir_en_liquidacion': {'$ne': False},
        }
    ).to_list(length=None)
    if not houses:
        raise HTTPException(status_code=400, detail='No hay casas activas para el condominio')

    readings = await db.meter_readings.find({'billing_period_id': period_obj_id}).to_list(length=None)
    reading_map = {str(item['house_id']): item for item in readings}

    missing_houses: list[str] = []
    for house in houses:
        if str(house['_id']) not in reading_map:
            missing_houses.append(house['numero_casa'])

    if missing_houses:
        raise HTTPException(
            status_code=400,
            detail={
                'message': 'No se puede calcular: faltan lecturas',
                'houses': missing_houses,
            },
        )

    consumo_total_kwh = float(supplier_invoice.get('consumo_total_kwh', 0))
    valor_consumo_total = float(supplier_invoice.get('valor_consumo_total', 0))

    tarifa_kwh = 0.0
    if consumo_total_kwh > 0:
        tarifa_kwh = valor_consumo_total / consumo_total_kwh

    porcentaje_alumbrado = float(condominium.get('porcentaje_alumbrado', 15.0))
    valor_aseo = float(supplier_invoice.get('valor_aseo', 0))

    now = datetime.now(timezone.utc)
    house_invoice_docs: list[dict[str, Any]] = []
    warnings_sin_consumo: list[str] = []

    total_energia = 0.0
    total_impuesto = 0.0
    total_facturado = 0.0

    for house in houses:
        reading = reading_map[str(house['_id'])]
        consumo = float(reading.get('consumo', 0))

        if consumo < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Consumo negativo detectado en casa {house['numero_casa']}",
            )

        if consumo == 0:
            warnings_sin_consumo.append(house['numero_casa'])

        valor_energia = _round2(consumo * tarifa_kwh)
        valor_alumbrado = _round2(valor_energia * (porcentaje_alumbrado / 100))
        subtotal = _round2(valor_energia + valor_alumbrado)

        total = subtotal
        if house.get('es_zona_comun', False):
            total = _round2(subtotal + valor_aseo)

        house_invoice_docs.append(
            {
                'billing_period_id': period_obj_id,
                'house_id': house['_id'],
                'consumo_kwh': _round2(consumo),
                'tarifa_kwh': _round2(tarifa_kwh),
                'valor_energia': valor_energia,
                'valor_alumbrado': valor_alumbrado,
                'valor_aseo': _round2(valor_aseo) if house.get('es_zona_comun', False) else 0.0,
                'total': total,
                'pdf_url': None,
                'estado_entrega': 'pendiente',
                'created_at': now,
                'updated_at': now,
            }
        )

        total_energia += valor_energia
        total_impuesto += valor_alumbrado
        total_facturado += total

    await db.house_invoices.delete_many({'billing_period_id': period_obj_id})
    if house_invoice_docs:
        await db.house_invoices.insert_many(house_invoice_docs)

    await db.supplier_invoices.update_one(
        {'_id': supplier_invoice['_id']},
        {
            '$set': {
                'tarifa_kwh': _round2(tarifa_kwh),
                'updated_at': now,
            }
        },
    )

    await db.billing_periods.update_one(
        {'_id': period_obj_id},
        {
            '$set': {
                'estado': 'calculado',
                'updated_at': now,
            }
        },
    )

    return {
        'message': 'Liquidación generada correctamente',
        'tarifa_kwh': _round2(tarifa_kwh),
        'total_energia': _round2(total_energia),
        'total_impuesto': _round2(total_impuesto),
        'total_facturado': _round2(total_facturado),
        'warnings': {
            'houses_without_consumption': warnings_sin_consumo,
        },
    }


async def build_general_report(
    db: AsyncIOMotorDatabase,
    billing_period_id: str,
    current_user: dict,
) -> dict[str, Any]:
    scoped = await load_period_scoped(db, billing_period_id, current_user)
    period = scoped['period']
    condominium = scoped['condominium']
    period_obj_id = scoped['period_obj_id']
    condominium_obj_id = to_object_id(period['condominium_id'], 'condominium_id')

    houses = await db.houses.find(
        {
            'condominium_id': condominium_obj_id,
            'activo': True,
            'incluir_en_liquidacion': {'$ne': False},
        }
    ).sort('numero_casa', 1).to_list(length=None)
    readings = await db.meter_readings.find({'billing_period_id': period_obj_id}).to_list(length=None)
    reading_map = {str(item['house_id']): serialize_doc(item) for item in readings}

    supplier_invoice = await db.supplier_invoices.find_one({'billing_period_id': period_obj_id})
    tarifa_kwh = float((supplier_invoice or {}).get('tarifa_kwh', 0.0))

    house_invoices = await db.house_invoices.find({'billing_period_id': period_obj_id}).to_list(length=None)
    invoice_map = {str(item['house_id']): serialize_doc(item) for item in house_invoices}

    rows: list[dict[str, Any]] = []
    total_consumo = 0.0
    total_energia = 0.0
    total_impuesto = 0.0
    total = 0.0
    porcentaje_alumbrado = float(condominium.get('porcentaje_alumbrado', 15.0)) / 100

    for house in houses:
        house_doc = serialize_doc(house)
        reading = reading_map.get(house_doc['_id'], {})
        invoice = invoice_map.get(house_doc['_id'], {})

        consumo = float(reading.get('consumo', 0.0))
        valor_energia = float(invoice.get('valor_energia', consumo * tarifa_kwh))
        valor_alumbrado = float(invoice.get('valor_alumbrado', valor_energia * porcentaje_alumbrado))
        total_factura = float(invoice.get('total', valor_energia + valor_alumbrado))

        row = {
            'house_id': house_doc['_id'],
            'nombre_usuario': house_doc.get('nombre_usuario', ''),
            'Casa': house_doc['numero_casa'],
            'Serie medidor': house_doc.get('serie_medidor', ''),
            'Serial nuevo': house_doc.get('serial_nuevo', ''),
            'Ubicación': house_doc.get('ubicacion', ''),
            'Lectura actual': float(reading.get('lectura_actual', 0)),
            'Lectura anterior': float(reading.get('lectura_anterior', 0)),
            'foto_medidor_url': reading.get('foto_medidor_url', ''),
            'Consumo kWh': _round2(consumo),
            'Fecha inicial': period['fecha_inicio'],
            'Fecha final': period['fecha_fin'],
            'Días': int(period.get('dias', 0)),
            'Valor kWh': _round2(float(invoice.get('tarifa_kwh', tarifa_kwh))),
            'Consumo en pesos': _round2(valor_energia),
            'Impuesto alumbrado 15%': _round2(valor_alumbrado),
            'Total factura': _round2(total_factura),
        }

        rows.append(row)

        total_consumo += consumo
        total_energia += valor_energia
        total_impuesto += valor_alumbrado
        total += total_factura

    return {
        'condominium': condominium,
        'period': period,
        'rows': rows,
        'totals': {
            'Consumo kWh': _round2(total_consumo),
            'Consumo en pesos': _round2(total_energia),
            'Impuesto alumbrado 15%': _round2(total_impuesto),
            'Total factura': _round2(total),
        },
    }
