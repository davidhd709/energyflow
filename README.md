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

## Despliegue en producción (VPS Ubuntu + Nginx)

Producción actual: `https://energyflow.tachetech.com` en VPS Contabo, gestionado por systemd:
- `energyflow-backend.service` → uvicorn en `127.0.0.1:8000`
- `energyflow-frontend.service` → `next start` en `127.0.0.1:3000`
- Repo en `/home/ingenierohenry/energyflow`
- Nginx site en `/etc/nginx/sites-enabled/energyflow` hace proxy a ambos puertos

### Despliegue automático: GitHub Actions

`.github/workflows/deploy.yml` corre en cada push a `main` (y manualmente vía workflow_dispatch). Hace SSH al VPS como `energydeploy`, sincroniza el repo con `git reset --hard origin/main`, instala dependencias backend (pip) y frontend (npm ci + npm run build), reinicia ambos servicios systemd y valida con un health check contra `https://energyflow.tachetech.com/health`.

### Bootstrap inicial (una sola vez)

#### 1. Secrets en GitHub Actions
En GitHub → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Valor |
|---|---|
| `CONTABO_HOST` | IP o dominio del VPS |
| `CONTABO_DEPLOY_USER` | `energydeploy` |
| `CONTABO_SSH_KEY` | Clave **privada** SSH (formato openssh, completa con `-----BEGIN ... PRIVATE KEY-----`) |
| `CONTABO_SSH_PORT` | Solo si NO es 22 (opcional) |

Si todavía no tienes el par de claves para `energydeploy`, en una máquina segura:
```bash
ssh-keygen -t ed25519 -C "energyflow-deploy" -f ./energyflow_deploy
# energyflow_deploy.pub → al VPS, ver paso siguiente
# energyflow_deploy     → contenido completo a CONTABO_SSH_KEY
```

#### 2. En el VPS — preparar al usuario `energydeploy`

```bash
# Como root o con sudo del usuario admin:
sudo useradd -m -s /bin/bash energydeploy   # si no existe ya

# Autorizar la clave pública generada arriba:
sudo -u energydeploy mkdir -p /home/energydeploy/.ssh
sudo -u energydeploy chmod 700 /home/energydeploy/.ssh
sudo -u energydeploy tee -a /home/energydeploy/.ssh/authorized_keys < energyflow_deploy.pub
sudo -u energydeploy chmod 600 /home/energydeploy/.ssh/authorized_keys

# Permitir que energydeploy escriba en el repo (ACLs):
sudo setfacl -R -m u:energydeploy:rwx /home/ingenierohenry/energyflow
sudo setfacl -R -d -m u:energydeploy:rwx /home/ingenierohenry/energyflow

# Confirmar que NOPASSWD ya está configurado para los servicios EnergyFlow:
sudo cat /etc/sudoers.d/energydeploy
# Debe contener algo equivalente a:
#   energydeploy ALL=(root) NOPASSWD: /bin/systemctl restart energyflow-backend.service, /bin/systemctl restart energyflow-frontend.service, /bin/systemctl is-active energyflow-backend.service, /bin/systemctl is-active energyflow-frontend.service, /bin/systemctl status energyflow-backend.service
# (el workflow llama exactamente a estos paths)
```

#### 3. Smoke test manual antes del primer auto-deploy

Como `energydeploy` en el VPS:
```bash
ssh energydeploy@<VPS_HOST>
cd /home/ingenierohenry/energyflow
git fetch && git reset --hard origin/main         # ¿funciona sin permission denied?
cd backend && ./.venv/bin/pip install -r requirements.txt --quiet  # ¿venv accesible?
cd ../frontend && npm ci && npm run build         # ¿build OK?
sudo /bin/systemctl restart energyflow-backend.service   # ¿NOPASSWD?
sudo /bin/systemctl restart energyflow-frontend.service
curl -fsS https://energyflow.tachetech.com/health
```

