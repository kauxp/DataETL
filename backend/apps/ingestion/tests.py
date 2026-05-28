"""
Parser unit tests for all three ingestion pipelines:
  - SAP MB51/ME2M  (CSV + XLSX)
  - Utility billing (CSV)
  - Corporate travel (CSV file upload + JSON API pull)
  - Unit normalization
"""
import io
from decimal import Decimal
from datetime import date

from django.test import TestCase

from apps.ingestion.parsers.sap_parser import (
    parse_sap_csv, parse_sap_xlsx, parse_sap_file, _classify_material,
)
from apps.ingestion.parsers.utility_parser import parse_utility_csv
from apps.ingestion.parsers.travel_parser import parse_travel_csv, parse_travel_json
from apps.ingestion.parsers.units import normalize_unit


# ---------------------------------------------------------------------------
# SAP parser
# ---------------------------------------------------------------------------

class SapCsvParserTests(TestCase):

    CSV_MINIMAL = (
        b"MBLNR;BUDAT;BWART;MATNR;MAKTX;WERKS;MENGE;MEINS\n"
        b"4900000001;20240115;201;DIESEL-001;Diesel Fuel B7;1001;2500;L\n"
    )

    def test_parses_single_row(self):
        rows = parse_sap_csv(self.CSV_MINIMAL)
        self.assertEqual(len(rows), 1)

    def test_field_values(self):
        r = parse_sap_csv(self.CSV_MINIMAL)[0]
        self.assertEqual(r['material_code'], 'DIESEL-001')
        self.assertEqual(r['quantity'], Decimal('2500'))
        self.assertEqual(r['unit'], 'L')
        self.assertEqual(r['posting_date'], date(2024, 1, 15))
        self.assertEqual(r['movement_class'], 'consumption')
        self.assertEqual(r['classification'], ('fuel', 'diesel', 1))
        self.assertEqual(r['_errors'], [])

    def test_german_date_format(self):
        csv = (
            b"MBLNR;BUDAT;BWART;MATNR;MAKTX;WERKS;MENGE;MEINS\n"
            b"4900000001;15.01.2024;201;DIESEL-001;Diesel;1001;500;L\n"
        )
        self.assertEqual(parse_sap_csv(csv)[0]['posting_date'], date(2024, 1, 15))

    def test_european_number_format(self):
        """1.234,56 is the SAP European decimal format."""
        csv = (
            b"MBLNR;BUDAT;BWART;MATNR;MAKTX;WERKS;MENGE;MEINS\n"
            b"4900000001;20240115;201;NGAS-001;Natural Gas;1001;1.234,56;M3\n"
        )
        self.assertEqual(parse_sap_csv(csv)[0]['quantity'], Decimal('1234.56'))

    def test_negative_quantity_reversed_to_positive(self):
        csv = (
            b"MBLNR;BUDAT;BWART;MATNR;MAKTX;WERKS;MENGE;MEINS\n"
            b"4900000001;20240115;201;DIESEL-001;Diesel;1001;-500;L\n"
        )
        self.assertEqual(parse_sap_csv(csv)[0]['quantity'], Decimal('500'))

    def test_unclassified_material_returns_none_classification(self):
        csv = (
            b"MBLNR;BUDAT;BWART;MATNR;MAKTX;WERKS;MENGE;MEINS\n"
            b"4900000001;20240115;201;RUBBER-001;Rubber Gaskets;1001;100;KG\n"
        )
        self.assertIsNone(parse_sap_csv(csv)[0]['classification'])

    def test_bad_date_produces_error(self):
        csv = (
            b"MBLNR;BUDAT;BWART;MATNR;MAKTX;WERKS;MENGE;MEINS\n"
            b"4900000001;NOTADATE;201;DIESEL-001;Diesel;1001;500;L\n"
        )
        r = parse_sap_csv(csv)[0]
        self.assertIsNone(r['posting_date'])
        self.assertTrue(any('posting date' in e for e in r['_errors']))

    def test_receipt_movement_type_classified(self):
        csv = (
            b"MBLNR;BUDAT;BWART;MATNR;MAKTX;WERKS;MENGE;MEINS\n"
            b"4900000001;20240115;101;DIESEL-001;Diesel;1001;500;L\n"
        )
        self.assertEqual(parse_sap_csv(csv)[0]['movement_class'], 'receipt')

    def test_leading_zeros_stripped_from_material_code(self):
        csv = (
            b"MBLNR;BUDAT;BWART;MATNR;MAKTX;WERKS;MENGE;MEINS\n"
            b"4900000001;20240115;201;000DIESEL-001;Diesel;1001;500;L\n"
        )
        self.assertEqual(parse_sap_csv(csv)[0]['material_code'], 'DIESEL-001')

    def test_raw_row_preserved(self):
        rows = parse_sap_csv(self.CSV_MINIMAL)
        self.assertIn('MBLNR', rows[0]['_raw'])


