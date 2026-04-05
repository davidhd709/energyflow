import base64
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from fastapi import HTTPException

BASE_DIR = Path(__file__).resolve().parents[2]


def _to_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _to_currency(value: Any) -> str:
    return f"${_to_float(value):,.2f}"


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


def build_houses_chart_data(rows: list[dict]) -> list[dict]:
    chart_rows = [
        {
            'house_id': row.get('house_id'),
            'casa': str(row.get('Casa', '-')),
            'nombre_usuario': str(row.get('nombre_usuario', '') or ''),
            'consumo_kwh': round(_to_float(row.get('Consumo kWh')), 2),
            'total_factura': round(_to_float(row.get('Total factura')), 2),
            'lectura_actual': round(_to_float(row.get('Lectura actual')), 2),
            'lectura_anterior': round(_to_float(row.get('Lectura anterior')), 2),
            'foto_medidor_url': row.get('foto_medidor_url') or '',
        }
        for row in rows
    ]
    chart_rows.sort(key=lambda item: item['consumo_kwh'], reverse=True)
    return chart_rows


def _report_html(report: dict, chart_rows: list[dict]) -> str:
    condominium = report.get('condominium', {})
    period = report.get('period', {})
    totals = report.get('totals', {})
    max_consumo = max([item['consumo_kwh'] for item in chart_rows], default=1)
    max_consumo = max(max_consumo, 1)

    bars = []
    for item in chart_rows:
        width_pct = min(100, (item['consumo_kwh'] / max_consumo) * 100)
        label = item['nombre_usuario'] or f"Casa {item['casa']}"
        bars.append(
            f"""
            <div class="bar-row">
              <div class="bar-label">{label} ({item['casa']})</div>
              <div class="bar-track">
                <div class="bar-fill" style="width:{width_pct:.2f}%"></div>
              </div>
              <div class="bar-value">{item['consumo_kwh']:.2f} kWh</div>
            </div>
            """
        )

    photos = []
    for item in chart_rows:
        src = _image_src(item.get('foto_medidor_url'))
        label = item['nombre_usuario'] or f"Casa {item['casa']}"
        photos.append(
            f"""
            <div class="photo-card">
              <div class="photo-head">{label} - {item['casa']}</div>
              <div class="photo-body">
                {f'<img src="{src}" alt="Foto medidor {item["casa"]}" />' if src else '<span>Sin imagen cargada</span>'}
              </div>
              <div class="photo-meta">
                Lectura anterior: {item['lectura_anterior']:.2f}<br/>
                Lectura actual: {item['lectura_actual']:.2f}<br/>
                Consumo: {item['consumo_kwh']:.2f} kWh
              </div>
            </div>
            """
        )

    rows_html = []
    for item in chart_rows:
        rows_html.append(
            f"""
            <tr>
              <td>{item['casa']}</td>
              <td>{item['nombre_usuario'] or '-'}</td>
              <td>{item['consumo_kwh']:.2f}</td>
              <td>{_to_currency(item['total_factura'])}</td>
            </tr>
            """
        )

    return f"""
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    @page {{ size: A4; margin: 12mm; }}
    body {{ font-family: Arial, Helvetica, sans-serif; color: #23301a; font-size: 12px; }}
    h1 {{ margin: 0 0 6px 0; color: #3f5e31; font-size: 28px; }}
    .head {{ border-bottom: 2px solid #81943a; padding-bottom: 6px; margin-bottom: 10px; }}
    .meta {{ display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12px; margin-bottom: 10px; }}
    .block {{ border: 1px solid #d6dec5; padding: 8px; margin-bottom: 10px; page-break-inside: avoid; }}
    .block-title {{ font-size: 16px; font-weight: 700; color: #3f5e31; margin-bottom: 6px; }}
    .bar-row {{ display: grid; grid-template-columns: 180px 1fr 110px; align-items: center; gap: 8px; margin-bottom: 4px; }}
    .bar-label {{ font-size: 11px; }}
    .bar-track {{ height: 14px; background: #eef2e5; border: 1px solid #d0d8bd; border-radius: 8px; overflow: hidden; }}
    .bar-fill {{ height: 100%; background: linear-gradient(90deg, #9cb344, #b7c85b); }}
    .bar-value {{ text-align: right; font-size: 11px; font-weight: 700; }}
    table {{ width: 100%; border-collapse: collapse; }}
    th, td {{ border: 1px solid #c7cfb3; padding: 6px; font-size: 11px; }}
    th {{ background: #e8eddc; text-align: left; color: #3f5e31; }}
    .totals {{ margin-top: 6px; font-weight: 700; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }}
    .totals div {{ background: #f2f5ea; border: 1px solid #d4dcc2; padding: 6px; }}
    .photo-grid {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }}
    .photo-card {{ border: 1px solid #c6d08f; border-radius: 8px; overflow: hidden; page-break-inside: avoid; }}
    .photo-head {{ background: #a9b842; color: #fff; font-weight: 700; padding: 6px; font-size: 11px; }}
    .photo-body {{ height: 190px; background: #f5f7ef; display: flex; align-items: center; justify-content: center; }}
    .photo-body img {{ width: 100%; height: 100%; object-fit: cover; }}
    .photo-meta {{ padding: 6px; font-size: 10px; line-height: 1.3; }}
  </style>
</head>
<body>
  <div class="head">
    <h1>REPORTE POR CASAS - ENERGIA</h1>
    <div>{condominium.get('nombre', '-')}</div>
  </div>
  <div class="meta">
    <div>Periodo: {period.get('fecha_inicio', '-')} al {period.get('fecha_fin', '-')}</div>
    <div>Dias: {period.get('dias', 0)}</div>
  </div>

  <div class="block">
    <div class="block-title">Consumo por casa (grafica de barras)</div>
    {''.join(bars)}
  </div>

  <div class="block">
    <div class="block-title">Resumen por casa</div>
    <table>
      <thead>
        <tr>
          <th>Casa</th>
          <th>Usuario</th>
          <th>Consumo kWh</th>
          <th>Total factura</th>
        </tr>
      </thead>
      <tbody>
        {''.join(rows_html)}
      </tbody>
    </table>
    <div class="totals">
      <div>Total consumo: {_to_float(totals.get('Consumo kWh')):.2f} kWh</div>
      <div>Total energia: {_to_currency(totals.get('Consumo en pesos'))}</div>
      <div>Total facturacion: {_to_currency(totals.get('Total factura'))}</div>
    </div>
  </div>

  <div class="block">
    <div class="block-title">Fotografias de lecturas</div>
    <div class="photo-grid">
      {''.join(photos)}
    </div>
  </div>
</body>
</html>
"""


