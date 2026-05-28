"""
Ingestion orchestration: parse file → create RawRecords → create ActivityRecords.
"""
from decimal import Decimal
from datetime import timedelta

from django.contrib.auth.models import User
from django.utils import timezone

from apps.ingestion.models import DataSource, IngestionBatch, RawRecord
from apps.emissions.models import ActivityRecord, AnomalyFlag, EmissionFactor, PlantMasterData
from apps.ingestion.parsers.sap_parser import parse_sap_file
from apps.ingestion.parsers.utility_parser import parse_utility_csv
from apps.ingestion.parsers.travel_parser import parse_travel_csv, parse_travel_json
from apps.ingestion.parsers.units import normalize_unit


def _get_emission_factor(category: str, subcategory: str) -> EmissionFactor | None:
    try:
        return EmissionFactor.objects.filter(
            category=category,
            subcategory=subcategory,
            valid_to__isnull=True,
        ).order_by('-valid_from').first()
    except EmissionFactor.DoesNotExist:
        return None


def _detect_anomalies(record: ActivityRecord, org_records_qs) -> list[dict]:
    flags = []

    # Duplicate check: same batch+facility+period+category
    dup = org_records_qs.filter(
        batch=record.batch,
        facility_code=record.facility_code,
        period_start=record.period_start,
        category=record.category,
        subcategory=record.subcategory,
    ).exclude(pk=record.pk)
    if dup.exists():
        flags.append({'type': 'duplicate', 'severity': 'high',
                      'desc': f"Duplicate: same facility/period/category already in this batch."})

    # Spike check: compare to rolling 3-period average for this facility+subcategory
    historical = org_records_qs.filter(
        facility_code=record.facility_code,
        subcategory=record.subcategory,
        review_status__in=['approved', 'pending'],
    ).exclude(pk=record.pk).order_by('-period_start')[:6]

    if historical.count() >= 3:
        avg = sum(float(r.co2e_tonnes) for r in historical) / historical.count()
        if avg > 0 and float(record.co2e_tonnes) > avg * 3:
            flags.append({'type': 'spike', 'severity': 'high',
                          'desc': f"CO2e {float(record.co2e_tonnes):.2f}t is >{3}× historical avg {avg:.2f}t for this facility/category."})

    if not record.emission_factor:
        flags.append({'type': 'missing_factor', 'severity': 'medium',
                      'desc': f"No emission factor found for {record.subcategory}. CO2e is 0."})

    return flags


def ingest_batch(source: DataSource, file_content: bytes,
                 original_filename: str, uploaded_by: User) -> IngestionBatch:

    batch = IngestionBatch.objects.create(
        source=source,
        uploaded_by=uploaded_by,
        status='processing',
        original_filename=original_filename,
    )
    log = []
    org = source.organization

    try:
        if source.source_type == 'SAP':
            rows = parse_sap_file(file_content)  # auto-detects CSV vs XLSX
            _process_sap_rows(rows, batch, org, log)
        elif source.source_type == 'UTILITY':
            rows = parse_utility_csv(file_content)
            _process_utility_rows(rows, batch, org, log)
        elif source.source_type == 'TRAVEL':
            rows = parse_travel_csv(file_content)
            _process_travel_rows(rows, batch, org, log)

        batch.status = 'completed'
    except Exception as e:
        batch.status = 'failed'
        log.append({'level': 'error', 'msg': str(e)})

    batch.processing_log = log
    batch.row_count = batch.raw_records.count()
    batch.parsed_count = batch.raw_records.filter(parse_status='parsed').count()
    batch.error_count = batch.raw_records.filter(parse_status='error').count()
    batch.save()

    return batch


def ingest_travel_json(source: DataSource, payload, uploaded_by: User) -> IngestionBatch:
    """
    Ingest a JSON payload pulled from a SaaS travel API (Concur, TravelPerk, etc.).

    This is the API-pull path for TRAVEL sources: the caller fetches JSON from
    the upstream platform and passes the parsed Python object here; no file upload
    is involved.
    """
    batch = IngestionBatch.objects.create(
        source=source,
        uploaded_by=uploaded_by,
        status='processing',
        original_filename='api_pull',
    )
    log = []
    org = source.organization

    try:
        rows = parse_travel_json(payload)
        _process_travel_rows(rows, batch, org, log)
        batch.status = 'completed'
    except Exception as e:
        batch.status = 'failed'
        log.append({'level': 'error', 'msg': str(e)})

    batch.processing_log = log
    batch.row_count = batch.raw_records.count()
    batch.parsed_count = batch.raw_records.filter(parse_status='parsed').count()
    batch.error_count = batch.raw_records.filter(parse_status='error').count()
    batch.save()

    return batch


