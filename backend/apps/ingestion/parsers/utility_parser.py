"""
Utility (Electricity) CSV Parser.

Format choice: Green Button CSV + Urjanet-style portal export.

Why this format:
  Enterprise facilities teams typically use utility management platforms
  (Urjanet, EnergyCAP, Measurabl, or direct utility portal exports).
  These produce CSV with billing period data — NOT interval data (Green
  Button XML interval files are for 15-min smart meter readings; billing
  exports are what sustainability teams actually work with).

  Key reality: billing periods don't align with calendar months.
  A meter read on 2024-01-18 covers Nov 23 – Jan 18, not December.
  We store period_start/period_end explicitly and never aggregate by
  calendar month without accounting for this.

Expected columns (flexible matching):
  AccountNumber / Account / account_number
  MeterID / Meter / meter_id
  ServiceAddress / Address / address
  BillingPeriodStart / PeriodFrom / period_start / read_from
  BillingPeriodEnd / PeriodTo / period_end / read_to / bill_date
  Consumption_kWh / Usage(kWh) / Net kWh / kWh / consumption
  PeakDemand_kW / Demand(kW) / Peak kW / demand
  TariffCode / Rate / rate_code / tariff
  TotalCharge / Amount Due / charge / total
  Currency / currency
  Units / unit (if not kWh — some export MWh or GJ)
"""
import csv
import io
from datetime import date, datetime
from decimal import Decimal, InvalidOperation


COLUMN_MAP = {
    'accountnumber': 'account_number',
    'account number': 'account_number',
    'account': 'account_number',
    'account_number': 'account_number',
    'meterid': 'meter_id',
    'meter id': 'meter_id',
    'meter': 'meter_id',
    'meter_id': 'meter_id',
    'meter number': 'meter_id',
    'meternumber': 'meter_id',
    'serviceaddress': 'address',
    'service address': 'address',
    'address': 'address',
    'site': 'address',
    'billingperiodstart': 'period_start',
    'billing period start': 'period_start',
    'period start': 'period_start',
    'periodfrom': 'period_start',
    'period_start': 'period_start',
    'read from': 'period_start',
    'start date': 'period_start',
    'from date': 'period_start',
    'billingperiodend': 'period_end',
    'billing period end': 'period_end',
    'period end': 'period_end',
    'periodto': 'period_end',
    'period_end': 'period_end',
    'read to': 'period_end',
    'end date': 'period_end',
    'to date': 'period_end',
    'bill date': 'period_end',
    'billdate': 'period_end',
    'consumption_kwh': 'consumption',
    'usage(kwh)': 'consumption',
    'usage (kwh)': 'consumption',
    'net kwh': 'consumption',
    'kwh': 'consumption',
    'consumption': 'consumption',
    'usage': 'consumption',
    'energy(kwh)': 'consumption',
    'energy (kwh)': 'consumption',
    'peakdemand_kw': 'peak_demand_kw',
    'demand(kw)': 'peak_demand_kw',
    'demand (kw)': 'peak_demand_kw',
    'peak kw': 'peak_demand_kw',
    'demand': 'peak_demand_kw',
    'tariffcode': 'tariff_code',
    'rate code': 'tariff_code',
    'rate': 'tariff_code',
    'tariff': 'tariff_code',
    'tariff_code': 'tariff_code',
    'totalcharge': 'total_charge',
    'total charge': 'total_charge',
    'amount due': 'total_charge',
    'total': 'total_charge',
    'charge': 'total_charge',
    'amount': 'total_charge',
    'currency': 'currency',
    'units': 'units',
    'unit': 'units',
    'consumption unit': 'units',
    'facility': 'facility_name',
    'site name': 'facility_name',
    'building': 'facility_name',
    'country': 'country',
    'region': 'region',
    'grid region': 'region',
}


def _parse_date(value: str) -> date | None:
    value = value.strip()
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y', '%d.%m.%Y',
                '%Y/%m/%d', '%d %b %Y', '%d %B %Y', '%b %d, %Y'):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _parse_number(value: str) -> Decimal | None:
    if not value:
        return None
    value = value.strip().replace(',', '')  # remove thousands separator
    try:
        return Decimal(value)
    except InvalidOperation:
        return None


def _normalize_headers(row: dict) -> dict:
    result = {}
    for raw_key, value in row.items():
        normalized = raw_key.strip().lower()
        canonical = COLUMN_MAP.get(normalized)
        if canonical and canonical not in result:
            result[canonical] = value.strip() if isinstance(value, str) else value
    return result


def parse_utility_csv(file_content: bytes) -> list[dict]:
    """
    Parse utility billing export CSV.

    Returns list of dicts with keys:
      account_number, meter_id, address, facility_name, country, region,
      period_start, period_end, consumption, units, peak_demand_kw,
      tariff_code, total_charge, currency, _raw, _errors
    """
    results = []

    try:
        text = file_content.decode('utf-8')
    except UnicodeDecodeError:
        text = file_content.decode('latin-1')

    # Strip BOM if present (Excel CSV exports often have this)
    text = text.lstrip('﻿')

    sample = text[:2000]
    delimiter = ',' if sample.count(',') >= sample.count(';') else ';'

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)

    for raw_row in reader:
        row = _normalize_headers(raw_row)
        errors = []

        period_start = _parse_date(row.get('period_start', ''))
        period_end = _parse_date(row.get('period_end', ''))
        consumption_raw = row.get('consumption', '')
        units = row.get('units', 'kWh').strip() or 'kWh'

        if not period_start:
            errors.append(f"Cannot parse period_start: '{row.get('period_start', '')}'")
        if not period_end:
            errors.append(f"Cannot parse period_end: '{row.get('period_end', '')}'")
        if not period_start and not period_end:
            errors.append("Both period dates missing — skipping row")

        consumption = _parse_number(consumption_raw)
        if consumption is None:
            errors.append(f"Cannot parse consumption: '{consumption_raw}'")

        # Sanity: period should be 14–92 days (typical billing cycle)
        if period_start and period_end:
            days = (period_end - period_start).days
            if not (14 <= days <= 92):
                errors.append(f"Unusual billing period: {days} days ({period_start} to {period_end})")

        results.append({
            'account_number': row.get('account_number', ''),
            'meter_id': row.get('meter_id', ''),
            'address': row.get('address', ''),
            'facility_name': row.get('facility_name', ''),
            'country': row.get('country', ''),
            'region': row.get('region', ''),
            'period_start': period_start,
            'period_end': period_end,
            'consumption': consumption,
            'units': units,
            'peak_demand_kw': _parse_number(row.get('peak_demand_kw', '')),
            'tariff_code': row.get('tariff_code', ''),
            'total_charge': _parse_number(row.get('total_charge', '')),
            'currency': row.get('currency', ''),
            '_raw': dict(raw_row),
            '_errors': errors,
        })

    return results
