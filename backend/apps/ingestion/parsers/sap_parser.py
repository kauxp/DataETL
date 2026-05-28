"""
SAP Flat-File Parser — MB51 / ME2M material document export.

Why this format:
  SAP's MB51 (Material Document List) is the standard transaction for
  reporting goods movements. Finance and sustainability teams export it
  as a text file (System → List → Save → Local File → Spreadsheet/Text)
  or as an XLSX workbook (via ALV grid export).

  We target movement type 201 (goods issue to cost center — consumption)
  for Scope 1 fuel, and 101/501 (goods receipt) for Scope 3 procurement.

Format support:
  CSV  — semicolon-delimited (SAP default text export)
  XLSX — detected by ZIP magic bytes (50 4B 03 04); used when the user
         exports via "Spreadsheet" in the SAP ALV download dialog.

Column names we expect (supports German + English variants):
  MBLNR / Material Doc      — document number
  BUDAT / Posting Date      — YYYYMMDD in SAP export
  BWART / Movement Type     — 201=consumption, 101=receipt
  MATNR / Material          — material number (up to 18 chars)
  WERKS / Plant             — 4-char plant code
  MENGE / Quantity          — European decimal (comma = decimal sep)
  MEINS / Unit              — SAP base unit of measure
  DMBTR / Amount LC         — amount in local currency (optional)
  WAERS / Currency          — currency code (optional)
  LIFNR / Vendor            — vendor number (optional)
  MAKTX / Material Desc     — material description (optional)
"""
import csv
import io
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation


COLUMN_MAP = {
    'mblnr': 'doc_number',
    'material doc': 'doc_number',
    'mat. doc.': 'doc_number',
    'budat': 'posting_date',
    'posting date': 'posting_date',
    'buchungsdatum': 'posting_date',
    'bldat': 'document_date',
    'bwart': 'movement_type',
    'movement type': 'movement_type',
    'bewegungsart': 'movement_type',
    'matnr': 'material_code',
    'material': 'material_code',
    'material number': 'material_code',
    'werks': 'plant_code',
    'plant': 'plant_code',
    'werk': 'plant_code',
    'menge': 'quantity',
    'quantity': 'quantity',
    'menge in meins': 'quantity',
    'meins': 'unit',
    'unit': 'unit',
    'base unit': 'unit',
    'basismengeneinheit': 'unit',
    'dmbtr': 'amount',
    'amount': 'amount',
    'betrag': 'amount',
    'waers': 'currency',
    'currency': 'currency',
    'währung': 'currency',
    'lifnr': 'vendor_code',
    'vendor': 'vendor_code',
    'kreditor': 'vendor_code',
    'maktx': 'material_desc',
    'material description': 'material_desc',
    'materialkurztext': 'material_desc',
    'name 1': 'vendor_name',
    'vendor name': 'vendor_name',
}

# Material categories → emission scope/category/subcategory
MATERIAL_RULES = [
    (re.compile(r'diesel|gasoil|derv', re.I),       'fuel', 'diesel',       1),
    (re.compile(r'petrol|gasoline|unleaded', re.I), 'fuel', 'petrol',       1),
    (re.compile(r'natural.?gas|erdgas|ng\b', re.I), 'fuel', 'natural_gas',  1),
    (re.compile(r'\blpg\b|propane|butane', re.I),   'fuel', 'lpg',          1),
    (re.compile(r'fuel.?oil|heizöl|heavy.?oil', re.I), 'fuel', 'fuel_oil',  1),
    (re.compile(r'kerosene|jet.?fuel|avtur', re.I), 'fuel', 'kerosene',     1),
    (re.compile(r'electric|strom|kWh', re.I),       'electricity', 'grid',  2),
]

FUEL_MOVEMENT_TYPES = {'201', '261', '551', '555'}   # consumption/issue
PROCUREMENT_MOVEMENT_TYPES = {'101', '501', '531'}   # receipts

_XLSX_MAGIC = b'PK\x03\x04'


def _parse_sap_date(value: str) -> date | None:
    value = value.strip()
    for fmt in ('%d.%m.%Y', '%Y%m%d', '%m/%d/%Y', '%Y-%m-%d', '%d/%m/%Y'):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _parse_sap_number(value: str) -> Decimal | None:
    """SAP European number format: 1.234,56 → 1234.56"""
    value = value.strip().replace(' ', '')
    if not value or value == '-':
        return None
    if ',' in value and '.' in value:
        # European: 1.234,56
        value = value.replace('.', '').replace(',', '.')
    elif ',' in value:
        value = value.replace(',', '.')
    try:
        return Decimal(value)
    except InvalidOperation:
        return None