class SapMaterialClassificationTests(TestCase):
    """Verify each tracked material category is correctly identified."""

    CASES = [
        ('DIESEL-001', 'Diesel Fuel B7',         'fuel', 'diesel',      1),
        ('PETROL-001', 'Unleaded Petrol E10',     'fuel', 'petrol',      1),
        ('NGAS-001',   'Natural Gas',             'fuel', 'natural_gas', 1),
        ('LPG-001',    'LPG Propane',             'fuel', 'lpg',         1),
        ('FOIL-001',   'Heavy Fuel Oil',          'fuel', 'fuel_oil',    1),
        ('KERO-001',   'Jet Fuel AVTUR',          'fuel', 'kerosene',    1),
        ('ELEC-001',   'Electricity kWh',         'electricity', 'grid', 2),
    ]

    def test_material_classification(self):
        for code, desc, cat, subcat, scope in self.CASES:
            with self.subTest(code=code):
                result = _classify_material(code, desc)
                self.assertEqual(result, (cat, subcat, scope))

    def test_unknown_material_returns_none(self):
        self.assertIsNone(_classify_material('RUBBER-001', 'Rubber Gaskets'))


class SapXlsxParserTests(TestCase):

    def _make_xlsx(self, rows):
        """Build a minimal XLSX workbook in memory."""
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(['MBLNR', 'BUDAT', 'BWART', 'MATNR', 'MAKTX', 'WERKS', 'MENGE', 'MEINS'])
        for row in rows:
            ws.append(row)
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

    def test_xlsx_parses_diesel_row(self):
        xlsx = self._make_xlsx([
            ['4900000001', '20240115', '201', 'DIESEL-001', 'Diesel Fuel B7', '1001', '2500', 'L'],
        ])
        rows = parse_sap_xlsx(xlsx)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['material_code'], 'DIESEL-001')
        self.assertEqual(rows[0]['quantity'], Decimal('2500'))
        self.assertEqual(rows[0]['classification'], ('fuel', 'diesel', 1))

    def test_xlsx_trailing_blank_rows_skipped(self):
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(['MBLNR', 'BUDAT', 'BWART', 'MATNR', 'MAKTX', 'WERKS', 'MENGE', 'MEINS'])
        ws.append(['4900000001', '20240115', '201', 'DIESEL-001', 'Diesel', '1001', '2500', 'L'])
        ws.append([None, None, None, None, None, None, None, None])
        buf = io.BytesIO()
        wb.save(buf)
        rows = parse_sap_xlsx(buf.getvalue())
        self.assertEqual(len(rows), 1)

    def test_parse_sap_file_dispatches_xlsx_by_magic(self):
        xlsx = self._make_xlsx([
            ['4900000001', '20240115', '201', 'DIESEL-001', 'Diesel', '1001', '500', 'L'],
        ])
        rows = parse_sap_file(xlsx)
        self.assertEqual(len(rows), 1)

    def test_parse_sap_file_dispatches_csv(self):
        csv = (
            b"MBLNR;BUDAT;BWART;MATNR;MAKTX;WERKS;MENGE;MEINS\n"
            b"4900000001;20240115;201;DIESEL-001;Diesel;1001;500;L\n"
        )
        rows = parse_sap_file(csv)
        self.assertEqual(len(rows), 1)


# ---------------------------------------------------------------------------
# Utility parser
# ---------------------------------------------------------------------------

