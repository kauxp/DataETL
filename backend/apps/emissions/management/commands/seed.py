"""
Seed command: creates demo org, users, emission factors, and ingests
realistic sample files for all three source types.
"""
import os
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User

from apps.core.models import Organization, UserProfile
from apps.emissions.models import EmissionFactor, PlantMasterData
from apps.ingestion.models import DataSource
from apps.ingestion.services import ingest_batch, ingest_travel_json

SAP_CSV = b"""MBLNR;MJAHR;BUDAT;BWART;MATNR;MAKTX;WERKS;MENGE;MEINS;DMBTR;WAERS;LIFNR;NAME 1
5000012345;2024;15.01.2024;201;DIESEL-001;Diesel Fuel B7;1001;2500;L;3750.00;GBP;;
5000012346;2024;15.01.2024;201;DIESEL-001;Diesel Fuel B7;1002;1800;L;2700.00;GBP;;
5000012347;2024;22.01.2024;201;NGAS-001;Natural Gas;1001;450;M3;315.00;GBP;;
5000012348;2024;28.01.2024;201;DIESEL-001;Diesel Fuel B7;1001;3100;L;4650.00;GBP;;
5000012349;2024;05.02.2024;201;DIESEL-001;Diesel Fuel B7;1003;900;L;1350.00;GBP;;
5000012350;2024;05.02.2024;201;NGAS-001;Natural Gas;1002;320;M3;224.00;GBP;;
5000012351;2024;14.02.2024;201;DIESEL-001;Diesel Fuel B7;1001;2800;L;4200.00;GBP;;
5000012352;2024;20.02.2024;201;LPG-001;LPG Propane;1002;600;L;480.00;GBP;;
5000012353;2024;28.02.2024;201;DIESEL-001;Diesel Fuel B7;1001;2650;L;3975.00;GBP;;
5000012354;2024;06.03.2024;201;DIESEL-001;Diesel Fuel B7;1002;2100;L;3150.00;GBP;;
5000012355;2024;06.03.2024;201;NGAS-001;Natural Gas;1001;510;M3;357.00;GBP;;
5000012356;2024;18.03.2024;201;DIESEL-001;Diesel Fuel B7;1003;750;L;1125.00;GBP;;
5000012357;2024;25.03.2024;201;DIESEL-001;Diesel Fuel B7;1001;9500;L;14250.00;GBP;;
5000012358;2024;31.03.2024;201;NGAS-001;Natural Gas;1002;290;M3;203.00;GBP;;
5000012359;2024;08.04.2024;201;DIESEL-001;Diesel Fuel B7;1001;2700;L;4050.00;GBP;;
5000012360;2024;15.04.2024;201;PETROL-001;Unleaded Petrol E10;1001;450;L;675.00;GBP;;
5000012361;2024;22.04.2024;201;DIESEL-001;Diesel Fuel B7;1002;1950;L;2925.00;GBP;;
5000012362;2024;30.04.2024;201;NGAS-001;Natural Gas;1001;480;M3;336.00;GBP;;
5000012363;2024;07.05.2024;201;DIESEL-001;Diesel Fuel B7;1001;2550;L;3825.00;GBP;;
5000012364;2024;15.05.2024;201;DIESEL-001;Diesel Fuel B7;1003;850;L;1275.00;GBP;;
"""

