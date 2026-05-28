"""
Corporate Travel Parser — two ingestion modes.

1. CSV file upload (parse_travel_csv)
   Concur SAP expense report CSV export ("Download → Excel CSV").
   Used when the sustainability team receives a CSV from HR/finance.

2. JSON API pull (parse_travel_json)
   SaaS-native: the application pulls expense data from the travel
   platform's REST API (Concur, TravelPerk, TripActions) and receives
   a JSON response.  Each item maps 1-to-1 with an expense line.

   Expected envelope (Concur Expense Report v4 / TravelPerk-style):
     {
       "items": [
         {
           "id": "RPT001-01",
           "employee_id": "EMP042",
           "expense_type": "AIR",        // or "AIRFARE", "HTL", "CAR", …
           "transaction_date": "2024-01-15",
           "vendor": "Singapore Airlines",
           "airport_from": "SIN",
           "airport_to": "LHR",
           "city_from": "Singapore",
           "city_to": "London",
           "travel_class": "business",
           "distance_km": 10841,         // optional; computed if absent
           "nights": null,               // hotel only
           "amount": 4500.00,
           "currency": "SGD",
           "report_name": "Q1 Travel",
           "notes": ""
         }
       ]
     }

   Also accepted: bare list, or {"data": [...]}, {"expenses": [...]}.

What we handle (both modes):
  - AIR / AIRFR: flights → Scope 3 Cat 6, emission factor by class + haul
  - HTL / HOTEL: hotels → Scope 3 Cat 6, per room-night factor
  - CAR / CRNTAL: car rental → Scope 3 Cat 6, per-km factor
  - TAXI / UBER / RIDESHARE: ground transport → Scope 3 Cat 6

Distance calculation for flights:
  If distance_km is absent we compute great-circle distance via Haversine
  on a built-in IATA coordinate table and apply the ICAO +8% detour factor.

Haul classification (DEFRA 2023):
  Domestic:   < 463 km
  Short haul: 463 – 3700 km
  Long haul:  > 3700 km
"""
import csv
import io
import math
from datetime import date, datetime
from decimal import Decimal, InvalidOperation


COLUMN_MAP = {
    'expense type': 'expense_type',
    'expensetype': 'expense_type',
    'type': 'expense_type',
    'category': 'expense_type',
    'transaction date': 'transaction_date',
    'transactiondate': 'transaction_date',
    'date': 'transaction_date',
    'expense date': 'transaction_date',
    'from city': 'city_from',
    'city from': 'city_from',
    'departure city': 'city_from',
    'origin': 'city_from',
    'city_from': 'city_from',
    'to city': 'city_to',
    'city to': 'city_to',
    'arrival city': 'city_to',
    'destination': 'city_to',
    'city_to': 'city_to',
    'from airport': 'airport_from',
    'airport from': 'airport_from',
    'departure airport': 'airport_from',
    'origin airport': 'airport_from',
    'iata from': 'airport_from',
    'to airport': 'airport_to',
    'airport to': 'airport_to',
    'arrival airport': 'airport_to',
    'destination airport': 'airport_to',
    'iata to': 'airport_to',
    'amount': 'amount',
    'transaction amount': 'amount',
    'expense amount': 'amount',
    'currency': 'currency',
    'transaction currency': 'currency',
    'miles': 'distance',
    'km': 'distance',
    'kilometers': 'distance',
    'distance': 'distance',
    'distance (km)': 'distance',
    'distance (miles)': 'distance_miles',
    'class': 'travel_class',
    'cabin class': 'travel_class',
    'service class': 'travel_class',
    'employee id': 'employee_id',
    'employeeid': 'employee_id',
    'employee': 'employee_id',
    'nights': 'nights',
    'hotel nights': 'nights',
    'number of nights': 'nights',
    'report name': 'report_name',
    'expense report': 'report_name',
    'vendor': 'vendor',
    'vendor name': 'vendor',
    'airline': 'vendor',
    'hotel name': 'vendor',
    'car company': 'vendor',
    'notes': 'notes',
    'comment': 'notes',
}