class UtilityParserTests(TestCase):

    CSV = (
        b"AccountNumber,MeterID,ServiceAddress,Facility,BillingPeriodStart,BillingPeriodEnd,"
        b"Consumption_kWh,PeakDemand_kW,TariffCode,TotalCharge,Currency,Country,Region\n"
        b"ACC-LDN-001,MTR-001-A,14 Industrial Way,London HQ,2024-01-18,2024-02-17,"
        b"51820,192,HH-BSUOS-00,12955.00,GBP,GB,UK\n"
        b"ACC-MCR-002,MTR-002-B,22 Trafford Park,Manchester WH,2024-01-22,2024-02-21,"
        b"28630,98,SME-FIXED,6433.00,GBP,GB,UK\n"
    )

    def test_parses_two_rows(self):
        self.assertEqual(len(parse_utility_csv(self.CSV)), 2)

    def test_first_row_values(self):
        r = parse_utility_csv(self.CSV)[0]
        self.assertEqual(r['account_number'], 'ACC-LDN-001')
        self.assertEqual(r['meter_id'], 'MTR-001-A')
        self.assertEqual(r['period_start'], date(2024, 1, 18))
        self.assertEqual(r['period_end'], date(2024, 2, 17))
        self.assertEqual(r['consumption'], Decimal('51820'))
        self.assertEqual(r['units'], 'kWh')
        self.assertEqual(r['_errors'], [])

    def test_unusual_period_flagged(self):
        csv = (
            b"AccountNumber,MeterID,BillingPeriodStart,BillingPeriodEnd,Consumption_kWh\n"
            b"ACC-001,MTR-001,2024-01-01,2024-06-01,50000\n"
        )
        errors = parse_utility_csv(csv)[0]['_errors']
        self.assertTrue(any('Unusual billing period' in e for e in errors))

    def test_missing_period_start_is_error(self):
        csv = (
            b"AccountNumber,MeterID,BillingPeriodStart,BillingPeriodEnd,Consumption_kWh\n"
            b"ACC-001,MTR-001,,2024-01-31,48250\n"
        )
        self.assertTrue(len(parse_utility_csv(csv)[0]['_errors']) > 0)

    def test_flexible_column_names(self):
        """Aliases like 'Account', 'Period From', 'kWh' must also parse."""
        csv = (
            b"Account,Meter,Period From,Period To,kWh,Country\n"
            b"ACC-001,MTR-001,01/01/2024,31/01/2024,48250,GB\n"
        )
        r = parse_utility_csv(csv)[0]
        self.assertEqual(r['account_number'], 'ACC-001')
        self.assertEqual(r['consumption'], Decimal('48250'))

    def test_bom_stripped(self):
        csv = (
            b'\xef\xbb\xbf'
            b"AccountNumber,MeterID,BillingPeriodStart,BillingPeriodEnd,Consumption_kWh\n"
            b"ACC-001,MTR-001,2024-01-01,2024-01-31,48250\n"
        )
        r = parse_utility_csv(csv)[0]
        self.assertEqual(r['account_number'], 'ACC-001')

    def test_semicolon_delimited_fallback(self):
        csv = (
            b"AccountNumber;MeterID;BillingPeriodStart;BillingPeriodEnd;Consumption_kWh\n"
            b"ACC-001;MTR-001;2024-01-01;2024-01-31;48250\n"
        )
        r = parse_utility_csv(csv)[0]
        self.assertEqual(r['consumption'], Decimal('48250'))


# ---------------------------------------------------------------------------
# Travel parser — CSV path
# ---------------------------------------------------------------------------

class TravelCsvParserTests(TestCase):

    CSV = (
        b"Employee ID,Expense Type,Transaction Date,From Airport,To Airport,Class,Amount,Currency\n"
        b"EMP-001,AIR,2024-01-15,LHR,JFK,Business,4850,GBP\n"
        b"EMP-001,HTL,2024-01-15,,,,1200,USD\n"
        b"EMP-001,TAXI,2024-01-22,,,,,\n"
    )

    def test_parses_rows(self):
        self.assertEqual(len(parse_travel_csv(self.CSV)), 3)

    def test_flight_values(self):
        r = parse_travel_csv(self.CSV)[0]
        self.assertEqual(r['category'], 'flight')
        self.assertEqual(r['travel_class'], 'business')
        self.assertIsNotNone(r['distance_km'])
        self.assertEqual(r['haul'], 'long_haul')
        self.assertEqual(r['subcategory'], 'business_long_haul')

    def test_hotel_category(self):
        r = parse_travel_csv(self.CSV)[1]
        self.assertEqual(r['category'], 'hotel')

    def test_bad_date_error(self):
        csv = (
            b"Employee ID,Expense Type,Transaction Date\n"
            b"EMP-001,AIR,NOTADATE\n"
        )
        r = parse_travel_csv(csv)[0]
        self.assertTrue(any('parse date' in e for e in r['_errors']))


# ---------------------------------------------------------------------------
# Travel parser — JSON API pull path
# ---------------------------------------------------------------------------