UTILITY_CSV = b"""AccountNumber,MeterID,ServiceAddress,Facility,BillingPeriodStart,BillingPeriodEnd,Consumption_kWh,PeakDemand_kW,TariffCode,TotalCharge,Currency,Country,Region
ACC-LDN-001,MTR-001-A,14 Industrial Way London E1 6RF,London HQ,2023-12-18,2024-01-17,48250,185,HH-BSUOS-00,12063.00,GBP,GB,UK
ACC-LDN-001,MTR-001-A,14 Industrial Way London E1 6RF,London HQ,2024-01-18,2024-02-17,51820,192,HH-BSUOS-00,12955.00,GBP,GB,UK
ACC-LDN-001,MTR-001-A,14 Industrial Way London E1 6RF,London HQ,2024-02-18,2024-03-19,46940,178,HH-BSUOS-00,11735.00,GBP,GB,UK
ACC-LDN-001,MTR-001-A,14 Industrial Way London E1 6RF,London HQ,2024-03-20,2024-04-18,39120,155,HH-BSUOS-00,9780.00,GBP,GB,UK
ACC-LDN-001,MTR-001-A,14 Industrial Way London E1 6RF,London HQ,2024-04-19,2024-05-18,35680,142,HH-BSUOS-00,8920.00,GBP,GB,UK
ACC-MCR-002,MTR-002-B,22 Trafford Park Manchester M17 1PZ,Manchester Warehouse,2023-12-22,2024-01-21,28630,98,SME-FIXED,6433.00,GBP,GB,UK
ACC-MCR-002,MTR-002-B,22 Trafford Park Manchester M17 1PZ,Manchester Warehouse,2024-01-22,2024-02-21,31240,105,SME-FIXED,7029.00,GBP,GB,UK
ACC-MCR-002,MTR-002-B,22 Trafford Park Manchester M17 1PZ,Manchester Warehouse,2024-02-22,2024-03-23,29150,101,SME-FIXED,6559.00,GBP,GB,UK
ACC-MCR-002,MTR-002-B,22 Trafford Park Manchester M17 1PZ,Manchester Warehouse,2024-03-24,2024-04-22,22840,87,SME-FIXED,5138.00,GBP,GB,UK
ACC-MCR-002,MTR-002-B,22 Trafford Park Manchester M17 1PZ,Manchester Warehouse,2024-04-23,2024-05-22,19950,76,SME-FIXED,4489.00,GBP,GB,UK
ACC-EDI-003,MTR-003-C,7 Newbridge Road Edinburgh EH28 8PL,Edinburgh Office,2024-01-05,2024-02-04,8420,42,SME-DUoS,1894.50,GBP,GB,UK
ACC-EDI-003,MTR-003-C,7 Newbridge Road Edinburgh EH28 8PL,Edinburgh Office,2024-02-05,2024-03-06,7980,39,SME-DUoS,1795.50,GBP,GB,UK
ACC-EDI-003,MTR-003-C,7 Newbridge Road Edinburgh EH28 8PL,Edinburgh Office,2024-03-07,2024-04-05,7140,36,SME-DUoS,1606.50,GBP,GB,UK
ACC-EDI-003,MTR-003-C,7 Newbridge Road Edinburgh EH28 8PL,Edinburgh Office,2024-04-06,2024-05-06,5890,31,SME-DUoS,1325.25,GBP,GB,UK
"""

