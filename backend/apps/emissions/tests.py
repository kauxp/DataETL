"""
Integration tests for all three ingestion pipelines.

Each test class sets up an isolated org, user, emission factors, and data
source so the tests are fully independent of one another.
"""
from datetime import date
from decimal import Decimal
from io import BytesIO

from django.contrib.auth.models import User
from django.test import TestCase

from apps.core.models import Organization, UserProfile
from apps.emissions.models import ActivityRecord, AnomalyFlag, EmissionFactor, PlantMasterData
from apps.ingestion.models import DataSource, IngestionBatch
from apps.ingestion.services import ingest_batch, ingest_travel_json


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user_and_org(username, org_slug):
    org, _ = Organization.objects.get_or_create(
        slug=org_slug, defaults={'name': org_slug}
    )
    user, _ = User.objects.get_or_create(
        username=username, defaults={'email': f'{username}@test.com'}
    )
    UserProfile.objects.get_or_create(
        user=user, defaults={'organization': org, 'role': 'admin'}
    )
    return user, org


def _ef(category, subcategory, unit_input, factor_value):
    return EmissionFactor.objects.create(
        category=category, subcategory=subcategory, unit_input=unit_input,
        factor_value=factor_value, source='DEFRA_2023', version='2023 v1.0',
        valid_from=date(2023, 1, 1),
    )


# ---------------------------------------------------------------------------
# Minimal CSV fixtures
# ---------------------------------------------------------------------------

MINIMAL_SAP_CSV = (
    b"MBLNR;MJAHR;BUDAT;BWART;MATNR;MAKTX;WERKS;MENGE;MEINS;DMBTR;WAERS;LIFNR;NAME 1\n"
    b"5000000001;2024;15.01.2024;201;DIESEL-001;Diesel Fuel B7;1001;2500;L;3750.00;GBP;;\n"
    b"5000000002;2024;22.01.2024;201;NGAS-001;Natural Gas;1001;400;M3;280.00;GBP;;\n"
)

MINIMAL_UTILITY_CSV = (
    b"AccountNumber,MeterID,ServiceAddress,Facility,BillingPeriodStart,BillingPeriodEnd,"
    b"Consumption_kWh,PeakDemand_kW,TariffCode,TotalCharge,Currency,Country,Region\n"
    b"ACC-001,MTR-001,14 Industrial Way London,London HQ,2024-01-01,2024-01-31,"
    b"10000,50,SME-FIXED,2500.00,GBP,GB,UK\n"
)


# ---------------------------------------------------------------------------
# SAP pipeline
# ---------------------------------------------------------------------------