# Map Concur expense type codes → our category
EXPENSE_TYPE_MAP = {
    'AIR':       ('flight', 'flight'),
    'AIRFR':     ('flight', 'flight'),
    'AIRFARE':   ('flight', 'flight'),
    'FLIGHT':    ('flight', 'flight'),
    'HTL':       ('hotel', 'hotel'),
    'HOTEL':     ('hotel', 'hotel'),
    'HOTL':      ('hotel', 'hotel'),
    'LODGING':   ('hotel', 'hotel'),
    'CAR':       ('ground_transport', 'car_rental'),
    'CRNTAL':    ('ground_transport', 'car_rental'),
    'CAR RENTAL':('ground_transport', 'car_rental'),
    'RENTAL CAR':('ground_transport', 'car_rental'),
    'TAXI':      ('ground_transport', 'taxi'),
    'TAXICAB':   ('ground_transport', 'taxi'),
    'UBER':      ('ground_transport', 'taxi'),
    'RIDESHARE': ('ground_transport', 'taxi'),
    'TRAIN':     ('ground_transport', 'rail'),
    'RAIL':      ('ground_transport', 'rail'),
    'GROUND':    ('ground_transport', 'ground'),
    'BUS':       ('ground_transport', 'bus'),
    'FERRY':     ('ground_transport', 'ferry'),
}

CLASS_MAP = {
    'economy': 'economy',
    'eco': 'economy',
    'coach': 'economy',
    'y': 'economy',
    'premium economy': 'premium_economy',
    'premium': 'premium_economy',
    'w': 'premium_economy',
    'business': 'business',
    'biz': 'business',
    'j': 'business',
    'c': 'business',
    'first': 'first',
    'first class': 'first',
    'f': 'first',
}

# IATA airport coordinates (lat, lon) — subset covering common business travel hubs
AIRPORT_COORDS = {
    'LHR': (51.477,  -0.461),  'LGW': (51.148,  -0.190),  'MAN': (53.354,  -2.275),
    'EDI': (55.950,  -3.372),  'BHX': (52.454,  -1.748),  'GLA': (55.872,  -4.433),
    'CDG': (49.009,   2.548),  'AMS': (52.308,   4.764),  'FRA': (50.033,   8.571),
    'MUC': (48.354,  11.786),  'MAD': (40.472,  -3.561),  'BCN': (41.297,   2.078),
    'FCO': (41.800,  12.239),  'ZRH': (47.458,   8.548),  'VIE': (48.110,  16.570),
    'BRU': (50.902,   4.484),  'DUB': (53.421,  -6.270),  'CPH': (55.618,  12.656),
    'ARN': (59.652,  17.919),  'OSL': (60.193,  11.100),  'HEL': (60.317,  24.963),
    'JFK': (40.640, -73.779),  'EWR': (40.693, -74.169),  'LGA': (40.777, -73.873),
    'BOS': (42.366, -71.010),  'ORD': (41.979, -87.904),  'ATL': (33.641, -84.427),
    'LAX': (33.943,-118.408),  'SFO': (37.619,-122.375),  'SEA': (47.449,-122.309),
    'DFW': (32.899, -97.038),  'MIA': (25.796, -80.287),  'DEN': (39.856,-104.674),
    'YYZ': (43.677, -79.631),  'YVR': (49.194,-123.184),  'MEX': (19.436, -99.072),
    'GRU': (-23.435,-46.473),  'GIG': (-22.810,-43.250),  'EZE': (-34.822,-58.536),
    'DXB': (25.253,  55.364),  'AUH': (24.443,  54.652),  'DOH': (25.261,  51.565),
    'BOM': (19.089,  72.868),  'DEL': (28.556,  77.100),  'BLR': (13.199,  77.706),
    'MAA': (12.990,  80.169),  'HYD': (17.231,  78.430),  'CCU': (22.655,  88.447),
    'SIN': (1.350,  103.994),  'KUL': (2.746,  101.710),  'BKK': (13.681,  100.747),
    'HKG': (22.308,  113.915), 'PVG': (31.143,  121.805), 'PEK': (40.080,  116.584),
    'NRT': (35.765,  140.386), 'HND': (35.552,  139.780), 'ICN': (37.469,  126.451),
    'SYD': (-33.946, 151.177), 'MEL': (-37.673, 144.843), 'BNE': (-27.384, 153.118),
    'CPT': (-33.965,  18.602), 'JNB': (-26.134,  28.246), 'NBO': (-1.319,  36.926),
    'CAI': (30.122,  31.406),  'LOS': (6.577,    3.321),
}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return 2 * R * math.asin(math.sqrt(a))