# Travel data as JSON — mirrors the Concur Expense Report v4 API response envelope.
# This is the SaaS-native path: the app pulls JSON from the travel platform rather
# than receiving a CSV export, so we use ingest_travel_json() below.
TRAVEL_JSON_PAYLOAD = {
    "items": [
        # Smith J — NYC trip (Jan)
        {"employee_id": "EMP-0042", "expense_type": "AIRFR", "transaction_date": "2024-01-15",
         "city_from": "London", "city_to": "New York", "airport_from": "LHR", "airport_to": "JFK",
         "travel_class": "Business", "amount": 4850.00, "currency": "GBP",
         "vendor": "British Airways", "report_name": "Q1 Travel-Smith J"},
        {"employee_id": "EMP-0042", "expense_type": "HTL", "transaction_date": "2024-01-15",
         "nights": 3, "vendor": "Marriott Midtown", "amount": 1200.00, "currency": "USD",
         "report_name": "Q1 Travel-Smith J"},
        {"employee_id": "EMP-0042", "expense_type": "AIRFR", "transaction_date": "2024-01-18",
         "city_from": "New York", "city_to": "London", "airport_from": "JFK", "airport_to": "LHR",
         "travel_class": "Business", "amount": 4850.00, "currency": "GBP",
         "vendor": "British Airways", "report_name": "Q1 Travel-Smith J"},
        # Jones A — Frankfurt trip (Jan)
        {"employee_id": "EMP-0087", "expense_type": "AIRFR", "transaction_date": "2024-01-22",
         "city_from": "London", "city_to": "Frankfurt", "airport_from": "LHR", "airport_to": "FRA",
         "travel_class": "Economy", "amount": 280.00, "currency": "GBP",
         "vendor": "Lufthansa", "report_name": "Q1 Travel-Jones A"},
        {"employee_id": "EMP-0087", "expense_type": "TAXI", "transaction_date": "2024-01-22",
         "city_from": "Frankfurt Airport", "city_to": "Frankfurt City",
         "distance_km": 35, "amount": 45.00, "currency": "EUR",
         "vendor": "Taxi", "report_name": "Q1 Travel-Jones A"},
        {"employee_id": "EMP-0087", "expense_type": "HTL", "transaction_date": "2024-01-22",
         "nights": 1, "vendor": "Marriott Frankfurt", "amount": 180.00, "currency": "EUR",
         "report_name": "Q1 Travel-Jones A"},
        {"employee_id": "EMP-0087", "expense_type": "AIRFR", "transaction_date": "2024-01-23",
         "city_from": "Frankfurt", "city_to": "London", "airport_from": "FRA", "airport_to": "LHR",
         "travel_class": "Economy", "amount": 280.00, "currency": "GBP",
         "vendor": "Lufthansa", "report_name": "Q1 Travel-Jones A"},
        # Patel R — Mumbai trip (Feb)
        {"employee_id": "EMP-0134", "expense_type": "AIRFR", "transaction_date": "2024-02-05",
         "city_from": "London", "city_to": "Mumbai", "airport_from": "LHR", "airport_to": "BOM",
         "travel_class": "Economy", "amount": 620.00, "currency": "GBP",
         "vendor": "Air India", "report_name": "Q1 Travel-Patel R"},
        {"employee_id": "EMP-0134", "expense_type": "HTL", "transaction_date": "2024-02-05",
         "nights": 4, "vendor": "Taj Lands End", "amount": 480.00, "currency": "GBP",
         "report_name": "Q1 Travel-Patel R"},
        {"employee_id": "EMP-0134", "expense_type": "AIRFR", "transaction_date": "2024-02-09",
         "city_from": "Mumbai", "city_to": "London", "airport_from": "BOM", "airport_to": "LHR",
         "travel_class": "Economy", "amount": 620.00, "currency": "GBP",
         "vendor": "Air India", "report_name": "Q1 Travel-Patel R"},
        # Chen L — Manchester + Singapore (Feb)
        {"employee_id": "EMP-0201", "expense_type": "CAR", "transaction_date": "2024-02-12",
         "city_from": "Manchester", "city_to": "Liverpool",
         "distance_km": 80, "amount": 85.00, "currency": "GBP",
         "vendor": "Enterprise", "report_name": "Q1 Travel-Chen L"},
        {"employee_id": "EMP-0201", "expense_type": "AIRFR", "transaction_date": "2024-02-19",
         "city_from": "London", "city_to": "Singapore", "airport_from": "LHR", "airport_to": "SIN",
         "travel_class": "Business", "amount": 3200.00, "currency": "GBP",
         "vendor": "Singapore Airlines", "report_name": "Q1 Travel-Chen L"},
        {"employee_id": "EMP-0201", "expense_type": "HTL", "transaction_date": "2024-02-19",
         "nights": 3, "vendor": "Marina Bay Sands", "amount": 2100.00, "currency": "SGD",
         "report_name": "Q1 Travel-Chen L"},
        {"employee_id": "EMP-0201", "expense_type": "AIRFR", "transaction_date": "2024-02-22",
         "city_from": "Singapore", "city_to": "London", "airport_from": "SIN", "airport_to": "LHR",
         "travel_class": "Business", "amount": 3200.00, "currency": "GBP",
         "vendor": "Singapore Airlines", "report_name": "Q1 Travel-Chen L"},
        # Brown K — Amsterdam (Mar)
        {"employee_id": "EMP-0055", "expense_type": "AIRFR", "transaction_date": "2024-03-04",
         "city_from": "London", "city_to": "Amsterdam", "airport_from": "LHR", "airport_to": "AMS",
         "travel_class": "Economy", "amount": 195.00, "currency": "GBP",
         "vendor": "KLM", "report_name": "Q1 Travel-Brown K"},
        {"employee_id": "EMP-0055", "expense_type": "TAXI", "transaction_date": "2024-03-04",
         "city_from": "Amsterdam Airport", "city_to": "Amsterdam City",
         "distance_km": 18, "amount": 32.00, "currency": "EUR",
         "vendor": "Taxi", "report_name": "Q1 Travel-Brown K"},
        {"employee_id": "EMP-0055", "expense_type": "HTL", "transaction_date": "2024-03-04",
         "nights": 1, "vendor": "NH Collection", "amount": 220.00, "currency": "EUR",
         "report_name": "Q1 Travel-Brown K"},
        {"employee_id": "EMP-0055", "expense_type": "AIRFR", "transaction_date": "2024-03-05",
         "city_from": "Amsterdam", "city_to": "London", "airport_from": "AMS", "airport_to": "LHR",
         "travel_class": "Economy", "amount": 195.00, "currency": "GBP",
         "vendor": "KLM", "report_name": "Q1 Travel-Brown K"},
        # Smith J — Dubai (Mar)
        {"employee_id": "EMP-0042", "expense_type": "AIRFR", "transaction_date": "2024-03-11",
         "city_from": "London", "city_to": "Dubai", "airport_from": "LHR", "airport_to": "DXB",
         "travel_class": "Business", "amount": 1800.00, "currency": "GBP",
         "vendor": "Emirates", "report_name": "Q1 Travel-Smith J"},
        {"employee_id": "EMP-0042", "expense_type": "HTL", "transaction_date": "2024-03-11",
         "nights": 2, "vendor": "Address Dubai Marina", "amount": 800.00, "currency": "AED",
         "report_name": "Q1 Travel-Smith J"},
        {"employee_id": "EMP-0042", "expense_type": "AIRFR", "transaction_date": "2024-03-13",
         "city_from": "Dubai", "city_to": "London", "airport_from": "DXB", "airport_to": "LHR",
         "travel_class": "Business", "amount": 1800.00, "currency": "GBP",
         "vendor": "Emirates", "report_name": "Q1 Travel-Smith J"},
        # Wilson T — Birmingham (Mar)
        {"employee_id": "EMP-0312", "expense_type": "CAR", "transaction_date": "2024-03-18",
         "city_from": "London", "city_to": "Birmingham",
         "distance_km": 185, "amount": 142.00, "currency": "GBP",
         "vendor": "Hertz", "report_name": "Q1 Travel-Wilson T"},
        # Garcia M — Tokyo (Apr)
        {"employee_id": "EMP-0445", "expense_type": "AIRFR", "transaction_date": "2024-04-07",
         "city_from": "London", "city_to": "Tokyo", "airport_from": "LHR", "airport_to": "NRT",
         "travel_class": "Economy", "amount": 890.00, "currency": "GBP",
         "vendor": "ANA", "report_name": "Q1 Travel-Garcia M"},
        {"employee_id": "EMP-0445", "expense_type": "HTL", "transaction_date": "2024-04-07",
         "nights": 5, "vendor": "Park Hyatt Tokyo", "amount": 3500.00, "currency": "JPY",
         "report_name": "Q1 Travel-Garcia M"},
        {"employee_id": "EMP-0445", "expense_type": "AIRFR", "transaction_date": "2024-04-12",
         "city_from": "Tokyo", "city_to": "London", "airport_from": "NRT", "airport_to": "LHR",
         "travel_class": "Economy", "amount": 890.00, "currency": "GBP",
         "vendor": "ANA", "report_name": "Q1 Travel-Garcia M"},
    ]
}


