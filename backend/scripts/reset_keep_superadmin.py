import asyncio
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings


async def run() -> None:
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DB_NAME]
    now = datetime.now(timezone.utc)

    superadmin = await db.users.find_one({'rol': 'superadmin'})
    if not superadmin:
        print('No se encontró superadmin. Cancela la limpieza para no dejar el sistema sin acceso.')
        client.close()
        return

    keep_id = superadmin['_id']
    keep_email = superadmin.get('email', '(sin email)')

    collections_to_clean = [
        'condominiums',
        'houses',
        'billing_periods',
        'meter_readings',
        'supplier_invoices',
        'house_invoices',
        'audit_logs',
        'system_settings',
    ]

    for collection_name in collections_to_clean:
        result = await db[collection_name].delete_many({})
        print(f'{collection_name}: {result.deleted_count} registros eliminados')

    users_result = await db.users.delete_many({'_id': {'$ne': keep_id}})
    print(f'users eliminados (excepto superadmin): {users_result.deleted_count}')

    await db.users.update_one(
        {'_id': keep_id},
        {
            '$set': {
                'rol': 'superadmin',
                'condominium_id': None,
                'activo': True,
                'updated_at': now,
            }
        },
    )

    print(f'Limpieza completada. Superadmin conservado: {keep_email}')
    client.close()


if __name__ == '__main__':
    asyncio.run(run())