def get_flight_distance_km(origin: str, destination: str) -> float | None:
    o = origin.upper().strip()
    d = destination.upper().strip()
    if o in AIRPORT_COORDS and d in AIRPORT_COORDS:
        gc = haversine_km(*AIRPORT_COORDS[o], *AIRPORT_COORDS[d])
        return gc * 1.08  # +8% detour factor (ICAO methodology)
    return None


def classify_haul(distance_km: float) -> str:
    if distance_km < 463:
        return 'domestic'
    elif distance_km <= 3700:
        return 'short_haul'
    return 'long_haul'


def _parse_date(value: str) -> date | None:
    value = value.strip()
    for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y', '%d-%m-%Y', '%d.%m.%Y',
                '%m-%d-%Y', '%Y/%m/%d', '%d %b %Y', '%d %B %Y', '%b %d, %Y'):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _parse_number(value: str) -> Decimal | None:
    if not value:
        return None
    value = value.strip().replace(',', '')
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


def parse_travel_csv(file_content: bytes) -> list[dict]:
    """
    Parse Concur expense report CSV.

    Returns list of dicts with keys:
      employee_id, expense_type, category, subcategory,
      transaction_date, city_from, city_to, airport_from, airport_to,
      distance_km, travel_class, nights, amount, currency, vendor,
      notes, report_name, _raw, _errors
    """
    results = []

    try:
        text = file_content.decode('utf-8')
    except UnicodeDecodeError:
        text = file_content.decode('latin-1')

    text = text.lstrip('﻿')
    sample = text[:2000]
    delimiter = ',' if sample.count(',') >= sample.count(';') else ';'

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)

    for raw_row in reader:
        row = _normalize_headers(raw_row)
        errors = []

        expense_type_raw = row.get('expense_type', '').upper().strip()
        type_lookup = EXPENSE_TYPE_MAP.get(expense_type_raw)
        if not type_lookup:
            # Try partial match
            for key, val in EXPENSE_TYPE_MAP.items():
                if key in expense_type_raw or expense_type_raw in key:
                    type_lookup = val
                    break

        category, subcategory = type_lookup if type_lookup else ('unknown', 'unknown')

        transaction_date = _parse_date(row.get('transaction_date', ''))
        if not transaction_date:
            errors.append(f"Cannot parse date: '{row.get('transaction_date', '')}'")

        airport_from = row.get('airport_from', '').upper().strip()
        airport_to = row.get('airport_to', '').upper().strip()
        city_from = row.get('city_from', '').strip()
        city_to = row.get('city_to', '').strip()

        distance_km = None
        distance_raw = row.get('distance', '')
        distance_miles_raw = row.get('distance_miles', '')

        if distance_raw:
            d = _parse_number(distance_raw)
            if d:
                distance_km = float(d)
        elif distance_miles_raw:
            d = _parse_number(distance_miles_raw)
            if d:
                distance_km = float(d) * 1.60934

        if distance_km is None and category == 'flight':
            if airport_from and airport_to:
                distance_km = get_flight_distance_km(airport_from, airport_to)
                if distance_km is None:
                    errors.append(f"Airport coords not found for {airport_from}→{airport_to}; EF will use spend-based fallback")
            else:
                errors.append("No airport codes; cannot compute flight distance")

        travel_class_raw = row.get('travel_class', '').lower().strip()
        travel_class = CLASS_MAP.get(travel_class_raw, 'economy')

        haul = None
        if category == 'flight' and distance_km:
            haul = classify_haul(distance_km)
            subcategory = f"{travel_class}_{haul}"

        nights_raw = row.get('nights', '')
        nights = int(_parse_number(nights_raw) or 1) if category == 'hotel' else None

        results.append({
            'employee_id': row.get('employee_id', ''),
            'report_name': row.get('report_name', ''),
            'expense_type': expense_type_raw,
            'category': category,
            'subcategory': subcategory,
            'transaction_date': transaction_date,
            'city_from': city_from,
            'city_to': city_to,
            'airport_from': airport_from,
            'airport_to': airport_to,
            'distance_km': distance_km,
            'travel_class': travel_class,
            'haul': haul,
            'nights': nights,
            'amount': _parse_number(row.get('amount', '')),
            'currency': row.get('currency', ''),
            'vendor': row.get('vendor', ''),
            'notes': row.get('notes', ''),
            '_raw': dict(raw_row),
            '_errors': errors,
        })

    return results