def build_houses_report_pdf(report: dict) -> bytes:
    chart_rows = build_houses_chart_data(report.get('rows', []))
    html = _report_html(report, chart_rows)

    try:
        from weasyprint import HTML
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f'WeasyPrint no disponible: {exc}') from exc

    return HTML(string=html, base_url=str(BASE_DIR)).write_pdf()


def _house_monthly_html(condominium: dict, period: dict, house: dict, history: list[dict]) -> str:
    max_consumo = max([_to_float(item.get('consumo_kwh')) for item in history], default=1.0)
    max_consumo = max(max_consumo, 1.0)

    bars = []
    table_rows = []
    for item in history:
        width = min(100, (_to_float(item.get('consumo_kwh')) / max_consumo) * 100)
        bars.append(
            f"""
            <div class="bar-row">
              <div class="bar-label">{item.get('mes', '-')}</div>
              <div class="bar-track"><div class="bar-fill" style="width:{width:.2f}%"></div></div>
              <div class="bar-value">{_to_float(item.get('consumo_kwh')):.2f} kWh</div>
            </div>
            """
        )
        table_rows.append(
            f"""
            <tr>
              <td>{item.get('mes', '-')}</td>
              <td>{_to_float(item.get('lectura_anterior')):.2f}</td>
              <td>{_to_float(item.get('lectura_actual')):.2f}</td>
              <td>{_to_float(item.get('consumo_kwh')):.2f}</td>
              <td>{_to_currency(item.get('total_factura'))}</td>
            </tr>
            """
        )

    return f"""
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    @page {{ size: A4; margin: 12mm; }}
    body {{ font-family: Arial, Helvetica, sans-serif; color: #23301a; font-size: 12px; }}
    .head {{ border-bottom: 2px solid #81943a; padding-bottom: 6px; margin-bottom: 12px; }}
    h1 {{ margin: 0 0 6px 0; color: #3f5e31; font-size: 24px; }}
    .meta {{ display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 12px; }}
    .box {{ border: 1px solid #d6dec5; padding: 8px; margin-bottom: 10px; page-break-inside: avoid; }}
    .title {{ font-size: 15px; font-weight: 700; color: #3f5e31; margin-bottom: 8px; }}
    .bar-row {{ display: grid; grid-template-columns: 120px 1fr 100px; align-items: center; gap: 8px; margin-bottom: 6px; }}
    .bar-track {{ height: 16px; border-radius: 8px; overflow: hidden; border: 1px solid #c9d2ad; background: #eff3e6; }}
    .bar-fill {{ height: 100%; background: linear-gradient(90deg, #8ea73a, #b7c85b); }}
    .bar-value {{ text-align: right; font-weight: 700; }}
    table {{ width: 100%; border-collapse: collapse; }}
    th, td {{ border: 1px solid #c7cfb3; padding: 6px; font-size: 11px; }}
    th {{ background: #e8eddc; color: #3f5e31; text-align: left; }}
  </style>
</head>
<body>
  <div class="head">
    <h1>REPORTE INDIVIDUAL DE ENERGIA</h1>
    <div>{condominium.get('nombre', '-')}</div>
  </div>

  <div class="meta">
    <div>Casa: {house.get('numero_casa', '-')}</div>
    <div>Usuario: {house.get('nombre_usuario', '-') or '-'}</div>
    <div>Serie medidor: {house.get('serie_medidor', '-')}</div>
    <div>Periodo de referencia: {period.get('fecha_inicio', '-')} al {period.get('fecha_fin', '-')}</div>
  </div>

  <div class="box">
    <div class="title">Consumo mensual (ultimos 6 meses)</div>
    {''.join(bars) if bars else '<p>No hay datos de consumo para esta casa.</p>'}
  </div>

  <div class="box">
    <div class="title">Detalle mensual</div>
    <table>
      <thead>
        <tr>
          <th>Mes</th>
          <th>Lectura anterior</th>
          <th>Lectura actual</th>
          <th>Consumo kWh</th>
          <th>Total factura</th>
        </tr>
      </thead>
      <tbody>
        {''.join(table_rows) if table_rows else '<tr><td colspan="5">Sin datos.</td></tr>'}
      </tbody>
    </table>
  </div>
</body>
</html>
"""


def build_house_monthly_pdf(condominium: dict, period: dict, house: dict, history: list[dict]) -> bytes:
    html = _house_monthly_html(condominium, period, house, history)
    try:
        from weasyprint import HTML
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f'WeasyPrint no disponible: {exc}') from exc
    return HTML(string=html, base_url=str(BASE_DIR)).write_pdf()
