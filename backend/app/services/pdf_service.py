import base64
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlparse

from fastapi import HTTPException

BASE_DIR = Path(__file__).resolve().parents[2]
PDF_DIR = BASE_DIR / 'static' / 'pdfs'


def _to_float(value: float | int | str | None) -> float:
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _currency(value: float | int | str | None) -> str:
    return f"${_to_float(value):,.2f}"


def _kwh(value: float | int | str | None) -> str:
    return f"{_to_float(value):,.2f}"


def _parse_date(value: str | date | datetime | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).date()
        except ValueError:
            return None
    return None


def _date_ddmmyyyy(value: str | date | datetime | None) -> str:
    parsed = _parse_date(value)
    if not parsed:
        return '-'
    return parsed.strftime('%d/%m/%Y')


def _month_name(value: str | date | datetime | None) -> str:
    parsed = _parse_date(value)
    if not parsed:
        return '-'
    names = [
        'ENERO',
        'FEBRERO',
        'MARZO',
        'ABRIL',
        'MAYO',
        'JUNIO',
        'JULIO',
        'AGOSTO',
        'SEPTIEMBRE',
        'OCTUBRE',
        'NOVIEMBRE',
        'DICIEMBRE',
    ]
    return names[parsed.month - 1]


def _image_src(static_url: str | None) -> str:
    if not static_url:
        return ''
    if static_url.startswith(('data:', 'file://')):
        return static_url

    normalized = static_url
    if static_url.startswith(('http://', 'https://')):
        parsed = urlparse(static_url)
        normalized = parsed.path or ''

    if not normalized.startswith('/static/'):
        return ''

    local_path = BASE_DIR / normalized.lstrip('/')
    if not local_path.exists():
        return ''
    ext = local_path.suffix.lower()
    mime = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
    }.get(ext, 'application/octet-stream')
    payload = base64.b64encode(local_path.read_bytes()).decode('ascii')
    return f'data:{mime};base64,{payload}'


