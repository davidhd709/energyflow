import asyncio
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.core.security import hash_password


async def run_seed() -> None:
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DB_NAME]

    now = datetime.now(timezone.utc)

    condo = await db.condominiums.find_one({'nombre': 'Condominio Malibu'})
    if not condo:
        res = await db.condominiums.insert_one(
            {
                'nombre': 'Condominio Malibu',
                'direccion': 'Monteria, Cordoba',
                'porcentaje_alumbrado': 15.0,
                'cuenta_bancaria': '680-000-204-55',
                'email_contacto': 'soporte@malibu.com',
                'created_at': now,
                'updated_at': now,
            }
        )
        condo = await db.condominiums.find_one({'_id': res.inserted_id})

    condo_id = condo['_id']

    users = [
        {
            'nombre': 'Super Admin',
            'email': 'superadmin@energyflow.app',
            'password': 'SuperAdmin123!',
            'rol': 'superadmin',
            'condominium_id': None,
        },
        {
            'nombre': 'Admin Malibu',
            'email': 'admin@malibu.com',
            'password': 'Admin123!',
            'rol': 'admin',
            'condominium_id': condo_id,
        },
        {
            'nombre': 'Operador Malibu',
            'email': 'operador@malibu.com',
            'password': 'Operador123!',
            'rol': 'operador',
            'condominium_id': condo_id,
        },
    ]

    for user in users:
        exists = await db.users.find_one({'email': user['email']})
        if not exists:
            await db.users.insert_one(
                {
                    'nombre': user['nombre'],
                    'email': user['email'],
                    'password_hash': hash_password(user['password']),
                    'rol': user['rol'],
                    'condominium_id': user['condominium_id'],
                    'activo': True,
                    'created_at': now,
                    'updated_at': now,
                }
            )

    total_houses = await db.houses.count_documents({'condominium_id': condo_id})
    if total_houses < 10:
        await db.houses.delete_many({'condominium_id': condo_id})
        docs = []
        for i in range(1, 10):
            docs.append(
                {
                    'condominium_id': condo_id,
                    'nombre_usuario': f'Propietario {i:02}',
                    'numero_casa': f'CASA {i:02}',
                    'ubicacion': f'Manzana A - Lote {i:02}',
                    'serie_medidor': f'1321300{i:03}',
                    'serial_nuevo': f'NEW-{i:03}',
                    'tipo_medidor': 'digital',
                    'es_zona_comun': False,
                    'activo': True,
                    'created_at': now,
                    'updated_at': now,
                }
            )

        docs.append(
            {
                'condominium_id': condo_id,
                'nombre_usuario': 'Administración',
                'numero_casa': 'ZONAS COMUNES',
                'ubicacion': 'Porteria y alumbrado',
                'serie_medidor': '1321300999',
                'serial_nuevo': 'NEW-999',
                'tipo_medidor': 'digital',
                'es_zona_comun': True,
                'activo': True,
                'created_at': now,
                'updated_at': now,
            }
        )

        await db.houses.insert_many(docs)

    period = await db.billing_periods.find_one({'condominium_id': condo_id, 'estado': 'abierto'})
    if not period:
        res = await db.billing_periods.insert_one(
            {
                'condominium_id': condo_id,
                'fecha_inicio': datetime(2026, 2, 15, tzinfo=timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0),
                'fecha_fin': datetime(2026, 3, 15, tzinfo=timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0),
                'dias': 29,
                'estado': 'abierto',
                'created_at': now,
                'updated_at': now,
            }
        )
        period = await db.billing_periods.find_one({'_id': res.inserted_id})

    houses = await db.houses.find({'condominium_id': condo_id, 'activo': True}).sort('numero_casa', 1).to_list(length=None)
    for idx, house in enumerate(houses, start=1):
        lectura_anterior = 7000 + (idx * 100)
        lectura_actual = lectura_anterior + (60 if house['es_zona_comun'] else 120 + idx)

        existing = await db.meter_readings.find_one(
            {'billing_period_id': period['_id'], 'house_id': house['_id']}
        )

        payload = {
            'billing_period_id': period['_id'],
            'house_id': house['_id'],
            'lectura_anterior': float(lectura_anterior),
            'lectura_actual': float(lectura_actual),
            'consumo': float(lectura_actual - lectura_anterior),
            'observaciones': 'Seed inicial',
            'updated_at': now,
        }

        if existing:
            await db.meter_readings.update_one({'_id': existing['_id']}, {'$set': payload})
        else:
            payload['created_at'] = now
            await db.meter_readings.insert_one(payload)

    if not await db.supplier_invoices.find_one({'billing_period_id': period['_id']}):
        await db.supplier_invoices.insert_one(
            {
                'billing_period_id': period['_id'],
                'consumo_total_kwh': 1400,
                'valor_consumo_total': 1237600,
                'tarifa_kwh': 884.0,
                'valor_alumbrado_total': 185640,
                'valor_aseo': 150000,
                'total_factura': 1573240,
                'created_at': now,
                'updated_at': now,
            }
        )

    print('Seed completado')
    print('Superadmin: superadmin@energyflow.app / SuperAdmin123!')
    print('Admin: admin@malibu.com / Admin123!')
    print('Operador: operador@malibu.com / Operador123!')

    client.close()


if __name__ == '__main__':
    asyncio.run(run_seed())