Si los 6 pasos pasan en manual, el workflow va a funcionar igual.

#### 4. Disparar el deploy

- **Manual**: GitHub → Actions → "Deploy to Contabo" → "Run workflow" → main.
- **Automático**: cualquier push a `main` lo dispara.

### Variables de entorno obligatorias en producción

`backend/.env`:

- `ENV=prod` (oculta `/docs`, `/redoc` y `/openapi.json`)
- `JWT_SECRET_KEY`: cadena fuerte (≥32 caracteres). Generar con:
  ```bash
  python -c "import secrets; print(secrets.token_urlsafe(48))"
  ```
- `MONGODB_URI`: URI de Mongo Atlas con credenciales correctas
- `CORS_ORIGINS`: dominios reales del frontend separados por coma (ej. `https://app.tudominio.com`)
- `CORS_ORIGIN_REGEX`: dejar vacío en producción salvo que se necesite (Vercel previews, etc.)

`frontend/.env.local`:

- `NEXT_PUBLIC_API_URL=https://api.tudominio.com/api/v1`
- `BACKEND_API_URL=https://api.tudominio.com` (o la URL interna si el proxy es server-to-server)

### Servicios systemd existentes

Ya configurados en el VPS de producción:

```
/etc/systemd/system/energyflow-backend.service
  ExecStart=/home/ingenierohenry/energyflow/backend/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

/etc/systemd/system/energyflow-frontend.service
  WorkingDirectory=/home/ingenierohenry/energyflow/frontend
  ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1 --port 3000
```

Nginx (`/etc/nginx/sites-enabled/energyflow`) hace proxy `/api/*` → 127.0.0.1:8000 y `/` → 127.0.0.1:3000 sobre TLS.

## Seguridad — TODOs técnicos pendientes

Estos puntos NO están aplicados todavía y deben evaluarse antes de un release a producción:

- [ ] **JWT en localStorage**: hoy el token se guarda en `localStorage` ([frontend/lib/auth.ts](frontend/lib/auth.ts)). Es vulnerable a XSS. Migrar a cookies `HttpOnly + Secure + SameSite=Lax` (cambio grande, requiere endpoint de login que setee cookie y middleware backend que la lea).
- [ ] **`/users/bootstrap-superadmin`** está en `PUBLIC_PATHS` ([backend/app/core/auth_middleware.py](backend/app/core/auth_middleware.py)). Verificar que el endpoint solo permita crear el primer superadmin si no existe ninguno; si no, protegerlo con un token de bootstrap (env var) o eliminarlo en producción tras el primer uso.
- [ ] **Credenciales seed** del README y `backend/scripts/seed.py` son públicas — solo usar en entornos de desarrollo. Cambiar contraseñas tras el primer arranque productivo.
- [ ] **`reactStrictMode: false`** en [frontend/next.config.mjs](frontend/next.config.mjs). Evaluar activarlo y resolver warnings que React 19 pueda exponer.
- [x] **`CORS_ORIGIN_REGEX`**: el default permisivo `https://.*\.vercel\.app` se eliminó. Ahora es `None` por defecto. Si en el futuro vuelves a desplegar en Vercel, configura `CORS_ORIGIN_REGEX` explícito en `.env`.
- [ ] **Dockerfile** corre como root. Considerar agregar `USER appuser` no privilegiado y permisos correctos sobre `static/uploads` y `static/pdfs`.
- [x] **`deploy.yml`**: implementado. SSH como `energydeploy`, git sync + deps + build + restart + health check. Configurar los secrets de GitHub para activarlo (ver sección "Bootstrap inicial").

## CI

Workflow básico en `.github/workflows/ci.yml`:
- Backend: `pip install` + `compileall` + import de `app.main`.
- Frontend: `npm ci` + `npm run lint --if-present` + `npm run build`.

Corre en `push` y `pull_request` contra `main`.

