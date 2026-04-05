from fastapi import APIRouter

from app.api.routes import (
    auth,
    billing,
    condominiums,
    houses,
    imports,
    metrics,
    periods,
    readings,
    reports,
    settings,
    supplier_invoices,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix='/auth', tags=['Auth'])
api_router.include_router(users.router, prefix='/users', tags=['Users'])
api_router.include_router(condominiums.router, prefix='/condominiums', tags=['Condominiums'])
api_router.include_router(houses.router, prefix='/houses', tags=['Houses'])
api_router.include_router(periods.router, prefix='/billing-periods', tags=['Billing Periods'])
api_router.include_router(readings.router, prefix='/meter-readings', tags=['Meter Readings'])
api_router.include_router(supplier_invoices.router, prefix='/supplier-invoices', tags=['Supplier Invoices'])
api_router.include_router(billing.router, prefix='/billing', tags=['Billing'])
api_router.include_router(reports.router, prefix='/reports', tags=['Reports'])
api_router.include_router(imports.router, prefix='/imports', tags=['Imports'])
api_router.include_router(metrics.router, prefix='/metrics', tags=['Metrics'])
api_router.include_router(settings.router, prefix='/settings', tags=['Settings'])