def _make_activity(batch, org, raw_record, **kwargs) -> ActivityRecord:
    ef = _get_emission_factor(kwargs.get('category', ''), kwargs.get('subcategory', ''))

    qty_norm = kwargs.get('quantity_normalized', Decimal('0'))
    unit_norm = kwargs.get('unit_normalized', '')

    co2e_kg = Decimal('0')
    if ef and qty_norm:
        co2e_kg = qty_norm * ef.factor_value

    record = ActivityRecord.objects.create(
        organization=org,
        source=batch.source,
        batch=batch,
        raw_record=raw_record,
        scope=kwargs.get('scope', 3),
        category=kwargs.get('category', ''),
        subcategory=kwargs.get('subcategory', ''),
        quantity=kwargs.get('quantity', Decimal('0')),
        unit=kwargs.get('unit', ''),
        quantity_normalized=qty_norm,
        unit_normalized=unit_norm,
        emission_factor=ef,
        co2e_kg=co2e_kg,
        co2e_tonnes=co2e_kg / Decimal('1000'),
        period_start=kwargs.get('period_start'),
        period_end=kwargs.get('period_end'),
        facility_code=kwargs.get('facility_code', ''),
        facility_name=kwargs.get('facility_name', ''),
        location=kwargs.get('location', ''),
        country=kwargs.get('country', ''),
        sap_document_number=kwargs.get('sap_document_number', ''),
        sap_movement_type=kwargs.get('sap_movement_type', ''),
        sap_material_code=kwargs.get('sap_material_code', ''),
        vendor_name=kwargs.get('vendor_name', ''),
        meter_id=kwargs.get('meter_id', ''),
        account_number=kwargs.get('account_number', ''),
        tariff_code=kwargs.get('tariff_code', ''),
        traveler_id=kwargs.get('traveler_id', ''),
        origin=kwargs.get('origin', ''),
        destination=kwargs.get('destination', ''),
        distance_km=kwargs.get('distance_km'),
        travel_class=kwargs.get('travel_class', ''),
        review_status='pending',
    )

    # Detect anomalies
    org_qs = ActivityRecord.objects.filter(organization=org)
    anomalies = _detect_anomalies(record, org_qs)
    for a in anomalies:
        AnomalyFlag.objects.create(
            activity_record=record,
            flag_type=a['type'],
            description=a['desc'],
            severity=a['severity'],
        )
    if anomalies:
        record.review_status = 'flagged'
        record.save(update_fields=['review_status'])

    return record


def _process_sap_rows(rows, batch, org, log):
    for i, row in enumerate(rows):
        errors = row.get('_errors', [])
        parse_status = 'error' if errors and not row.get('posting_date') else 'parsed'

        raw = RawRecord.objects.create(
            batch=batch,
            row_number=i + 1,
            raw_data=row['_raw'],
            parse_status=parse_status,
            parse_errors=errors,
        )

        if parse_status == 'error':
            log.append({'row': i + 1, 'level': 'error', 'errors': errors})
            continue

        classification = row.get('classification')
        movement_class = row.get('movement_class', 'other')

        if classification is None or movement_class not in ('consumption', 'receipt'):
            raw.parse_status = 'skipped'
            raw.parse_errors = ['Material not classified as tracked fuel/energy or procurement']
            raw.save(update_fields=['parse_status', 'parse_errors'])
            continue

        category, subcategory, scope = classification
        quantity = row.get('quantity') or Decimal('0')
        unit = row.get('unit', 'L')

        try:
            qty_norm, unit_norm = normalize_unit(quantity, unit, category, subcategory)
        except ValueError as e:
            qty_norm, unit_norm = quantity, unit
            errors.append(str(e))
            log.append({'row': i + 1, 'level': 'warn', 'msg': str(e)})

        posting_date = row['posting_date']
        plant_code = row.get('plant_code', '')

        plant = PlantMasterData.objects.filter(organization=org, plant_code=plant_code).first()
        facility_name = plant.plant_name if plant else plant_code
        country = plant.country if plant else ''

        _make_activity(
            batch, org, raw,
            scope=scope,
            category=category,
            subcategory=subcategory,
            quantity=quantity,
            unit=unit,
            quantity_normalized=qty_norm,
            unit_normalized=unit_norm,
            period_start=posting_date,
            period_end=posting_date,
            facility_code=plant_code,
            facility_name=facility_name,
            country=country,
            sap_document_number=row.get('doc_number', ''),
            sap_movement_type=row.get('movement_type', ''),
            sap_material_code=row.get('material_code', ''),
            vendor_name=row.get('vendor_name', ''),
        )