# ---------------------------------------------------------------------------
# JSON API pull parser
# ---------------------------------------------------------------------------

# JSON field names → internal canonical names
_JSON_FIELD_MAP = {
    'id': 'id',
    'employee_id': 'employee_id',
    'employeeid': 'employee_id',
    'employee': 'employee_id',
    'expense_type': 'expense_type',
    'expensetype': 'expense_type',
    'type': 'expense_type',
    'category': 'expense_type',
    'transaction_date': 'transaction_date',
    'transactiondate': 'transaction_date',
    'date': 'transaction_date',
    'expensedate': 'transaction_date',
    'vendor': 'vendor',
    'vendordescription': 'vendor',
    'vendor_description': 'vendor',
    'airline': 'vendor',
    'hotel_name': 'vendor',
    'hotelname': 'vendor',
    'car_company': 'vendor',
    'city_from': 'city_from',
    'cityfrom': 'city_from',
    'departure_city': 'city_from',
    'origin': 'city_from',
    'city_to': 'city_to',
    'cityto': 'city_to',
    'arrival_city': 'city_to',
    'destination': 'city_to',
    'airport_from': 'airport_from',
    'airportfrom': 'airport_from',
    'departure_airport': 'airport_from',
    'iata_from': 'airport_from',
    'airport_to': 'airport_to',
    'airportto': 'airport_to',
    'arrival_airport': 'airport_to',
    'iata_to': 'airport_to',
    'travel_class': 'travel_class',
    'travelclass': 'travel_class',
    'cabin_class': 'travel_class',
    'class': 'travel_class',
    'service_class': 'travel_class',
    'distance_km': 'distance_km',
    'distancekm': 'distance_km',
    'distance': 'distance_km',
    'distance_miles': 'distance_miles',
    'nights': 'nights',
    'hotel_nights': 'nights',
    'amount': 'amount',
    'totalamount': 'amount',
    'total_amount': 'amount',
    'transaction_amount': 'amount',
    'currency': 'currency',
    'currencycode': 'currency',
    'currency_code': 'currency',
    'report_name': 'report_name',
    'reportname': 'report_name',
    'expense_report': 'report_name',
    'notes': 'notes',
    'comment': 'notes',
    'description': 'notes',
}


def _normalize_json_item(item: dict) -> dict:
    """Map arbitrary JSON keys to internal canonical keys (case-insensitive)."""
    result = {}
    for raw_key, value in item.items():
        canonical = _JSON_FIELD_MAP.get(raw_key.lower().replace(' ', '_'))
        if canonical and canonical not in result:
            result[canonical] = value
    return result