class TravelJsonParserTests(TestCase):

    def test_items_envelope(self):
        rows = parse_travel_json({'items': [
            {'expense_type': 'AIR', 'transaction_date': '2024-01-15',
             'airport_from': 'LHR', 'airport_to': 'JFK', 'travel_class': 'business'},
        ]})
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['category'], 'flight')

    def test_data_envelope(self):
        rows = parse_travel_json({'data': [
            {'expense_type': 'HTL', 'transaction_date': '2024-01-15', 'nights': 2},
        ]})
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['category'], 'hotel')

    def test_bare_list(self):
        rows = parse_travel_json([
            {'expense_type': 'TAXI', 'transaction_date': '2024-01-22', 'distance_km': 35},
        ])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['category'], 'ground_transport')

    def test_long_haul_business_flight(self):
        rows = parse_travel_json([{
            'expense_type': 'AIR', 'transaction_date': '2024-01-15',
            'airport_from': 'LHR', 'airport_to': 'JFK', 'travel_class': 'business',
        }])
        r = rows[0]
        self.assertEqual(r['subcategory'], 'business_long_haul')
        self.assertGreater(r['distance_km'], 5000)   # LHR→JFK ≈ 5540 km + 8%

    def test_short_haul_economy_flight(self):
        rows = parse_travel_json([{
            'expense_type': 'AIR', 'transaction_date': '2024-01-22',
            'airport_from': 'LHR', 'airport_to': 'FRA', 'travel_class': 'economy',
        }])
        r = rows[0]
        self.assertEqual(r['haul'], 'short_haul')
        self.assertEqual(r['subcategory'], 'economy_short_haul')

    def test_explicit_distance_used_over_computed(self):
        rows = parse_travel_json([{
            'expense_type': 'AIR', 'transaction_date': '2024-01-15',
            'airport_from': 'LHR', 'airport_to': 'JFK',
            'distance_km': 6000,  # explicit override
        }])
        self.assertAlmostEqual(rows[0]['distance_km'], 6000.0)

    def test_distance_miles_converted_to_km(self):
        rows = parse_travel_json([{
            'expense_type': 'CAR', 'transaction_date': '2024-01-01',
            'distance_miles': 50,
        }])
        self.assertAlmostEqual(rows[0]['distance_km'], 80.467, places=1)

    def test_hotel_nights_stored(self):
        rows = parse_travel_json([{
            'expense_type': 'HTL', 'transaction_date': '2024-01-15', 'nights': 3,
        }])
        self.assertEqual(rows[0]['nights'], 3)

    def test_hotel_defaults_to_1_night(self):
        rows = parse_travel_json([{
            'expense_type': 'HTL', 'transaction_date': '2024-01-15',
        }])
        self.assertEqual(rows[0]['nights'], 1)

    def test_unknown_expense_type_is_unknown_category(self):
        rows = parse_travel_json([{
            'expense_type': 'MISC', 'transaction_date': '2024-01-01',
        }])
        self.assertEqual(rows[0]['category'], 'unknown')

    def test_taxi_subcategory(self):
        rows = parse_travel_json([{
            'expense_type': 'TAXI', 'transaction_date': '2024-01-01', 'distance_km': 20,
        }])
        self.assertEqual(rows[0]['subcategory'], 'taxi')

    def test_car_rental_subcategory(self):
        rows = parse_travel_json([{
            'expense_type': 'CAR', 'transaction_date': '2024-01-01', 'distance_km': 80,
        }])
        self.assertEqual(rows[0]['subcategory'], 'car_rental')

    def test_field_name_aliases(self):
        """JSON keys like 'employeeid', 'vendordescription' should be recognised."""
        rows = parse_travel_json([{
            'expensetype': 'AIR', 'transactiondate': '2024-01-15',
            'airportfrom': 'SIN', 'airportto': 'LHR',
            'employeeid': 'EMP-999', 'vendordescription': 'Singapore Airlines',
        }])
        r = rows[0]
        self.assertEqual(r['category'], 'flight')
        self.assertEqual(r['employee_id'], 'EMP-999')
        self.assertEqual(r['vendor'], 'Singapore Airlines')

    def test_airport_not_in_table_adds_error(self):
        rows = parse_travel_json([{
            'expense_type': 'AIR', 'transaction_date': '2024-01-01',
            'airport_from': 'ZZZ', 'airport_to': 'YYY',
        }])
        self.assertTrue(any('coords not found' in e for e in rows[0]['_errors']))

    def test_amount_as_float(self):
        rows = parse_travel_json([{
            'expense_type': 'TAXI', 'transaction_date': '2024-01-01',
            'distance_km': 10, 'amount': 45.50, 'currency': 'EUR',
        }])
        from decimal import Decimal
        self.assertEqual(rows[0]['amount'], Decimal('45.5'))

    def test_empty_list(self):
        self.assertEqual(parse_travel_json([]), [])

    def test_invalid_payload_returns_empty(self):
        self.assertEqual(parse_travel_json('not a valid payload'), [])


