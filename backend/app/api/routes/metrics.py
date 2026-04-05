from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.deps import get_db, require_roles
from app.utils.object_id import serialize_doc

router = APIRouter()


@router.get('/superadmin/dashboard')
async def superadmin_dashboard(
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: dict = Depends(require_roles('superadmin')),
) -> dict:
    total_condominiums = await db.condominiums.count_documents({})
    total_houses = await db.houses.count_documents({'activo': True})

    global_stats_cursor = db.house_invoices.aggregate(
        [
            {
                '$group': {
                    '_id': None,
                    'consumo_global': {'$sum': '$consumo_kwh'},
                    'facturacion_global': {'$sum': '$total'},
                }
            }
        ]
    )
    global_stats = await global_stats_cursor.to_list(length=1)
    global_data = global_stats[0] if global_stats else {'consumo_global': 0, 'facturacion_global': 0}

    ranking_cursor = db.house_invoices.aggregate(
        [
            {
                '$lookup': {
                    'from': 'billing_periods',
                    'localField': 'billing_period_id',
                    'foreignField': '_id',
                    'as': 'period',
                }
            },
            {'$unwind': '$period'},
            {
                '$group': {
                    '_id': '$period.condominium_id',
                    'consumo_total': {'$sum': '$consumo_kwh'},
                    'facturacion_total': {'$sum': '$total'},
                }
            },
            {
                '$lookup': {
                    'from': 'condominiums',
                    'localField': '_id',
                    'foreignField': '_id',
                    'as': 'condominium',
                }
            },
            {
                '$addFields': {
                    'nombre': {
                        '$ifNull': [{'$arrayElemAt': ['$condominium.nombre', 0]}, 'Sin nombre']
                    }
                }
            },
            {'$sort': {'consumo_total': -1}},
            {
                '$project': {
                    '_id': 1,
                    'nombre': 1,
                    'consumo_total': 1,
                    'facturacion_total': 1,
                }
            },
        ]
    )
    ranking_rows = await ranking_cursor.to_list(length=None)

    ranking = [
        {
            'condominium_id': str(row['_id']),
            'nombre': row.get('nombre', 'Sin nombre'),
            'consumo_total': round(float(row.get('consumo_total', 0)), 2),
            'facturacion_total': round(float(row.get('facturacion_total', 0)), 2),
        }
        for row in ranking_rows
    ]

    return serialize_doc(
        {
            'totals': {
                'total_condominiums': total_condominiums,
                'total_houses': total_houses,
                'consumo_global': round(float(global_data.get('consumo_global', 0)), 2),
                'facturacion_global': round(float(global_data.get('facturacion_global', 0)), 2),
            },
            'ranking_consumo': ranking,
        }
    )
