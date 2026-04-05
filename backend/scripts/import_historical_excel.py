import argparse
import asyncio
import math
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from secrets import token_hex
from statistics import median
from typing import Any

import pandas as pd
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings

BASE_DIR = Path(__file__).resolve().parents[1]
UPLOADS_DIR = BASE_DIR / 'static' / 'uploads' / 'meter-readings'
ALLOWED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}


@dataclass
class ImportRow:
    house_label: str
    serie_medidor: str
    serial_nuevo: str
    ubicacion: str
    lectura_actual: float
    lectura_anterior: float
    consumo: float
    fecha_inicio: datetime
    fecha_fin: datetime
    dias: int
    tarifa_kwh: float
    valor_energia: float
    valor_alumbrado: float
    total_factura: float
    es_zona_comun: bool
    foto_path: Path | None


def _normalize(value: Any) -> str:
    text = str(value or '').strip()
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'[^a-z0-9]+', '', text.lower())


def _as_text(value: Any) -> str:
    if value is None:
        return ''
    if isinstance(value, float) and math.isnan(value):
        return ''
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _parse_number(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        if isinstance(value, float) and math.isnan(value):
            return 0.0
        return float(value)

    text = _as_text(value).replace('$', '').replace('COP', '').replace('\xa0', '').replace(' ', '')
    if not text or text in {'-', '--'}:
        return 0.0

    text = re.sub(r'[^0-9,.\-]', '', text)
    if not text:
        return 0.0

    if text.count(',') and text.count('.'):
        if text.rfind(',') > text.rfind('.'):
            text = text.replace('.', '').replace(',', '.')
        else:
            text = text.replace(',', '')
    elif text.count(','):
        text = text.replace('.', '').replace(',', '.')
    elif text.count('.') > 1:
        parts = text.split('.')
        text = ''.join(parts[:-1]) + '.' + parts[-1]

    try:
        return float(text)
    except ValueError:
        return 0.0


def _parse_date(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
    parsed = pd.to_datetime(value, dayfirst=True, errors='coerce')
    if pd.isna(parsed):
        raise ValueError(f'Fecha inválida: {value}')
    return datetime(parsed.year, parsed.month, parsed.day, tzinfo=timezone.utc)


def _normalize_house(value: Any) -> tuple[str, bool]:
    raw = _as_text(value)
    raw_lower = raw.lower()
    if not raw:
        return '', False
    if 'total' in raw_lower:
        return '', False
    if raw_lower in {'zonas comunes', 'zona comun', 'zonascomunes', 'areas comunes'}:
        return 'Zonas comunes', True
    match = re.match(r'^casa\s*0*(\d+)$', raw_lower)
    if match:
        return str(int(match.group(1))), False
    if re.match(r'^\d+(\.0+)?$', raw):
        return str(int(float(raw))), False
    return raw, False


def _find_column(columns_map: dict[str, str], patterns: list[str], required: bool = True) -> str:
    for col_original, col_normalized in columns_map.items():
        if any(pattern in col_normalized for pattern in patterns):
            return col_original
    if required:
        raise ValueError(f'No se encontró columna para patrones: {patterns}')
    return ''


def _parse_date_from_header(text: str) -> datetime | None:
    if not text:
        return None

    match = re.search(r'(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})', text)
    if not match:
        return None

    day = int(match.group(1))
    month = int(match.group(2))
    year = int(match.group(3))
    if year < 100:
        year = 2000 + year

    try:
        return datetime(year, month, day, tzinfo=timezone.utc)
    except ValueError:
        return None


def _resolve_lectura_columns(columns_map: dict[str, str]) -> tuple[str, str]:
    headers = list(columns_map.keys())
    lectura_candidates = [header for header in headers if 'lectura' in columns_map[header]]

    if len(lectura_candidates) < 2:
        raise ValueError('No se encontraron suficientes columnas de lectura (mínimo 2).')

    if len(lectura_candidates) > 2:
        lectura_candidates = [
            header
            for header in lectura_candidates
            if any(token in columns_map[header] for token in ['actual', 'anterior', 'final', 'prev'])
        ] or lectura_candidates

    # Caso recomendado: los encabezados traen fechas (ej: ACTUAL 13-12-2023 / FINAL 15-01-24)
    dated_candidates = [(header, _parse_date_from_header(header)) for header in lectura_candidates]
    valid_dated = [(header, date_value) for header, date_value in dated_candidates if date_value is not None]
    if len(valid_dated) >= 2:
        valid_dated.sort(key=lambda item: item[1])
        previous_col = valid_dated[0][0]
        current_col = valid_dated[-1][0]
        return current_col, previous_col

    # Fallback semántico
    normalized_pairs = [(header, columns_map[header]) for header in lectura_candidates]
    previous_col = ''
    current_col = ''
    for header, normalized in normalized_pairs:
        if not previous_col and any(token in normalized for token in ['anterior', 'prev']):
            previous_col = header
        if not current_col and 'final' in normalized:
            current_col = header

    for header, normalized in normalized_pairs:
        if not current_col and 'actual' in normalized and header != previous_col:
            current_col = header

    if not previous_col:
        for header, normalized in normalized_pairs:
            if 'actual' in normalized and header != current_col:
                previous_col = header
                break

    if not previous_col or not current_col or previous_col == current_col:
        # Último fallback: orden de aparición en el archivo
        previous_col = lectura_candidates[0]
        current_col = lectura_candidates[1]

    return current_col, previous_col


def _copy_photo(photo_path: Path, period_end: datetime, house_label: str) -> str:
    suffix = photo_path.suffix.lower()
    if suffix not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError(f'Formato de foto no permitido: {photo_path.name}')

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    house_tag = _normalize(house_label) or 'casa'
    filename = f"hist_{period_end.year}{period_end.month:02d}_{house_tag}_{token_hex(6)}{suffix}"
    target = UPLOADS_DIR / filename
    target.write_bytes(photo_path.read_bytes())
    return f'/static/uploads/meter-readings/{filename}'


def _resolve_photo_path(raw_value: Any, excel_path: Path, photos_base: Path | None) -> Path | None:
    text = _as_text(raw_value)
    if not text:
        return None

    candidate = Path(text)
    if candidate.is_absolute() and candidate.exists():
        return candidate

    relative_excel = (excel_path.parent / candidate).resolve()
    if relative_excel.exists():
        return relative_excel

    if photos_base:
        relative_base = (photos_base / candidate).resolve()
        if relative_base.exists():
            return relative_base

    return None


def _make_unique_headers(values: list[Any]) -> list[str]:
    headers: list[str] = []
    used: dict[str, int] = {}
    for idx, raw in enumerate(values, start=1):
        base = _as_text(raw) or f'columna_{idx}'
        count = used.get(base, 0) + 1
        used[base] = count
        headers.append(base if count == 1 else f'{base}_{count}')
    return headers


def _detect_header_row(raw_df: pd.DataFrame, max_scan_rows: int = 25) -> int | None:
    best_row: int | None = None
    best_score = -1
    limit = min(max_scan_rows, len(raw_df.index))

    for row_idx in range(limit):
        row_values = raw_df.iloc[row_idx].tolist()
        normalized = [_normalize(value) for value in row_values]
        normalized = [value for value in normalized if value]
        if not normalized:
            continue

        has_casa = any(value == 'casa' or value.startswith('casa') for value in normalized)
        has_lectura = any('lectura' in value for value in normalized)
        has_fecha = any('fecha' in value for value in normalized)
        has_consumo = any('consumo' in value for value in normalized)
        has_total = any('total' in value for value in normalized)

        score = int(has_casa) * 4 + int(has_lectura) * 3 + int(has_fecha) * 2 + int(has_consumo) + int(has_total)
        if has_casa and has_lectura and score > best_score:
            best_score = score
            best_row = row_idx

    return best_row


def _read_excel_table(excel_path: Path) -> pd.DataFrame:
    raw_df = pd.read_excel(excel_path, sheet_name=0, header=None, dtype=object)
    raw_df = raw_df.dropna(axis=1, how='all').dropna(axis=0, how='all')
    if raw_df.empty:
        return raw_df

    header_row = _detect_header_row(raw_df)
    if header_row is None:
        preview = [', '.join([_as_text(cell) for cell in raw_df.iloc[i].tolist()[:8]]) for i in range(min(5, len(raw_df.index)))]
        raise ValueError(
            'No se pudo detectar la fila de encabezados (CASA, LECTURA, FECHA). '
            f'Primeras filas: {preview}'
        )

    headers = _make_unique_headers(raw_df.iloc[header_row].tolist())
    df = raw_df.iloc[header_row + 1 :].copy()
    df.columns = headers
    df = df.dropna(axis=1, how='all').dropna(axis=0, how='all')
    return df


def parse_excel_rows(excel_path: Path, photos_base: Path | None = None) -> tuple[list[ImportRow], datetime, datetime, int]:
    df = _read_excel_table(excel_path)
    if df.empty:
        raise ValueError(f'Archivo sin datos: {excel_path.name}')

    columns_map = {str(col): _normalize(col) for col in df.columns}
    col_casa = _find_column(columns_map, ['casa'])
    col_serie = _find_column(columns_map, ['seriemedidor'], required=False)
    col_serial_nuevo = _find_column(columns_map, ['serialnuevo'], required=False)
    col_ubicacion = _find_column(columns_map, ['ubicacion'], required=False)
    col_lectura_actual, col_lectura_anterior = _resolve_lectura_columns(columns_map)
    col_consumo = _find_column(columns_map, ['consumokwhdelperiodo', 'consumokwh'])
    col_fecha_inicio = _find_column(columns_map, ['fechainicial'])
    col_fecha_fin = _find_column(columns_map, ['fechafinal'])
    col_dias = _find_column(columns_map, ['cantidaddedias', 'dias'], required=False)
    col_tarifa = _find_column(columns_map, ['valordelkwhcobrado', 'valorkwh'], required=False)
    col_energia = _find_column(columns_map, ['consumodeenergiaenpesos', 'consumoenpesos'])
    col_alumbrado = _find_column(columns_map, ['impuestoalumbradopublico15', 'impuestoalumbrado'])
    col_total = _find_column(columns_map, ['totalfactura', 'totalapagar', 'total'])
    col_foto = _find_column(columns_map, ['fotopath', 'rutafoto', 'foto'], required=False)

    rows: list[ImportRow] = []
    for _, row in df.iterrows():
        house_label, is_common = _normalize_house(row.get(col_casa))
        if not house_label:
            continue

        fecha_inicio = _parse_date(row.get(col_fecha_inicio))
        fecha_fin = _parse_date(row.get(col_fecha_fin))

        lectura_anterior = _parse_number(row.get(col_lectura_anterior))
        lectura_actual = _parse_number(row.get(col_lectura_actual))
        consumo_reportado = _parse_number(row.get(col_consumo))
        consumo = consumo_reportado if consumo_reportado > 0 else max(0.0, lectura_actual - lectura_anterior)

        valor_energia = _parse_number(row.get(col_energia))
        valor_alumbrado = _parse_number(row.get(col_alumbrado))
        total_factura = _parse_number(row.get(col_total))
        tarifa_kwh = _parse_number(row.get(col_tarifa))
        dias = int(round(_parse_number(row.get(col_dias)))) if col_dias else (fecha_fin - fecha_inicio).days

        foto_path = None
        if col_foto:
            foto_path = _resolve_photo_path(row.get(col_foto), excel_path, photos_base)

        rows.append(
            ImportRow(
                house_label=house_label,
                serie_medidor=_as_text(row.get(col_serie)),
                serial_nuevo=_as_text(row.get(col_serial_nuevo)),
                ubicacion=_as_text(row.get(col_ubicacion)),
                lectura_actual=lectura_actual,
                lectura_anterior=lectura_anterior,
                consumo=consumo,
                fecha_inicio=fecha_inicio,
                fecha_fin=fecha_fin,
                dias=max(dias, 1),
                tarifa_kwh=tarifa_kwh,
                valor_energia=valor_energia,
                valor_alumbrado=valor_alumbrado,
                total_factura=total_factura,
                es_zona_comun=is_common,
                foto_path=foto_path,
            )
        )

    if not rows:
        raise ValueError(f'No se encontraron filas válidas en {excel_path.name}')

    first = rows[0]
    return rows, first.fecha_inicio, first.fecha_fin, first.dias


async def import_file(
    db,
    condominium_id: ObjectId,
    excel_path: Path,
    photos_base: Path | None,
    dry_run: bool,
    omit_common_zones: bool = False,
) -> dict[str, Any]:
    rows, fecha_inicio, fecha_fin, dias = parse_excel_rows(excel_path, photos_base)
    now = datetime.now(timezone.utc)

    period = await db.billing_periods.find_one(
        {
            'condominium_id': condominium_id,
            'fecha_inicio': fecha_inicio,
            'fecha_fin': fecha_fin,
        }
    )

    if not period and not dry_run:
        res = await db.billing_periods.insert_one(
            {
                'condominium_id': condominium_id,
                'fecha_inicio': fecha_inicio,
                'fecha_fin': fecha_fin,
                'dias': dias,
                'estado': 'calculado',
                'created_at': now,
                'updated_at': now,
            }
        )
        period = await db.billing_periods.find_one({'_id': res.inserted_id})

    if not period:
        period = {
            '_id': ObjectId(),
            'condominium_id': condominium_id,
            'fecha_inicio': fecha_inicio,
            'fecha_fin': fecha_fin,
            'dias': dias,
            'estado': 'calculado',
        }

    house_cache = {
        doc['numero_casa']: doc
        for doc in await db.houses.find({'condominium_id': condominium_id}).to_list(length=None)
    }

    imported_docs = []
    tarifas = []
    for item in rows:
        if omit_common_zones and item.es_zona_comun:
            continue

        house_doc = house_cache.get(item.house_label)
        if not house_doc and not dry_run:
            res = await db.houses.insert_one(
                {
                    'condominium_id': condominium_id,
                    'nombre_usuario': 'Zonas comunes' if item.es_zona_comun else f'Casa {item.house_label}',
                    'numero_casa': item.house_label,
                    'ubicacion': item.ubicacion,
                    'serie_medidor': item.serie_medidor,
                    'serial_nuevo': item.serial_nuevo,
                    'tipo_medidor': 'digital',
                    'es_zona_comun': item.es_zona_comun,
                    'activo': True,
                    'created_at': now,
                    'updated_at': now,
                }
            )
            house_doc = await db.houses.find_one({'_id': res.inserted_id})
            house_cache[item.house_label] = house_doc

        if not house_doc:
            house_doc = {
                '_id': ObjectId(),
                'numero_casa': item.house_label,
                'es_zona_comun': item.es_zona_comun,
            }

        if not dry_run:
            await db.houses.update_one(
                {'_id': house_doc['_id']},
                {
                    '$set': {
                        'ubicacion': item.ubicacion or house_doc.get('ubicacion', ''),
                        'serie_medidor': item.serie_medidor or house_doc.get('serie_medidor', ''),
                        'serial_nuevo': item.serial_nuevo or house_doc.get('serial_nuevo', ''),
                        'es_zona_comun': item.es_zona_comun,
                        'activo': True,
                        'updated_at': now,
                    }
                },
            )

        foto_url = ''
        if item.foto_path and item.foto_path.exists():
            try:
                foto_url = _copy_photo(item.foto_path, item.fecha_fin, item.house_label)
            except Exception as exc:
                print(f'[WARN] Foto omitida ({excel_path.name} / casa {item.house_label}): {exc}')

        reading_payload = {
            'billing_period_id': period['_id'],
            'house_id': house_doc['_id'],
            'lectura_anterior': float(item.lectura_anterior),
            'lectura_actual': float(item.lectura_actual),
            'consumo': float(item.consumo),
            'observaciones': f'Importado desde {excel_path.name}',
            'updated_at': now,
        }
        if foto_url:
            reading_payload['foto_medidor_url'] = foto_url

        if not dry_run:
            existing_reading = await db.meter_readings.find_one(
                {'billing_period_id': period['_id'], 'house_id': house_doc['_id']}
            )
            if existing_reading:
                await db.meter_readings.update_one({'_id': existing_reading['_id']}, {'$set': reading_payload})
            else:
                reading_payload['created_at'] = now
                await db.meter_readings.insert_one(reading_payload)

        tarifas.append(item.tarifa_kwh)
        imported_docs.append(
            {
                'house_id': house_doc['_id'],
                'consumo_kwh': float(item.consumo),
                'tarifa_kwh': float(item.tarifa_kwh),
                'valor_energia': float(item.valor_energia),
                'valor_alumbrado': float(item.valor_alumbrado),
                'total': float(item.total_factura),
                'es_zona_comun': bool(item.es_zona_comun),
            }
        )

    if not imported_docs:
        raise ValueError('No quedaron registros para importar (todas las filas fueron omitidas).')

    total_consumo = round(sum(item['consumo_kwh'] for item in imported_docs), 2)
    total_energia = round(sum(item['valor_energia'] for item in imported_docs), 2)
    total_alumbrado = round(sum(item['valor_alumbrado'] for item in imported_docs), 2)
    total_factura = round(sum(item['total'] for item in imported_docs), 2)
    tarifa_kwh = round(median([item for item in tarifas if item > 0]), 2) if any(item > 0 for item in tarifas) else 0.0
    valor_aseo = round(max(total_factura - (total_energia + total_alumbrado), 0.0), 2)

    if not dry_run:
        await db.supplier_invoices.update_one(
            {'billing_period_id': period['_id']},
            {
                '$set': {
                    'consumo_total_kwh': total_consumo,
                    'valor_consumo_total': total_energia,
                    'tarifa_kwh': tarifa_kwh,
                    'valor_alumbrado_total': total_alumbrado,
                    'valor_aseo': valor_aseo,
                    'total_factura': total_factura,
                    'updated_at': now,
                },
                '$setOnInsert': {'created_at': now},
            },
            upsert=True,
        )

        await db.house_invoices.delete_many({'billing_period_id': period['_id']})
        if imported_docs:
            await db.house_invoices.insert_many(
                [
                    {
                        'billing_period_id': period['_id'],
                        'house_id': item['house_id'],
                        'consumo_kwh': item['consumo_kwh'],
                        'tarifa_kwh': item['tarifa_kwh'],
                        'valor_energia': item['valor_energia'],
                        'valor_alumbrado': item['valor_alumbrado'],
                        'valor_aseo': round(
                            max(item['total'] - (item['valor_energia'] + item['valor_alumbrado']), 0.0),
                            2,
                        )
                        if item['es_zona_comun']
                        else 0.0,
                        'total': item['total'],
                        'pdf_url': None,
                        'estado_entrega': 'importado',
                        'created_at': now,
                        'updated_at': now,
                    }
                    for item in imported_docs
                ]
            )

        await db.billing_periods.update_one(
            {'_id': period['_id']},
            {'$set': {'dias': dias, 'estado': 'calculado', 'updated_at': now}},
        )

    return {
        'file': excel_path.name,
        'periodo': f'{fecha_inicio.date().isoformat()} -> {fecha_fin.date().isoformat()}',
        'casas': len(imported_docs),
        'consumo_total_kwh': total_consumo,
        'total_factura': total_factura,
        'dry_run': dry_run,
        'omit_common_zones': omit_common_zones,
    }


async def run_import(args) -> None:
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DB_NAME]

    try:
        if not ObjectId.is_valid(args.condominium_id):
            raise ValueError('condominium_id inválido')
        condominium_id = ObjectId(args.condominium_id)

        condo = await db.condominiums.find_one({'_id': condominium_id})
        if not condo:
            raise ValueError('No existe el condominio indicado')

        input_path = Path(args.input).expanduser().resolve()
        if not input_path.exists():
            raise ValueError(f'No existe la ruta: {input_path}')

        photos_base = Path(args.photos_base).expanduser().resolve() if args.photos_base else None
        if photos_base and not photos_base.exists():
            raise ValueError(f'No existe photos_base: {photos_base}')

        if input_path.is_file():
            files = [input_path]
        else:
            files = sorted([p for p in input_path.glob(args.pattern) if p.is_file()])

        if not files:
            raise ValueError('No se encontraron archivos Excel para importar')

        print(f'Condominio: {condo.get("nombre")} ({condo.get("_id")})')
        print(f'Archivos a procesar: {len(files)}')

        results = []
        for file_path in files:
            try:
                result = await import_file(
                    db=db,
                    condominium_id=condominium_id,
                    excel_path=file_path,
                    photos_base=photos_base,
                    dry_run=args.dry_run,
                    omit_common_zones=args.omit_common_zones,
                )
                results.append(result)
                print(
                    f"[OK] {result['file']} | {result['periodo']} | casas={result['casas']} | "
                    f"consumo={result['consumo_total_kwh']} | total={result['total_factura']}"
                )
            except Exception as exc:
                print(f'[ERROR] {file_path.name}: {exc}')
                if args.stop_on_error:
                    raise

        print('\nResumen:')
        print(f"Periodos procesados: {len(results)}")
        print(f"Modo simulación: {'SI' if args.dry_run else 'NO'}")
    finally:
        client.close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description='Importa histórico de facturación desde Excel al esquema de EnergyFlow.'
    )
    parser.add_argument('--condominium-id', required=True, help='ObjectId del condominio destino.')
    parser.add_argument('--input', required=True, help='Ruta de archivo .xlsx o carpeta con archivos Excel.')
    parser.add_argument('--pattern', default='*.xlsx', help='Patrón de búsqueda cuando --input es carpeta.')
    parser.add_argument(
        '--photos-base',
        default='',
        help='Carpeta base opcional para resolver rutas relativas de fotos (columna foto_path/ruta_foto).',
    )
    parser.add_argument('--dry-run', action='store_true', help='Simula la importación sin escribir en la base.')
    parser.add_argument('--omit-common-zones', action='store_true', help='Omite filas de "Zonas comunes".')
    parser.add_argument('--stop-on-error', action='store_true', help='Detiene el proceso al primer error.')
    return parser


if __name__ == '__main__':
    parser = build_parser()
    parsed_args = parser.parse_args()
    asyncio.run(run_import(parsed_args))
