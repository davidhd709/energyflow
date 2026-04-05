import re
import unicodedata
from datetime import date, datetime


def _slug(value: str) -> str:
    normalized = unicodedata.normalize('NFKD', str(value or '')).encode('ascii', 'ignore').decode('ascii')
    cleaned = re.sub(r'[^a-zA-Z0-9]+', '', normalized).lower()
    return cleaned


def _period_suffix(period_end: str | date | datetime | None) -> str:
    if isinstance(period_end, datetime):
        value = period_end.date()
    elif isinstance(period_end, date):
        value = period_end
    elif isinstance(period_end, str):
        try:
            value = datetime.fromisoformat(period_end[:10]).date()
        except ValueError:
            return ''
    else:
        return ''
    return f'{value.year}{value.month:02d}'


def _house_suffix(numero_casa: str | int | None) -> str:
    raw = str(numero_casa or '').strip()
    slug = _slug(raw)
    if not slug:
        return 'sinid'
    if slug.startswith('casa') and len(slug) > 4:
        return slug[4:]
    if slug in {'zonascomunes', 'zonacomun', 'areascomunes'}:
        return 'zonascomunes'
    return slug


def energy_invoice_filename(numero_casa: str | int | None, period_end: str | date | datetime | None) -> str:
    house = _house_suffix(numero_casa)
    period = _period_suffix(period_end)
    return f'energiacasa{house}_{period}.pdf' if period else f'energiacasa{house}.pdf'


def house_report_filename(numero_casa: str | int | None, period_end: str | date | datetime | None) -> str:
    house = _house_suffix(numero_casa)
    period = _period_suffix(period_end)
    return f'reportecasa{house}_{period}.pdf' if period else f'reportecasa{house}.pdf'


def general_report_filename(period_end: str | date | datetime | None, ext: str) -> str:
    period = _period_suffix(period_end)
    safe_ext = ext.lstrip('.').lower() or 'pdf'
    return f'reportegeneral_{period}.{safe_ext}' if period else f'reportegeneral.{safe_ext}'