class SapPipelineTest(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.user, cls.org = _make_user_and_org('sap_tester', 'sap-org')
        cls.ef_diesel = _ef('fuel', 'diesel', 'litre', Decimal('2.67386'))
        cls.ef_gas    = _ef('fuel', 'natural_gas', 'm3', Decimal('2.04248'))
        cls.source = DataSource.objects.create(
            organization=cls.org, name='SAP Test Source',
            source_type='SAP', config={}, created_by=cls.user,
        )
        PlantMasterData.objects.create(
            organization=cls.org, plant_code='1001',
            plant_name='London Facility', city='London', country='GB', region='UK',
        )

    def test_batch_completed(self):
        batch = ingest_batch(self.source, MINIMAL_SAP_CSV, 'test.csv', self.user)
        self.assertEqual(batch.status, 'completed')
        self.assertEqual(batch.parsed_count, 2)
        self.assertEqual(batch.error_count, 0)

    def test_diesel_scope_1(self):
        batch = ingest_batch(self.source, MINIMAL_SAP_CSV, 'test.csv', self.user)
        rec = ActivityRecord.objects.get(batch=batch, subcategory='diesel')
        self.assertEqual(rec.scope, 1)
        self.assertEqual(rec.category, 'fuel')

    def test_diesel_co2e_calculation(self):
        """2500 L × 2.67386 kgCO2e/L = 6684.65 kgCO2e."""
        batch = ingest_batch(self.source, MINIMAL_SAP_CSV, 'test.csv', self.user)
        rec = ActivityRecord.objects.get(batch=batch, subcategory='diesel')
        expected_kg = Decimal('2500') * Decimal('2.67386')
        self.assertAlmostEqual(float(rec.co2e_kg), float(expected_kg), places=1)
        self.assertAlmostEqual(float(rec.co2e_tonnes), float(expected_kg / 1000), places=4)

    def test_natural_gas_scope_1(self):
        batch = ingest_batch(self.source, MINIMAL_SAP_CSV, 'test.csv', self.user)
        rec = ActivityRecord.objects.get(batch=batch, subcategory='natural_gas')
        self.assertEqual(rec.scope, 1)
        self.assertGreater(rec.co2e_kg, 0)

    def test_plant_lookup_enriches_facility(self):
        batch = ingest_batch(self.source, MINIMAL_SAP_CSV, 'test.csv', self.user)
        rec = ActivityRecord.objects.get(batch=batch, subcategory='diesel')
        self.assertEqual(rec.facility_name, 'London Facility')
        self.assertEqual(rec.country, 'GB')

    def test_sap_document_number_stored(self):
        batch = ingest_batch(self.source, MINIMAL_SAP_CSV, 'test.csv', self.user)
        rec = ActivityRecord.objects.get(batch=batch, subcategory='diesel')
        self.assertEqual(rec.sap_document_number, '5000000001')

    def test_emission_factor_linked(self):
        batch = ingest_batch(self.source, MINIMAL_SAP_CSV, 'test.csv', self.user)
        rec = ActivityRecord.objects.get(batch=batch, subcategory='diesel')
        self.assertEqual(rec.emission_factor, self.ef_diesel)

    def test_xlsx_auto_detected(self):
        try:
            import openpyxl
        except ImportError:
            self.skipTest('openpyxl not installed')

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(['MBLNR', 'MJAHR', 'BUDAT', 'BWART', 'MATNR', 'MAKTX', 'WERKS',
                   'MENGE', 'MEINS', 'DMBTR', 'WAERS', 'LIFNR', 'NAME 1'])
        ws.append(['5000000099', '2024', '10.02.2024', '201', 'DIESEL-001',
                   'Diesel Fuel B7', '1001', '1000', 'L', '1500.00', 'GBP', '', ''])
        buf = BytesIO()
        wb.save(buf)

        batch = ingest_batch(self.source, buf.getvalue(), 'test.xlsx', self.user)
        self.assertEqual(batch.status, 'completed')
        self.assertEqual(batch.parsed_count, 1)

    def test_spike_anomaly_flagged(self):
        """After 6 approved records at ~1 tCO2e each, a 50 000 L entry must be flagged."""
        for i in range(6):
            hist = IngestionBatch.objects.create(
                source=self.source, uploaded_by=self.user,
                status='completed', original_filename=f'hist_{i}.csv',
            )
            ActivityRecord.objects.create(
                organization=self.org, source=self.source, batch=hist,
                scope=1, category='fuel', subcategory='diesel',
                quantity=Decimal('374'), unit='litre',
                quantity_normalized=Decimal('374'), unit_normalized='litre',
                co2e_kg=Decimal('1000'), co2e_tonnes=Decimal('1.0'),
                period_start=date(2024, 1, i + 1), period_end=date(2024, 1, i + 1),
                facility_code='1001', review_status='approved',
            )

        spike_csv = (
            b"MBLNR;MJAHR;BUDAT;BWART;MATNR;MAKTX;WERKS;MENGE;MEINS;DMBTR;WAERS;LIFNR;NAME 1\n"
            b"5000099999;2024;25.03.2024;201;DIESEL-001;Diesel Fuel B7;1001;50000;L;75000.00;GBP;;\n"
        )
        batch = ingest_batch(self.source, spike_csv, 'spike.csv', self.user)
        rec = ActivityRecord.objects.get(batch=batch, subcategory='diesel')
        self.assertEqual(rec.review_status, 'flagged')
        self.assertTrue(AnomalyFlag.objects.filter(activity_record=rec, flag_type='spike').exists())


# ---------------------------------------------------------------------------
# Utility pipeline
# ---------------------------------------------------------------------------

class UtilityPipelineTest(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.user, cls.org = _make_user_and_org('util_tester', 'util-org')
        cls.ef_grid_uk = _ef('electricity', 'grid_uk', 'kWh', Decimal('0.207074'))
        cls.source = DataSource.objects.create(
            organization=cls.org, name='Utility Test Source',
            source_type='UTILITY', config={}, created_by=cls.user,
        )

    def test_batch_completed(self):
        batch = ingest_batch(self.source, MINIMAL_UTILITY_CSV, 'utility.csv', self.user)
        self.assertEqual(batch.status, 'completed')
        self.assertEqual(batch.parsed_count, 1)
        self.assertEqual(batch.error_count, 0)

    def test_scope_2_record(self):
        batch = ingest_batch(self.source, MINIMAL_UTILITY_CSV, 'utility.csv', self.user)
        rec = ActivityRecord.objects.get(batch=batch)
        self.assertEqual(rec.scope, 2)
        self.assertEqual(rec.category, 'electricity')

    def test_grid_uk_subcategory_from_gb_country(self):
        batch = ingest_batch(self.source, MINIMAL_UTILITY_CSV, 'utility.csv', self.user)
        rec = ActivityRecord.objects.get(batch=batch)
        self.assertEqual(rec.subcategory, 'grid_uk')
        self.assertEqual(rec.emission_factor, self.ef_grid_uk)

    def test_co2e_calculation(self):
        """10 000 kWh × 0.207074 kgCO2e/kWh = 2070.74 kgCO2e."""
        batch = ingest_batch(self.source, MINIMAL_UTILITY_CSV, 'utility.csv', self.user)
        rec = ActivityRecord.objects.get(batch=batch)
        expected_kg = Decimal('10000') * Decimal('0.207074')
        self.assertAlmostEqual(float(rec.co2e_kg), float(expected_kg), places=1)

    def test_meter_id_and_account_stored(self):
        batch = ingest_batch(self.source, MINIMAL_UTILITY_CSV, 'utility.csv', self.user)
        rec = ActivityRecord.objects.get(batch=batch)
        self.assertEqual(rec.meter_id, 'MTR-001')
        self.assertEqual(rec.account_number, 'ACC-001')

    def test_multi_row_all_parsed(self):
        csv = (
            b"AccountNumber,MeterID,ServiceAddress,Facility,BillingPeriodStart,BillingPeriodEnd,"
            b"Consumption_kWh,PeakDemand_kW,TariffCode,TotalCharge,Currency,Country,Region\n"
            b"ACC-A,MTR-A,Addr 1,Facility A,2024-01-01,2024-01-31,5000,20,T1,1200,GBP,GB,UK\n"
            b"ACC-B,MTR-B,Addr 2,Facility B,2024-02-01,2024-02-29,8000,35,T2,1900,GBP,GB,UK\n"
        )
        batch = ingest_batch(self.source, csv, 'multi.csv', self.user)
        self.assertEqual(batch.parsed_count, 2)
        self.assertEqual(ActivityRecord.objects.filter(batch=batch).count(), 2)


# ---------------------------------------------------------------------------
# Travel JSON API-pull pipeline
# ---------------------------------------------------------------------------

class TravelJsonPipelineTest(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.user, cls.org = _make_user_and_org('travel_tester', 'travel-org')
        _ef('flight', 'economy_short_haul',  'km', Decimal('0.15101'))
        _ef('flight', 'economy_long_haul',   'km', Decimal('0.19188'))
        _ef('flight', 'business_short_haul', 'km', Decimal('0.22652'))
        _ef('flight', 'business_long_haul',  'km', Decimal('0.57110'))
        _ef('hotel',  'hotel',         'room-night', Decimal('31.7000'))
        _ef('ground_transport', 'taxi',     'km', Decimal('0.14549'))
        _ef('ground_transport', 'car_rental','km', Decimal('0.16844'))
        cls.source = DataSource.objects.create(
            organization=cls.org, name='Concur Test Source',
            source_type='TRAVEL', config={}, created_by=cls.user,
        )

    # -- reusable item dicts (snake_case keys match _JSON_FIELD_MAP) --

    FLIGHT_LHR_JFK = {
        'employee_id': 'EMP-0042',
        'expense_type': 'AIRFR',
        'transaction_date': '2024-01-15',
        'city_from': 'London', 'city_to': 'New York',
        'airport_from': 'LHR', 'airport_to': 'JFK',
        'travel_class': 'Business',
        'amount': 4850.00, 'currency': 'GBP',
    }

    HOTEL_NYC = {
        'employee_id': 'EMP-0042',
        'expense_type': 'HTL',
        'transaction_date': '2024-01-15',
        'nights': 3,
        'vendor': 'Marriott Midtown',
        'amount': 1200.00, 'currency': 'USD',
    }

    TAXI_FRA = {
        'employee_id': 'EMP-0087',
        'expense_type': 'TAXI',
        'transaction_date': '2024-01-22',
        'city_from': 'Frankfurt Airport', 'city_to': 'Frankfurt City',
        'distance_km': 35,
        'amount': 45.00, 'currency': 'EUR',
    }

    # -- batch-level tests --

    def test_batch_uses_api_pull_filename(self):
        batch = ingest_travel_json(self.source, [self.FLIGHT_LHR_JFK], self.user)
        self.assertEqual(batch.original_filename, 'api_pull')

    def test_batch_status_completed(self):
        batch = ingest_travel_json(self.source, [self.FLIGHT_LHR_JFK], self.user)
        self.assertEqual(batch.status, 'completed')

    # -- flight tests --

    def test_flight_record_scope_3(self):
        batch = ingest_travel_json(self.source, [self.FLIGHT_LHR_JFK], self.user)
        rec = ActivityRecord.objects.get(batch=batch, category='flight')
        self.assertEqual(rec.scope, 3)

    def test_flight_lhr_jfk_classified_business_long_haul(self):
        """LHR–JFK is ~5 540 km great-circle; with 8% detour > 3 700 km → long haul."""
        batch = ingest_travel_json(self.source, [self.FLIGHT_LHR_JFK], self.user)
        rec = ActivityRecord.objects.get(batch=batch, category='flight')
        self.assertEqual(rec.subcategory, 'business_long_haul')

    def test_flight_co2e_positive(self):
        batch = ingest_travel_json(self.source, [self.FLIGHT_LHR_JFK], self.user)
        rec = ActivityRecord.objects.get(batch=batch, category='flight')
        self.assertGreater(float(rec.co2e_kg), 0)

    def test_flight_origin_destination_stored(self):
        batch = ingest_travel_json(self.source, [self.FLIGHT_LHR_JFK], self.user)
        rec = ActivityRecord.objects.get(batch=batch, category='flight')
        self.assertEqual(rec.origin, 'LHR')
        self.assertEqual(rec.destination, 'JFK')

    def test_flight_traveler_id_stored(self):
        batch = ingest_travel_json(self.source, [self.FLIGHT_LHR_JFK], self.user)
        rec = ActivityRecord.objects.get(batch=batch, category='flight')
        self.assertEqual(rec.traveler_id, 'EMP-0042')

    # -- hotel tests --

    def test_hotel_record_created(self):
        batch = ingest_travel_json(self.source, [self.HOTEL_NYC], self.user)
        rec = ActivityRecord.objects.get(batch=batch, category='hotel')
        self.assertEqual(rec.subcategory, 'hotel')
        self.assertEqual(rec.unit_normalized, 'room-night')

    def test_hotel_nights_quantity(self):
        batch = ingest_travel_json(self.source, [self.HOTEL_NYC], self.user)
        rec = ActivityRecord.objects.get(batch=batch, category='hotel')
        self.assertEqual(int(rec.quantity), 3)

    def test_hotel_co2e_calculation(self):
        """3 room-nights × 31.70 kgCO2e = 95.10 kgCO2e."""
        batch = ingest_travel_json(self.source, [self.HOTEL_NYC], self.user)
        rec = ActivityRecord.objects.get(batch=batch, category='hotel')
        expected = float(Decimal('3') * Decimal('31.7000'))
        self.assertAlmostEqual(float(rec.co2e_kg), expected, places=1)

    # -- ground transport tests --

    def test_taxi_record_created(self):
        batch = ingest_travel_json(self.source, [self.TAXI_FRA], self.user)
        rec = ActivityRecord.objects.get(batch=batch, category='ground_transport')
        self.assertEqual(rec.subcategory, 'taxi')

    def test_taxi_co2e_calculation(self):
        """35 km × 0.14549 kgCO2e/km = 5.09215 kgCO2e."""
        batch = ingest_travel_json(self.source, [self.TAXI_FRA], self.user)
        rec = ActivityRecord.objects.get(batch=batch, category='ground_transport')
        expected = float(Decimal('35') * Decimal('0.14549'))
        self.assertAlmostEqual(float(rec.co2e_kg), expected, places=1)

    # -- payload shape tests --

    def test_bare_list_payload(self):
        batch = ingest_travel_json(self.source, [self.FLIGHT_LHR_JFK, self.HOTEL_NYC], self.user)
        self.assertEqual(batch.status, 'completed')
        self.assertEqual(batch.parsed_count, 2)

    def test_concur_items_envelope(self):
        """Concur API wraps records in {"items": [...]}."""
        payload = {'items': [self.FLIGHT_LHR_JFK, self.HOTEL_NYC]}
        batch = ingest_travel_json(self.source, payload, self.user)
        self.assertEqual(batch.status, 'completed')
        self.assertEqual(batch.parsed_count, 2)

    def test_travelerk_data_envelope(self):
        """TravelPerk and similar APIs wrap records in {"data": [...]}."""
        payload = {'data': [self.TAXI_FRA]}
        batch = ingest_travel_json(self.source, payload, self.user)
        self.assertEqual(batch.status, 'completed')
        self.assertEqual(batch.parsed_count, 1)

    def test_mixed_payload_record_count(self):
        batch = ingest_travel_json(
            self.source,
            [self.FLIGHT_LHR_JFK, self.HOTEL_NYC, self.TAXI_FRA],
            self.user,
        )
        self.assertEqual(batch.parsed_count, 3)
        self.assertEqual(ActivityRecord.objects.filter(batch=batch).count(), 3)