# ---------------------------------------------------------------------------
# Unit normalization
# ---------------------------------------------------------------------------

class UnitNormalizationTests(TestCase):

    # Fuel — liquid path
    def test_diesel_litres_passthrough(self):
        val, unit = normalize_unit(Decimal('1000'), 'L', 'fuel', 'diesel')
        self.assertEqual(val, Decimal('1000'))
        self.assertEqual(unit, 'litre')

    def test_diesel_us_gallons_to_litres(self):
        val, unit = normalize_unit(Decimal('100'), 'GAL', 'fuel', 'diesel')
        self.assertAlmostEqual(float(val), 378.541, places=2)
        self.assertEqual(unit, 'litre')

    def test_diesel_kg_mass_conversion(self):
        """Mass→volume via density (diesel ≈ 0.845 kg/L)."""
        val, unit = normalize_unit(Decimal('845'), 'KG', 'fuel', 'diesel')
        self.assertAlmostEqual(float(val), 1000.0, places=1)
        self.assertEqual(unit, 'litre')

    def test_lpg_litres(self):
        val, unit = normalize_unit(Decimal('600'), 'L', 'fuel', 'lpg')
        self.assertEqual(val, Decimal('600'))
        self.assertEqual(unit, 'litre')

    # Fuel — gas path
    def test_natural_gas_m3_passthrough(self):
        val, unit = normalize_unit(Decimal('500'), 'M3', 'fuel', 'natural_gas')
        self.assertEqual(val, Decimal('500'))
        self.assertEqual(unit, 'm3')

    def test_natural_gas_kwh_to_m3(self):
        val, unit = normalize_unit(Decimal('1000'), 'KWH', 'fuel', 'natural_gas')
        self.assertAlmostEqual(float(val), 91.56, places=1)
        self.assertEqual(unit, 'm3')

    # Electricity
    def test_kwh_passthrough(self):
        val, unit = normalize_unit(Decimal('48250'), 'kWh', 'electricity')
        self.assertEqual(val, Decimal('48250'))
        self.assertEqual(unit, 'kWh')

    def test_mwh_to_kwh(self):
        val, unit = normalize_unit(Decimal('1'), 'MWH', 'electricity')
        self.assertEqual(val, Decimal('1000'))

    def test_gj_to_kwh(self):
        val, unit = normalize_unit(Decimal('1'), 'GJ', 'electricity')
        self.assertAlmostEqual(float(val), 277.778, places=2)

    # Distance
    def test_km_passthrough(self):
        val, unit = normalize_unit(Decimal('5000'), 'km', 'flight')
        self.assertEqual(val, Decimal('5000'))
        self.assertEqual(unit, 'km')

    def test_miles_to_km(self):
        val, unit = normalize_unit(Decimal('100'), 'MI', 'flight')
        self.assertAlmostEqual(float(val), 160.934, places=2)

    def test_ground_transport_km(self):
        val, unit = normalize_unit(Decimal('35'), 'km', 'ground_transport')
        self.assertEqual(val, Decimal('35'))
        self.assertEqual(unit, 'km')

    # Hotel
    def test_room_night_passthrough(self):
        val, unit = normalize_unit(Decimal('3'), 'room-night', 'hotel')
        self.assertEqual(val, Decimal('3'))
        self.assertEqual(unit, 'room-night')

    # Errors
    def test_unknown_fuel_unit_raises(self):
        with self.assertRaises(ValueError):
            normalize_unit(Decimal('1'), 'BARRELS', 'fuel', 'diesel')

    def test_unknown_electricity_unit_raises(self):
        with self.assertRaises(ValueError):
            normalize_unit(Decimal('1'), 'JOULES', 'electricity')

    def test_unknown_category_raises(self):
        with self.assertRaises(ValueError):
            normalize_unit(Decimal('1'), 'kg', 'procurement')