def _process_utility_rows(rows, batch, org, log):
    for i, row in enumerate(rows):
        errors = row.get('_errors', [])
        has_required = row.get('period_start') and row.get('period_end') and row.get('consumption') is not None
        parse_status = 'error' if not has_required else 'parsed'

        raw = RawRecord.objects.create(
            batch=batch,
            row_number=i + 1,
            raw_data=row['_raw'],
            parse_status=parse_status,
            parse_errors=errors,
        )

        if not has_required:
            log.append({'row': i + 1, 'level': 'error', 'errors': errors})
            continue

        quantity = row['consumption']
        units = row.get('units', 'kWh')

        try:
            qty_norm, unit_norm = normalize_unit(quantity, units, 'electricity')
        except ValueError as e:
            qty_norm, unit_norm = quantity, units
            errors.append(str(e))

        # Grid region → subcategory for EF lookup
        region = (row.get('region') or '').upper()
        country = (row.get('country') or '').upper()
        if country in ('GB', 'UK') or 'UK' in region or 'GB' in region:
            subcategory = 'grid_uk'
        elif country == 'US' or 'US' in region:
            subcategory = 'grid_us'
        elif country in ('DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'PL'):
            subcategory = 'grid_eu'
        else:
            subcategory = 'grid_uk'  # fallback; flag it

        _make_activity(
            batch, org, raw,
            scope=2,
            category='electricity',
            subcategory=subcategory,
            quantity=quantity,
            unit=units,
            quantity_normalized=qty_norm,
            unit_normalized=unit_norm,
            period_start=row['period_start'],
            period_end=row['period_end'],
            facility_code=row.get('account_number') or row.get('meter_id', ''),
            facility_name=row.get('facility_name', ''),
            location=row.get('address', ''),
            country=country,
            meter_id=row.get('meter_id', ''),
            account_number=row.get('account_number', ''),
            tariff_code=row.get('tariff_code', ''),
        )


def _process_travel_rows(rows, batch, org, log):
    for i, row in enumerate(rows):
        errors = row.get('_errors', [])
        category = row.get('category', 'unknown')

        if category == 'unknown':
            raw = RawRecord.objects.create(
                batch=batch, row_number=i + 1, raw_data=row['_raw'],
                parse_status='skipped',
                parse_errors=['Unrecognised expense type; not a tracked travel category'],
            )
            continue

        has_date = row.get('transaction_date') is not None
        parse_status = 'error' if not has_date else 'parsed'

        raw = RawRecord.objects.create(
            batch=batch,
            row_number=i + 1,
            raw_data=row['_raw'],
            parse_status=parse_status,
            parse_errors=errors,
        )

        if not has_date:
            log.append({'row': i + 1, 'level': 'error', 'errors': errors})
            continue

        txn_date = row['transaction_date']
        subcategory = row.get('subcategory', category)

        if category == 'flight':
            distance_km = row.get('distance_km')
            if distance_km:
                quantity = Decimal(str(distance_km))
                unit = 'km'
                qty_norm, unit_norm = quantity, 'km'
            else:
                quantity = Decimal('0')
                unit = 'km'
                qty_norm, unit_norm = Decimal('0'), 'km'

            _make_activity(
                batch, org, raw,
                scope=3,
                category='flight',
                subcategory=subcategory,
                quantity=quantity,
                unit=unit,
                quantity_normalized=qty_norm,
                unit_normalized=unit_norm,
                period_start=txn_date,
                period_end=txn_date,
                traveler_id=row.get('employee_id', ''),
                origin=row.get('airport_from') or row.get('city_from', ''),
                destination=row.get('airport_to') or row.get('city_to', ''),
                distance_km=distance_km,
                travel_class=row.get('travel_class', 'economy'),
            )

        elif category == 'hotel':
            nights = row.get('nights') or 1
            quantity = Decimal(str(nights))
            _make_activity(
                batch, org, raw,
                scope=3,
                category='hotel',
                subcategory='hotel',
                quantity=quantity,
                unit='room-night',
                quantity_normalized=quantity,
                unit_normalized='room-night',
                period_start=txn_date,
                period_end=txn_date + timedelta(days=nights - 1),
                traveler_id=row.get('employee_id', ''),
                location=row.get('city_to') or row.get('city_from', ''),
                vendor_name=row.get('vendor', ''),
            )

        elif category == 'ground_transport':
            distance_km = row.get('distance_km')
            quantity = Decimal(str(distance_km)) if distance_km else Decimal('0')
            _make_activity(
                batch, org, raw,
                scope=3,
                category='ground_transport',
                subcategory=subcategory,
                quantity=quantity,
                unit='km',
                quantity_normalized=quantity,
                unit_normalized='km',
                period_start=txn_date,
                period_end=txn_date,
                traveler_id=row.get('employee_id', ''),
                origin=row.get('city_from', ''),
                destination=row.get('city_to', ''),
                distance_km=distance_km,
                vendor_name=row.get('vendor', ''),
            )