def _coerce_str(value) -> str:
    return str(value).strip() if value is not None else ''


def parse_travel_json(payload) -> list[dict]:
    """
    Parse a JSON payload from a SaaS travel platform API pull.

    Accepts:
      - {"items": [...]}  (Concur v4 / TravelPerk style)
      - {"data": [...]}
      - {"expenses": [...]}
      - A bare list of expense objects

    Returns the same structure as parse_travel_csv so downstream
    services (_process_travel_rows) work identically for both paths.
    """
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        items = (
            payload.get('items')
            or payload.get('data')
            or payload.get('expenses')
            or []
        )
    else:
        return []

    results = []
    for raw_item in items:
        if not isinstance(raw_item, dict):
            continue

        item = _normalize_json_item(raw_item)
        errors = []

        expense_type_raw = _coerce_str(item.get('expense_type')).upper()
        type_lookup = EXPENSE_TYPE_MAP.get(expense_type_raw)
        if not type_lookup:
            for key, val in EXPENSE_TYPE_MAP.items():
                if key in expense_type_raw or expense_type_raw in key:
                    type_lookup = val
                    break
        category, subcategory = type_lookup if type_lookup else ('unknown', 'unknown')

        date_raw = _coerce_str(item.get('transaction_date'))
        transaction_date = _parse_date(date_raw)
        if not transaction_date:
            errors.append(f"Cannot parse date: '{date_raw}'")

        airport_from = _coerce_str(item.get('airport_from')).upper()
        airport_to = _coerce_str(item.get('airport_to')).upper()
        city_from = _coerce_str(item.get('city_from'))
        city_to = _coerce_str(item.get('city_to'))

        distance_km = None
        raw_dist = item.get('distance_km')
        raw_dist_miles = item.get('distance_miles')
        if raw_dist is not None:
            try:
                distance_km = float(raw_dist)
            except (ValueError, TypeError):
                pass
        elif raw_dist_miles is not None:
            try:
                distance_km = float(raw_dist_miles) * 1.60934
            except (ValueError, TypeError):
                pass

        if distance_km is None and category == 'flight':
            if airport_from and airport_to:
                distance_km = get_flight_distance_km(airport_from, airport_to)
                if distance_km is None:
                    errors.append(
                        f"Airport coords not found for {airport_from}→{airport_to}; "
                        "EF will use spend-based fallback"
                    )
            else:
                errors.append("No airport codes; cannot compute flight distance")

        travel_class_raw = _coerce_str(item.get('travel_class')).lower()
        travel_class = CLASS_MAP.get(travel_class_raw, 'economy')

        haul = None
        if category == 'flight' and distance_km:
            haul = classify_haul(distance_km)
            subcategory = f"{travel_class}_{haul}"

        nights_val = item.get('nights')
        nights = None
        if category == 'hotel':
            try:
                nights = int(nights_val) if nights_val is not None else 1
            except (ValueError, TypeError):
                nights = 1

        amount_val = item.get('amount')
        amount = None
        if amount_val is not None:
            try:
                amount = Decimal(str(amount_val))
            except InvalidOperation:
                pass

        results.append({
            'employee_id': _coerce_str(item.get('employee_id')),
            'report_name': _coerce_str(item.get('report_name')),
            'expense_type': expense_type_raw,
            'category': category,
            'subcategory': subcategory,
            'transaction_date': transaction_date,
            'city_from': city_from,
            'city_to': city_to,
            'airport_from': airport_from,
            'airport_to': airport_to,
            'distance_km': distance_km,
            'travel_class': travel_class,
            'haul': haul,
            'nights': nights,
            'amount': amount,
            'currency': _coerce_str(item.get('currency')),
            'vendor': _coerce_str(item.get('vendor')),
            'notes': _coerce_str(item.get('notes')),
            '_raw': raw_item,
            '_errors': errors,
        })

    return results