def invoice_html(invoice: dict, house: dict, period: dict, condominium: dict) -> str:
    energia = _to_float(invoice.get('valor_energia'))
    alumbrado = _to_float(invoice.get('valor_alumbrado'))
    aseo = _to_float(invoice.get('valor_aseo'))
    subtotal = energia + alumbrado + aseo
    total = _to_float(invoice.get('total'))
    consumo = _to_float(invoice.get('consumo_kwh'))
    tarifa = _to_float(invoice.get('tarifa_kwh'))
    lectura_actual = _to_float(invoice.get('lectura_actual'))
    lectura_anterior = _to_float(invoice.get('lectura_anterior'))

    logo_src = _image_src(condominium.get('logo_url'))
    meter_photo_src = _image_src(invoice.get('foto_medidor_url'))
    fecha_inicio = _date_ddmmyyyy(period.get('fecha_inicio'))
    fecha_fin = _date_ddmmyyyy(period.get('fecha_fin'))
    dias = invoice.get('dias_facturados', period.get('dias', 0))

    return f"""
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    @page {{
      size: A4;
      margin: 9mm;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #1f2b14;
      background: #ecebe6;
      font-size: 12px;
      line-height: 1.15;
    }}
    .invoice {{
      background: #f1f0e8;
      border: 1px solid #d4d5ca;
      padding: 12px 14px 14px;
      page-break-inside: avoid;
    }}
    .top {{
      display: grid;
      grid-template-columns: 1fr 210px;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }}
    .title {{
      color: #486534;
      font-size: 52px;
      font-weight: 900;
      letter-spacing: 0.5px;
    }}
    .logo {{
      text-align: right;
      min-height: 68px;
    }}
    .logo img {{
      width: 180px;
      height: 68px;
      display: block;
      margin-left: auto;
      object-fit: contain;
    }}
    .logo-fallback {{
      color: #486534;
      font-size: 24px;
      font-weight: 900;
      letter-spacing: 0.5px;
    }}
    .bar {{
      border-top: 3px solid #7d902d;
      margin: 6px 0 5px;
    }}
    .meta {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 16px;
      row-gap: 2px;
      font-size: 12px;
    }}
    .meta .item {{
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid #7d902d;
      padding: 2px 0;
      gap: 6px;
    }}
    .meta .label {{
      font-weight: 800;
      color: #486534;
      margin-right: 4px;
      white-space: nowrap;
    }}
    .meta .value {{
      font-weight: 700;
      color: #1f2b14;
      text-align: right;
      white-space: nowrap;
    }}
    .rows {{
      margin-top: 5px;
      border-top: 2px solid #7d902d;
      border-bottom: 2px solid #7d902d;
      page-break-inside: avoid;
    }}
    .rows .r {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-top: 1px solid #7d902d;
      min-height: 20px;
      align-items: center;
      font-size: 12px;
    }}
    .rows .r:first-child {{ border-top: 0; }}
    .rows .c {{
      text-align: center;
      padding: 2px 5px;
    }}
    .rows .v {{ font-weight: 700; }}
    .single-tax {{
      margin-top: 6px;
      width: 56%;
      border-top: 2px solid #7d902d;
      border-bottom: 2px solid #7d902d;
      padding: 4px 6px;
      text-align: center;
      font-size: 11px;
      page-break-inside: avoid;
    }}
    .single-tax .value {{
      font-weight: 800;
      font-size: 20px;
      margin-top: 1px;
    }}
    .chart-box {{
      margin-top: 8px;
      border: 1px solid #c8c9bc;
      height: 116px;
      padding: 8px;
      position: relative;
      background: #f6f5ee;
      page-break-inside: avoid;
    }}
    .chart-title {{
      text-align: center;
      font-weight: 800;
      color: #596838;
      font-size: 16px;
      margin-bottom: 5px;
      letter-spacing: .5px;
    }}
    .chart-grid {{
      border-top: 1px solid #ddd;
      border-bottom: 1px solid #ddd;
      height: 67px;
      position: relative;
    }}
    .chart-bar {{
      position: absolute;
      left: 50%;
      bottom: 0;
      transform: translateX(-50%);
      width: 145px;
      height: 50px;
      background: #b7c04a;
      color: #304021;
      text-align: center;
      padding-top: 6px;
      font-weight: 700;
      font-size: 30px;
    }}
    .chart-month {{
      text-align: center;
      margin-top: 1px;
      color: #60703f;
      font-size: 11px;
      font-weight: 700;
    }}
    .concept-title {{
      margin-top: 8px;
      display: flex;
      justify-content: space-between;
      align-items: end;
      color: #486534;
      font-size: 12.5px;
      font-weight: 900;
      border-bottom: 2px solid #7d902d;
      padding-bottom: 1px;
      page-break-inside: avoid;
    }}
    .totals-table {{
      width: 100%;
      border-collapse: collapse;
      margin-top: 3px;
      font-size: 12.5px;
      page-break-inside: avoid;
    }}
    .totals-table td {{
      border-bottom: 1px solid #9ca77a;
      padding: 5px 6px;
    }}
    .totals-table td:first-child {{
      width: 86%;
      text-align: center;
    }}
    .totals-table td:last-child {{
      width: 14%;
      text-align: right;
      border-left: 2px solid #7d902d;
      font-weight: 700;
    }}
    .totals-table .em td:first-child {{
      text-align: right;
      font-weight: 800;
      color: #486534;
      padding-right: 8px;
    }}
    .totals-table .final td {{
      font-weight: 900;
      color: #2f4222;
      font-size: 16px;
    }}
    .bottom {{
      margin-top: 8px;
      display: grid;
      grid-template-columns: 1fr 290px;
      gap: 10px;
      align-items: end;
      page-break-inside: avoid;
    }}
    .help {{
      font-size: 10.5px;
      line-height: 1.25;
      color: #111;
    }}
    .help strong {{
      font-size: 15px;
      letter-spacing: .2px;
    }}
    .photo-wrap {{
      border: 3px solid #90a33c;
      border-radius: 18px;
      padding: 8px 8px 9px;
      background: #ced66a;
    }}
    .photo-label {{
      margin: -8px -8px 6px;
      background: #a9b842;
      color: #f7f8e4;
      text-align: center;
      font-size: 13px;
      letter-spacing: 1.5px;
      border-top-left-radius: 14px;
      border-top-right-radius: 14px;
      padding: 5px 4px;
    }}
    .photo-frame {{
      height: 165px;
      background: #f3f4ea;
      border-radius: 14px;
      overflow: hidden;
      border: 2px solid #889a37;
      position: relative;
      color: #4a5a2d;
      font-size: 11px;
      font-weight: 700;
      text-align: center;
      padding: 6px;
    }}
    .photo-frame img {{
      width: 100%;
      height: 100%;
      display: block;
      object-fit: contain;
      object-position: center center;
    }}
  </style>
</head>
<body>
  <div class="invoice">
    <div class="top">
      <div class="title">RECIBO ENERGIA</div>
      <div class="logo">
        {f'<img src="{logo_src}" alt="Logo condominio" />' if logo_src else f'<div class="logo-fallback">{condominium.get("nombre", "").upper()}</div>'}
      </div>
    </div>

    <div class="bar"></div>
    <div class="meta">
      <div class="item"><span class="label">USUARIO:</span><span class="value">{invoice.get('nombre_usuario', f"CASA {house.get('numero_casa', '-')}")}</span></div>
      <div class="item"><span class="label">FACTURA NO.</span><span class="value">{invoice.get('numero_factura', '-')}</span></div>
      <div class="item"><span class="label">DIRECCION:</span><span class="value">{invoice.get('direccion_factura', f"CASA {house.get('numero_casa', '-')}")}</span></div>
      <div class="item"><span class="label">FECHA OPORTUNA DE PAGO</span><span class="value">{fecha_fin}</span></div>
      <div></div>
      <div class="item"><span class="label">TOTAL A PAGAR</span><span class="value">{_currency(total)}</span></div>
    </div>

    <div class="rows">
      <div class="r">
        <div class="c">Periodo facturado: <span class="v">{fecha_inicio} - {fecha_fin}</span></div>
        <div class="c">Serie Medidor : <span class="v">{house.get('serie_medidor', '-')}</span></div>
      </div>
      <div class="r">
        <div class="c">Numero de facturas vencidas : <span class="v">0</span></div>
        <div class="c">Monto : <span class="v">0</span></div>
      </div>
      <div class="r">
        <div class="c">Fecha Ultimo Pago : <span class="v">-</span></div>
        <div class="c">Monto : <span class="v">$</span></div>
      </div>
      <div class="r">
        <div class="c">Lectura Actual : <span class="v">{lectura_actual:,.2f}</span></div>
        <div class="c">Lectura Anterior : <span class="v">{lectura_anterior:,.2f}</span></div>
      </div>
      <div class="r">
        <div class="c">Fecha Lectura Actual: <span class="v">{_date_ddmmyyyy(invoice.get('fecha_lectura_actual'))}</span></div>
        <div class="c">Fecha Lectura Anterior: <span class="v">{_date_ddmmyyyy(invoice.get('fecha_lectura_anterior'))}</span></div>
      </div>
      <div class="r">
        <div class="c">Dias Facturados: <span class="v">{dias}</span></div>
        <div class="c"></div>
      </div>
      <div class="r">
        <div class="c">Tarifa en $/KW/h : <span class="v">{_currency(tarifa)}</span></div>
        <div class="c">Consumo KW/h <span class="v">{_kwh(consumo)}</span></div>
      </div>
    </div>

    <div class="single-tax">
      Impuesto Alumbrado Publico 15%
      <div class="value">{_currency(alumbrado)}</div>
    </div>

    <div class="chart-box">
      <div class="chart-title">CONSUMO KW/H</div>
      <div class="chart-grid">
        <div class="chart-bar">{_kwh(consumo)}</div>
      </div>
      <div class="chart-month">{_month_name(period.get('fecha_fin'))}</div>
    </div>

    <div class="concept-title">
      <span>Detalles de conceptos facturados</span>
      <span>TOTAL</span>
    </div>
    <table class="totals-table">
      <tr>
        <td>Consumo</td>
        <td>{_currency(energia)}</td>
      </tr>
      <tr>
        <td>Mes anterior</td>
        <td>$0.00</td>
      </tr>
      <tr>
        <td>Impuesto Alumbrado Publico 15%</td>
        <td>{_currency(alumbrado)}</td>
      </tr>
      <tr class="em">
        <td>SUBTOTAL</td>
        <td>{_currency(subtotal)}</td>
      </tr>
      <tr class="final">
        <td>TOTAL A PAGAR</td>
        <td>{_currency(total)}</td>
      </tr>
    </table>

    <div class="bottom">
      <div class="help">
        <p>Pagar a la cuenta ahorros Bancolombia numero <strong>{condominium.get('cuenta_bancaria', '-')}</strong> a nombre de condominio <strong>{condominium.get('nombre', '-')}</strong></p>
        <p>Una vez realice el pago enviar el soporte al correo electronico<br /><strong>{condominium.get('email_contacto', '-')}</strong></p>
      </div>
      <div class="photo-wrap">
        <div class="photo-label">FOTOGRAFIA MEDIDOR</div>
        <div class="photo-frame">
          {f'<img src="{meter_photo_src}" alt="Foto medidor" />' if meter_photo_src else '<span>Sin foto del medidor cargada</span>'}
        </div>
      </div>
    </div>
  </div>
</body>
</html>
"""


def save_invoice_pdf(invoice: dict, house: dict, period: dict, condominium: dict) -> str:
    try:
        from weasyprint import HTML
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f'WeasyPrint no disponible: {exc}') from exc

    PDF_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"invoice_{invoice['_id']}.pdf"
    filepath = PDF_DIR / filename

    html = invoice_html(invoice, house, period, condominium)
    HTML(string=html, base_url=str(BASE_DIR)).write_pdf(filepath)
    return f'/static/pdfs/{filename}'
