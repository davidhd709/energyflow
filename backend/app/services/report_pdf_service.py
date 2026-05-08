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


def _format_period_range(item: dict) -> str:
    """Formatea fecha_inicio y fecha_fin del periodo histórico."""
    from datetime import date as _date, datetime as _datetime

    def _fmt(value: Any) -> str:
        if value is None:
            return '-'
        if isinstance(value, _datetime):
            return value.strftime('%d/%m/%Y')
        if isinstance(value, _date):
            return value.strftime('%d/%m/%Y')
        if isinstance(value, str):
            return value[:10] if len(value) >= 10 else value
        return str(value)

    return f"{_fmt(item.get('fecha_inicio'))} – {_fmt(item.get('fecha_fin'))}"


def _house_monthly_html(condominium: dict, period: dict, house: dict, history: list[dict]) -> str:
    max_consumo = max([_to_float(item.get('consumo_kwh')) for item in history], default=1.0)
    max_consumo = max(max_consumo, 1.0)

    nombre_usuario = (house.get('nombre_usuario') or '').strip() or 'Estimado(a) usuario(a)'
    numero_casa = str(house.get('numero_casa') or '-')
    intro_text = (
        f"Sr(a) <strong>{nombre_usuario}</strong>, casa <strong>{numero_casa}</strong>. "
        f"El siguiente informe corresponde a los consumos de energía que usted ha tenido durante "
        f"los últimos 6 meses en el condominio <strong>{condominium.get('nombre', '-')}</strong>. "
        f"En cada periodo encontrará la fotografía del medidor, las lecturas registradas, el consumo "
        f"calculado, la tarifa aplicada y el valor facturado, para facilitar la verificación y "
        f"trazabilidad de su facturación."
    )

    bars = []
    cards = []
    for item in history:
        consumo = _to_float(item.get('consumo_kwh'))
        width = min(100, (consumo / max_consumo) * 100)
        bars.append(
            f"""
            <div class="bar-row">
              <div class="bar-label">{item.get('mes', '-')}</div>
              <div class="bar-track"><div class="bar-fill" style="width:{width:.2f}%"></div></div>
              <div class="bar-value">{consumo:,.2f} kWh</div>
            </div>
            """
        )

        photo_src = _image_src(item.get('foto_medidor_url'))
        photo_html = (
            f'<img src="{photo_src}" alt="Foto medidor {item.get("mes", "")}" />'
            if photo_src
            else '<div class="no-photo">Sin fotografía registrada para este periodo</div>'
        )
        tarifa = _to_float(item.get('tarifa_kwh'))
        cards.append(
            f"""
            <article class="period-card">
              <header class="period-card__head">
                <div class="period-card__month">{item.get('mes', '-')}</div>
                <div class="period-card__range">Periodo facturado: <strong>{_format_period_range(item)}</strong></div>
              </header>
              <div class="period-card__body">
                <div class="period-card__photo">{photo_html}</div>
                <dl class="period-card__data">
                  <div><dt>Lectura anterior</dt><dd>{_to_float(item.get('lectura_anterior')):,.2f}</dd></div>
                  <div><dt>Lectura actual</dt><dd>{_to_float(item.get('lectura_actual')):,.2f}</dd></div>
                  <div><dt>Consumo del periodo</dt><dd>{consumo:,.2f} kWh</dd></div>
                  <div><dt>Valor kWh aplicado</dt><dd>{_to_currency(tarifa)}</dd></div>
                  <div><dt>Días facturados</dt><dd>{int(item.get('dias') or 0)}</dd></div>
                  <div class="emph"><dt>Valor facturado</dt><dd>{_to_currency(item.get('total_factura'))}</dd></div>
                </dl>
              </div>
            </article>
            """
        )

    bars_html = ''.join(bars) if bars else '<p>No hay datos de consumo para esta casa.</p>'
    cards_html = ''.join(cards) if cards else '<p>No hay periodos registrados para esta casa.</p>'

    return f"""
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    @page {{ size: A4; margin: 12mm; }}
    body {{ font-family: Arial, Helvetica, sans-serif; color: #1f2b14; font-size: 12px; line-height: 1.4; }}
    .head {{ border-bottom: 2px solid #81943a; padding-bottom: 8px; margin-bottom: 14px; }}
    h1 {{ margin: 0 0 4px 0; color: #3f5e31; font-size: 22px; letter-spacing: .3px; }}
    .head .sub {{ color: #5b6f3a; font-weight: 700; }}
    .intro {{ background: #f4f7e8; border: 1px solid #d6dec5; padding: 10px 12px; border-radius: 6px; margin-bottom: 14px; color: #2c3a1c; }}
    .meta {{ display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; margin-bottom: 14px; font-size: 11.5px; }}
    .meta div {{ border-bottom: 1px solid #c9d2ad; padding: 3px 0; }}
    .meta .label {{ color: #3f5e31; font-weight: 700; }}
    .box {{ border: 1px solid #d6dec5; padding: 10px; margin-bottom: 14px; page-break-inside: avoid; border-radius: 4px; background: #fff; }}
    .title {{ font-size: 14px; font-weight: 800; color: #3f5e31; margin-bottom: 8px; letter-spacing: .3px; text-transform: uppercase; }}
    .bar-row {{ display: grid; grid-template-columns: 110px 1fr 100px; align-items: center; gap: 8px; margin-bottom: 6px; }}
    .bar-label {{ font-weight: 700; color: #3f5e31; font-size: 11.5px; }}
    .bar-track {{ height: 14px; border-radius: 7px; overflow: hidden; border: 1px solid #c9d2ad; background: #eff3e6; }}
    .bar-fill {{ height: 100%; background: linear-gradient(90deg, #8ea73a, #b7c85b); }}
    .bar-value {{ text-align: right; font-weight: 700; font-size: 11.5px; }}

    .period-card {{ border: 1.5px solid #b7c85b; border-radius: 8px; margin-bottom: 12px; padding: 10px 12px; background: #fff; page-break-inside: avoid; }}
    .period-card__head {{ display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px dashed #c9d2ad; }}
    .period-card__month {{ font-size: 14px; font-weight: 800; color: #3f5e31; text-transform: uppercase; letter-spacing: .4px; }}
    .period-card__range {{ font-size: 11px; color: #5b6f3a; }}
    .period-card__body {{ display: grid; grid-template-columns: 120px 1fr; gap: 12px; align-items: stretch; }}
    .period-card__photo {{ width: 120px; height: 120px; border: 2px solid #889a37; border-radius: 6px; overflow: hidden; background: #f3f4ea; display: flex; align-items: center; justify-content: center; }}
    .period-card__photo img {{ width: 100%; height: 100%; object-fit: contain; }}
    .period-card__photo .no-photo {{ font-size: 10px; color: #6b7c44; text-align: center; padding: 6px; }}
    .period-card__data {{ display: grid; grid-template-columns: 1fr 1fr; gap: 4px 14px; margin: 0; }}
    .period-card__data > div {{ display: flex; justify-content: space-between; gap: 6px; padding: 3px 0; border-bottom: 1px solid #e3ead0; font-size: 11.5px; }}
    .period-card__data dt {{ color: #5b6f3a; font-weight: 600; margin: 0; }}
    .period-card__data dd {{ color: #1f2b14; font-weight: 700; margin: 0; text-align: right; font-variant-numeric: tabular-nums; }}
    .period-card__data .emph {{ background: #f4f7e8; padding: 4px 6px; border-radius: 4px; border: 1px solid #b7c85b; }}
    .period-card__data .emph dt {{ color: #3f5e31; }}
    .period-card__data .emph dd {{ color: #2f4222; font-size: 13px; }}
  </style>
</head>
<body>
  <div class="head">
    <h1>INFORME INDIVIDUAL DE CONSUMO</h1>
    <div class="sub">{condominium.get('nombre', '-')}</div>
  </div>

  <p class="intro">{intro_text}</p>

  <div class="meta">
    <div><span class="label">Casa:</span> {numero_casa}</div>
    <div><span class="label">Usuario:</span> {nombre_usuario}</div>
    <div><span class="label">Serie medidor:</span> {house.get('serie_medidor', '-')}</div>
    <div><span class="label">Ubicación:</span> {house.get('ubicacion', '-') or '-'}</div>
  </div>

  <div class="box">
    <div class="title">Consumo mensual (últimos 6 meses)</div>
    {bars_html}
  </div>

  <div class="title" style="margin: 8px 0 8px;">Detalle por periodo</div>
  {cards_html}
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
