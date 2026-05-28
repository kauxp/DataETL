"""
Unit conversion to canonical base units before emission factor lookup.

Canonical units:
  Liquid fuels → litres
  Gaseous fuels → m3
  Electricity   → kWh
  Distance      → km
  Hotel nights  → room-night (already canonical)

SAP MEINS (base unit of measure) codes include both ISO and SAP-specific
codes. German SAP installations often use: L, M3, KG, TO, ST, GAL, KWH.
"""
from decimal import Decimal


LIQUID_FUEL_TO_LITRES = {
    'L':   Decimal('1'),
    'LTR': Decimal('1'),
    'GAL': Decimal('3.78541'),    # US gallon
    'UKGAL': Decimal('4.54609'),  # Imperial gallon
    'M3':  Decimal('1000'),
    'ML':  Decimal('0.001'),
    'KL':  Decimal('1000'),
}

GAS_TO_M3 = {
    'M3':   Decimal('1'),
    'KM3':  Decimal('1000'),
    'CF':   Decimal('0.028317'),  # cubic feet
    'MCF':  Decimal('28.317'),    # thousand cubic feet
    'MMBTU': Decimal('26.853'),   # natural gas: 1 MMBTU ≈ 26.853 m3
    'KWH':  Decimal('0.09156'),   # gas: 1 kWh = 0.09156 m3 (10.91 kWh/m3)
    'GJ':   Decimal('25.5'),      # 1 GJ ≈ 25.5 m3 of natural gas
}

ELECTRICITY_TO_KWH = {
    'KWH':  Decimal('1'),
    'MWH':  Decimal('1000'),
    'GWH':  Decimal('1000000'),
    'GJ':   Decimal('277.778'),   # 1 GJ = 277.778 kWh
    'MJ':   Decimal('0.27778'),
}

DISTANCE_TO_KM = {
    'KM':   Decimal('1'),
    'M':    Decimal('0.001'),
    'MI':   Decimal('1.60934'),
    'NM':   Decimal('1.852'),     # nautical miles (ICAO uses these sometimes)
}

MASS_TO_KG = {
    'KG':   Decimal('1'),
    'G':    Decimal('0.001'),
    'TO':   Decimal('1000'),      # SAP: metric tonne
    'T':    Decimal('1000'),
    'LB':   Decimal('0.453592'),
    'LBS':  Decimal('0.453592'),
    'ST':   Decimal('907.185'),   # US short ton
    'LT':   Decimal('1016.047'),  # long ton
}

# Fuel density (kg/litre) for mass→volume conversions when needed
FUEL_DENSITY_KG_PER_L = {
    'diesel':       Decimal('0.845'),
    'petrol':       Decimal('0.740'),
    'gasoline':     Decimal('0.740'),
    'lpg':          Decimal('0.540'),
    'fuel_oil':     Decimal('0.890'),
    'heavy_oil':    Decimal('0.960'),
    'kerosene':     Decimal('0.800'),
    'aviation_fuel': Decimal('0.800'),
}


def normalize_unit(value: Decimal, unit: str, category: str, subcategory: str = '') -> tuple[Decimal, str]:
    """
    Convert (value, unit) to canonical (normalized_value, canonical_unit).
    Returns (normalized_value, canonical_unit_string).
    Raises ValueError if conversion is unknown.
    """
    unit_upper = unit.upper().strip()

    if category == 'fuel':
        if subcategory in ('natural_gas', 'lpg_gas', 'biogas'):
            table = GAS_TO_M3
            canonical = 'm3'
        else:
            table = LIQUID_FUEL_TO_LITRES
            canonical = 'litre'
            if unit_upper in MASS_TO_KG:
                kg = value * MASS_TO_KG[unit_upper]
                density = FUEL_DENSITY_KG_PER_L.get(subcategory.lower(), Decimal('0.845'))
                return kg / density, canonical
        if unit_upper not in table:
            raise ValueError(f"Unknown fuel unit: {unit}")
        return value * table[unit_upper], canonical

    elif category == 'electricity':
        if unit_upper not in ELECTRICITY_TO_KWH:
            raise ValueError(f"Unknown electricity unit: {unit}")
        return value * ELECTRICITY_TO_KWH[unit_upper], 'kWh'

    elif category in ('flight', 'ground_transport'):
        if unit_upper not in DISTANCE_TO_KM:
            raise ValueError(f"Unknown distance unit: {unit}")
        return value * DISTANCE_TO_KM[unit_upper], 'km'

    elif category == 'hotel':
        # Always room-nights, no conversion needed
        return value, 'room-night'

    raise ValueError(f"Unknown category for unit normalization: {category}")