def _classify_material(material_code: str, material_desc: str) -> tuple[str, str, int] | None:
    """Returns (category, subcategory, scope) or None if not a tracked material."""
    text = f"{material_code} {material_desc}"
    for pattern, category, subcategory, scope in MATERIAL_RULES:
        if pattern.search(text):
            return category, subcategory, scope
    return None


def _normalize_headers(row: dict) -> dict:
    result = {}
    for raw_key, value in row.items():
        normalized = raw_key.strip().lower()
        canonical = COLUMN_MAP.get(normalized)
        if canonical:
            result[canonical] = value.strip() if isinstance(value, str) else value
    return result


def _build_record(raw_row: dict) -> dict:
    """Convert a raw header→value dict into a parsed SAP record."""
    row = _normalize_headers(raw_row)
    errors = []

    quantity_raw = row.get('quantity', '')
    unit = row.get('unit', '').strip().upper()
    date_raw = row.get('posting_date', '')
    movement_type = row.get('movement_type', '').strip().zfill(3)
    plant_code = row.get('plant_code', '').strip()
    material_code = row.get('material_code', '').strip().lstrip('0')

    posting_date = _parse_sap_date(date_raw)
    if not posting_date:
        errors.append(f"Cannot parse posting date: '{date_raw}'")

    quantity = _parse_sap_number(quantity_raw)
    if quantity is None:
        errors.append(f"Cannot parse quantity: '{quantity_raw}'")

    if quantity and quantity < 0:
        quantity = abs(quantity)  # reversals come in negative; take absolute

    material_desc = row.get('material_desc', '')
    classification = _classify_material(material_code, material_desc)

    return {
        'doc_number': row.get('doc_number', ''),
        'posting_date': posting_date,
        'document_date': _parse_sap_date(row.get('document_date', '')),
        'movement_type': movement_type,
        'material_code': material_code,
        'material_desc': material_desc,
        'plant_code': plant_code,
        'quantity': quantity,
        'unit': unit,
        'amount': _parse_sap_number(row.get('amount', '')),
        'currency': row.get('currency', ''),
        'vendor_code': row.get('vendor_code', ''),
        'vendor_name': row.get('vendor_name', ''),
        'classification': classification,
        'movement_class': (
            'consumption' if movement_type in FUEL_MOVEMENT_TYPES
            else 'receipt' if movement_type in PROCUREMENT_MOVEMENT_TYPES
            else 'other'
        ),
        '_raw': dict(raw_row),
        '_errors': errors,
    }


def parse_sap_csv(file_content: bytes) -> list[dict]:
    """
    Parse SAP MB51/ME2M semicolon-delimited flat file export.

    Returns list of dicts with keys:
      doc_number, posting_date, movement_type, material_code, material_desc,
      plant_code, quantity, unit, amount, currency, vendor_code, vendor_name,
      _raw (original row dict), _errors (list of strings)
    """
    try:
        text = file_content.decode('utf-8')
    except UnicodeDecodeError:
        text = file_content.decode('latin-1')  # SAP often exports ISO-8859-1

    sample = text[:2000]
    delimiter = ';' if sample.count(';') > sample.count('\t') else '\t'

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    return [_build_record(dict(row)) for row in reader]


def parse_sap_xlsx(file_content: bytes) -> list[dict]:
    """
    Parse SAP MB51/ME2M XLSX export (ALV grid → Spreadsheet download).

    openpyxl is used in read-only mode to avoid loading the full workbook
    into memory; data_only=True discards formulas and reads cached values.
    """
    import openpyxl  # deferred: not all ingestion paths need it

    wb = openpyxl.load_workbook(io.BytesIO(file_content), read_only=True, data_only=True)
    ws = wb.active

    rows_iter = ws.iter_rows(values_only=True)
    headers = [str(h or '').strip() for h in next(rows_iter, [])]

    results = []
    for row_values in rows_iter:
        # Treat every cell as a string (SAP ALV exports numbers as numbers in XLSX)
        raw_row = {
            headers[i]: (str(v) if v is not None else '')
            for i, v in enumerate(row_values)
            if i < len(headers)
        }
        if not any(raw_row.values()):
            continue  # skip trailing blank rows
        results.append(_build_record(raw_row))

    wb.close()
    return results


def parse_sap_file(file_content: bytes) -> list[dict]:
    """Dispatch to CSV or XLSX parser based on file magic bytes."""
    if file_content[:4] == _XLSX_MAGIC:
        return parse_sap_xlsx(file_content)
    return parse_sap_csv(file_content)