EMISSION_FACTORS = [
    # Scope 1 — Fuel (DEFRA 2023)
    dict(category='fuel', subcategory='diesel', unit_input='litre', factor_value='2.67386',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 GHG conversion factors — diesel combustion'),
    dict(category='fuel', subcategory='petrol', unit_input='litre', factor_value='2.31360',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 — petrol/gasoline combustion'),
    dict(category='fuel', subcategory='natural_gas', unit_input='m3', factor_value='2.04248',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 — natural gas combustion per m3 (39 MJ/m3 gross CV)'),
    dict(category='fuel', subcategory='lpg', unit_input='litre', factor_value='1.55540',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 — LPG combustion'),
    dict(category='fuel', subcategory='fuel_oil', unit_input='litre', factor_value='3.17839',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 — fuel oil combustion'),
    dict(category='fuel', subcategory='kerosene', unit_input='litre', factor_value='2.53986',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 — kerosene combustion'),

    # Scope 2 — Electricity grid (location-based, DEFRA 2023 / IEA 2022)
    dict(category='electricity', subcategory='grid_uk', unit_input='kWh', factor_value='0.207074',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 UK grid intensity — location-based Scope 2'),
    dict(category='electricity', subcategory='grid_us', unit_input='kWh', factor_value='0.386000',
         source='EPA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='EPA eGRID 2023 US national average'),
    dict(category='electricity', subcategory='grid_eu', unit_input='kWh', factor_value='0.276000',
         source='IEA_2022', version='2022 v1.0', valid_from='2022-01-01',
         notes='IEA 2022 EU-27 average grid intensity'),

    # Scope 3 — Flights (DEFRA 2023 per passenger-km, including RFI factor of 1.891)
    dict(category='flight', subcategory='economy_domestic', unit_input='km', factor_value='0.25397',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 — economy domestic flight per passenger-km incl. RFI 1.891'),
    dict(category='flight', subcategory='economy_short_haul', unit_input='km', factor_value='0.15101',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 — economy short-haul (<3700km) per passenger-km incl. RFI'),
    dict(category='flight', subcategory='economy_long_haul', unit_input='km', factor_value='0.19188',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 — economy long-haul (>3700km) per passenger-km incl. RFI'),
    dict(category='flight', subcategory='premium_economy_short_haul', unit_input='km', factor_value='0.22652',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 — premium economy short-haul per passenger-km'),
    dict(category='flight', subcategory='premium_economy_long_haul', unit_input='km', factor_value='0.28783',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 — premium economy long-haul per passenger-km'),
    dict(category='flight', subcategory='business_short_haul', unit_input='km', factor_value='0.22652',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 — business short-haul per passenger-km'),
    dict(category='flight', subcategory='business_long_haul', unit_input='km', factor_value='0.57110',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 — business long-haul per passenger-km incl. RFI'),
    dict(category='flight', subcategory='first_long_haul', unit_input='km', factor_value='0.85665',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 — first class long-haul per passenger-km incl. RFI'),

    # Scope 3 — Hotel (DEFRA 2023 per room-night)
    dict(category='hotel', subcategory='hotel', unit_input='room-night', factor_value='31.7000',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 — hotel stay per room-night, kgCO2e'),

    # Scope 3 — Ground transport (DEFRA 2023 per km)
    dict(category='ground_transport', subcategory='taxi', unit_input='km', factor_value='0.14549',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 — taxi per passenger-km'),
    dict(category='ground_transport', subcategory='car_rental', unit_input='km', factor_value='0.16844',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 — average car per km (average fleet)'),
    dict(category='ground_transport', subcategory='rail', unit_input='km', factor_value='0.03549',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 — national rail per passenger-km'),
    dict(category='ground_transport', subcategory='ground', unit_input='km', factor_value='0.16844',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='Fallback ground transport EF'),
    dict(category='ground_transport', subcategory='bus', unit_input='km', factor_value='0.10279',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 — local/national bus per passenger-km'),
    dict(category='ground_transport', subcategory='ferry', unit_input='km', factor_value='0.11342',
         source='DEFRA_2023', version='2023 v1.0', valid_from='2023-01-01',
         notes='DEFRA 2023 — foot passenger ferry per km'),
]


class Command(BaseCommand):
    help = 'Seed demo data: org, users, EFs, and realistic sample ingestions'

    def handle(self, *args, **options):
        self.stdout.write('Creating emission factors...')
        for ef_data in EMISSION_FACTORS:
            from datetime import date
            ef_data['valid_from'] = date.fromisoformat(ef_data['valid_from'])
            EmissionFactor.objects.get_or_create(
                category=ef_data['category'],
                subcategory=ef_data['subcategory'],
                unit_input=ef_data['unit_input'],
                source=ef_data['source'],
                version=ef_data['version'],
                defaults={k: v for k, v in ef_data.items()
                          if k not in ('category', 'subcategory', 'unit_input', 'source', 'version')},
            )
        self.stdout.write(f'  {EmissionFactor.objects.count()} emission factors loaded')

        self.stdout.write('Creating demo organization...')
        org, _ = Organization.objects.get_or_create(
            slug='acme-manufacturing',
            defaults={'name': 'ACME Manufacturing Ltd'},
        )

        self.stdout.write('Creating plant master data...')
        plants = [
            ('1001', 'London Production Facility', 'London', 'GB', 'UK'),
            ('1002', 'Manchester Warehouse', 'Manchester', 'GB', 'UK'),
            ('1003', 'Edinburgh Office', 'Edinburgh', 'GB', 'UK'),
        ]
        for code, name, city, country, region in plants:
            PlantMasterData.objects.get_or_create(
                organization=org, plant_code=code,
                defaults={'plant_name': name, 'city': city, 'country': country, 'region': region},
            )

        self.stdout.write('Creating users...')
        admin_user, created = User.objects.get_or_create(
            username='admin',
            defaults={'email': 'admin@acme.com', 'first_name': 'Admin', 'last_name': 'User', 'is_staff': True},
        )
        if created:
            admin_user.set_password('admin123')
            admin_user.save()
        UserProfile.objects.get_or_create(user=admin_user, defaults={'organization': org, 'role': 'admin'})

        analyst_user, created = User.objects.get_or_create(
            username='analyst',
            defaults={'email': 'analyst@acme.com', 'first_name': 'Sarah', 'last_name': 'Green'},
        )
        if created:
            analyst_user.set_password('analyst123')
            analyst_user.save()
        UserProfile.objects.get_or_create(user=analyst_user, defaults={'organization': org, 'role': 'analyst'})

        self.stdout.write('Creating data sources...')
        sap_source, _ = DataSource.objects.get_or_create(
            organization=org, name='SAP ERP - Fuel & Procurement',
            defaults={
                'source_type': 'SAP',
                'config': {'export_type': 'MB51', 'plant_codes': ['1001', '1002', '1003'], 'movement_types': ['201']},
                'created_by': admin_user,
            },
        )
        utility_source, _ = DataSource.objects.get_or_create(
            organization=org, name='UK Utility Portal - Electricity',
            defaults={
                'source_type': 'UTILITY',
                'config': {'supplier': 'British Gas Business', 'grid_region': 'UK'},
                'created_by': admin_user,
            },
        )
        travel_source, _ = DataSource.objects.get_or_create(
            organization=org, name='Concur - Business Travel',
            defaults={
                'source_type': 'TRAVEL',
                'config': {'platform': 'SAP Concur', 'scope': '3.6'},
                'created_by': admin_user,
            },
        )

        self.stdout.write('Ingesting SAP sample data...')
        batch = ingest_batch(sap_source, SAP_CSV, 'sap_mb51_q1_2024.csv', admin_user)
        self.stdout.write(f'  SAP: {batch.parsed_count} parsed, {batch.error_count} errors')

        self.stdout.write('Ingesting utility sample data...')
        batch = ingest_batch(utility_source, UTILITY_CSV, 'utility_billing_q1_2024.csv', admin_user)
        self.stdout.write(f'  Utility: {batch.parsed_count} parsed, {batch.error_count} errors')

        self.stdout.write('Ingesting travel sample data (JSON API pull)...')
        batch = ingest_travel_json(travel_source, TRAVEL_JSON_PAYLOAD, admin_user)
        self.stdout.write(f'  Travel: {batch.parsed_count} parsed, {batch.error_count} errors')

        from apps.emissions.models import ActivityRecord
        total = ActivityRecord.objects.filter(organization=org).count()
        self.stdout.write(self.style.SUCCESS(
            f'\nDone. {total} activity records created.\n'
            f'Login: admin / admin123  or  analyst / analyst123'
        ))
