# EnergyFlow MVP SaaS

MVP funcional para gestión de lecturas y facturación de energía en condominios.

## Stack
- Frontend: Next.js 15 + TailwindCSS
- Backend: FastAPI
- DB: MongoDB Atlas (multi-tenant por `condominium_id`)
- Auth: JWT + RBAC (`superadmin`, `admin`, `operador`)
- PDF: WeasyPrint (HTML a PDF)
- Excel: pandas + openpyxl

## Arquitectura
- `backend/app/api/routes`: endpoints por dominio
- `backend/app/services`: lógica de negocio (liquidación, PDF, Excel, auditoría)
- `backend/app/core`: configuración, seguridad, dependencias RBAC
- `frontend/app`: pantallas por rol y módulos funcionales
- `frontend/components`: shell, guardias de ruta, tablas y métricas

## Reglas de negocio implementadas
- Cálculo consumo por casa: `lectura_actual - lectura_anterior`
- Tarifa kWh: `valor_consumo_total / consumo_total_kwh`
- Factura por casa:
  - `valor_energia = consumo * tarifa_kwh`
  - `valor_alumbrado = valor_energia * 0.15` (o porcentaje configurable por condominio)
  - `total = energia + alumbrado`
- `Zonas comunes`:
  - recibe TODO el `valor_aseo`
  - puede tener consumo adicional
- No cerrar periodo si faltan lecturas
- No calcular si falta factura global
- Validación `lectura_actual >= lectura_anterior`
- Detección de consumo negativo
- Alerta de casas sin consumo en el resultado de liquidación
- Auditoría básica en colección `audit_logs`

## Multi-tenant
Todos los módulos filtran por `condominium_id` usando `enforce_tenant_scope`:
- Superadmin puede operar sobre cualquier condominio (debe indicar `condominium_id` donde aplique)
- Admin y operador solo sobre su condominio

## Colecciones MongoDB
- `condominiums`
- `users`
- `houses`
- `billing_periods`
- `meter_readings`
- `supplier_invoices`
- `house_invoices`
- `audit_logs`

## Endpoints relevantes
Base URL: `/api/v1`

- Auth:
  - `POST /auth/login`
  - `GET /auth/me`
- Usuarios:
  - `POST /users/bootstrap-superadmin`
  - `GET /users` (superadmin)
  - `POST /users` (superadmin)
  - `PATCH /users/{id}` (superadmin)
- Condominios:
  - `GET/POST /condominiums` (superadmin)
  - `PATCH/DELETE /condominiums/{id}` (superadmin)
  - `POST /condominiums/{id}/logo` (superadmin, multipart image)
  - `GET /condominiums/me`
- Casas:
  - `GET /houses`
  - `POST /houses` (operador/superadmin)
  - `PATCH /houses/{id}` (operador/superadmin)
  - `DELETE /houses/{id}` (soft delete)
- Periodos:
  - `GET/POST /billing-periods`
  - `PATCH /billing-periods/{id}`
  - `POST /billing-periods/{id}/close`
- Lecturas:
  - `GET /meter-readings?billing_period_id=...`
  - `PUT /meter-readings`
  - `POST /meter-readings/{id}/photo` (operador/superadmin, multipart image)
- Factura global:
  - `GET /supplier-invoices?billing_period_id=...`
  - `PUT /supplier-invoices`
- Liquidación:
  - `POST /billing/{period_id}/calculate`
  - `GET /billing/{period_id}/house-invoices`
  - `POST /billing/house-invoices/{id}/generate-pdf`
  - `GET /billing/house-invoices/{id}/download` (descarga con nombre `energiacasa...`)
  - `POST /billing/{period_id}/generate-all-pdfs`
- Reporte:
  - `GET /reports/{period_id}/general`
  - `GET /reports/{period_id}/excel` (descarga con nombre `reportegeneral...`)
  - `GET /reports/{period_id}/houses-chart`
  - `GET /reports/{period_id}/houses-pdf` (descarga con nombre `reportegeneral...`)
  - `GET /reports/{period_id}/house-history?house_id=...`
  - `GET /reports/{period_id}/house-pdf?house_id=...` (descarga con nombre `reportecasa...`)
- Métricas superadmin:
  - `GET /metrics/superadmin/dashboard`
- Configuración global:
  - `GET /settings/global`
  - `PUT /settings/global`

## Pantallas frontend
- `/login`
- `/superadmin`
- `/admin`
- `/operator`
- `/houses`
- `/billing-periods`
- `/meter-readings`
- `/supplier-invoice`
- `/liquidation`
- `/reports`
- `/pdfs`

## Configuración backend
1. Crear entorno virtual e instalar dependencias:
   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. Configurar variables:
   ```bash
   cp .env.example .env
   ```
3. Ejecutar API:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
4. Swagger:
   - `http://localhost:8000/docs`

## Configuración frontend
1. Instalar dependencias:
   ```bash
   cd frontend
   npm install
   ```
2. Configurar variables:
   ```bash
   cp .env.example .env.local
   ```
3. Ejecutar:
   ```bash
   npm run dev
   ```

## Seed inicial (1 condominio + 10 casas + zonas comunes)
Desde `backend/`:
```bash
python -m scripts.seed
```

Credenciales seed:
- `superadmin@energyflow.app / SuperAdmin123!`
- `admin@malibu.com / Admin123!`
- `operador@malibu.com / Operador123!`

## Limpieza total (dejar solo superadmin)
Desde `backend/`:
```bash
python -m scripts.reset_keep_superadmin
```
También disponible vía API (solo superadmin):
- `POST /settings/reset-data`

## Importación histórica desde Excel
Para cargar todos tus reportes (enero 2024 hasta hoy) sin digitación manual:

Desde `backend/`:
```bash
python -m scripts.import_historical_excel \
  --condominium-id <OBJECT_ID_CONDOMINIO> \
  --input "/ruta/a/carpeta/excel" \
  --pattern "*.xlsx"
```

Opcional:
- `--dry-run`: valida sin escribir en MongoDB.
- `--photos-base "/ruta/base/fotos"`: para resolver rutas relativas de fotos.
- Si agregas columna `foto_path` (o `ruta_foto`) en Excel, el script copia la foto al sistema y la asocia a la lectura.

Columnas esperadas (como tu formato actual):
- `CASA`
- `SERIE MEDIDOR`
- `SERIAL NUEVO` (opcional)
- `UBICACIÓN` (opcional)
- `LECTURA ... ACTUAL`
- `LECTURA ... ANTERIOR`
- `CONSUMO ... DEL PERIODO`
- `FECHA INICIAL`
- `FECHA FINAL`
- `CANTIDAD DE DIAS` (opcional)
- `VALOR DEL KWh ...` (opcional)
- `CONSUMO ... EN PESOS`
- `IMPUESTO ALUMBRADO ...`
- `TOTAL FACTURA`

## Nota WeasyPrint
Si el sistema operativo no tiene dependencias nativas de WeasyPrint, instálalas antes de generar PDFs (GTK/Pango/Cairo según distro).
