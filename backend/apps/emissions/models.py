import uuid
from django.db import models
from django.contrib.auth.models import User
from apps.core.models import Organization
from apps.ingestion.models import DataSource, IngestionBatch, RawRecord


class EmissionFactor(models.Model):
    """Versioned emission factors. All values in kgCO2e per unit_input."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.CharField(max_length=50)       # fuel, electricity, flight, hotel, ground
    subcategory = models.CharField(max_length=100)   # diesel, natural_gas, grid_uk, economy_long_haul
    unit_input = models.CharField(max_length=30)     # litre, kWh, passenger-km, room-night, km
    factor_value = models.DecimalField(max_digits=12, decimal_places=6)  # kgCO2e per unit
    source = models.CharField(max_length=50)         # DEFRA_2023, EPA_2024, IEA_2022
    version = models.CharField(max_length=20)
    valid_from = models.DateField()
    valid_to = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        unique_together = ['category', 'subcategory', 'unit_input', 'source', 'version']

    def __str__(self):
        return f"{self.subcategory} ({self.source}): {self.factor_value} kgCO2e/{self.unit_input}"


class PlantMasterData(models.Model):
    """SAP plant code lookup table, per-org."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='plants')
    plant_code = models.CharField(max_length=10)
    plant_name = models.CharField(max_length=255)
    city = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=2, blank=True)  # ISO 3166-1 alpha-2
    region = models.CharField(max_length=50, blank=True)  # for grid EF lookup

    class Meta:
        unique_together = ['organization', 'plant_code']

    def __str__(self):
        return f"{self.plant_code} - {self.plant_name}"


class ActivityRecord(models.Model):
    CATEGORY_CHOICES = [
        ('fuel', 'Fuel Combustion'),
        ('electricity', 'Electricity'),
        ('flight', 'Flight'),
        ('hotel', 'Hotel'),
        ('ground_transport', 'Ground Transport'),
        ('procurement', 'Procurement'),
    ]
    REVIEW_STATUS = [
        ('pending', 'Pending Review'),
        ('flagged', 'Flagged'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='activity_records')
    source = models.ForeignKey(DataSource, on_delete=models.CASCADE, related_name='activity_records')
    batch = models.ForeignKey(IngestionBatch, on_delete=models.CASCADE, related_name='activity_records')
    raw_record = models.OneToOneField(RawRecord, on_delete=models.SET_NULL, null=True, blank=True, related_name='activity_record')

    # Classification
    scope = models.IntegerField()
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES)
    subcategory = models.CharField(max_length=100)

    # Quantity as received
    quantity = models.DecimalField(max_digits=18, decimal_places=4)
    unit = models.CharField(max_length=30)

    # Normalized to canonical unit before EF lookup
    quantity_normalized = models.DecimalField(max_digits=18, decimal_places=4)
    unit_normalized = models.CharField(max_length=30)

    # Emissions
    emission_factor = models.ForeignKey(EmissionFactor, on_delete=models.PROTECT, null=True, blank=True)
    co2e_kg = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    co2e_tonnes = models.DecimalField(max_digits=18, decimal_places=6, default=0)

    # Period
    period_start = models.DateField()
    period_end = models.DateField()

    # Location
    facility_code = models.CharField(max_length=50, blank=True)
    facility_name = models.CharField(max_length=255, blank=True)
    location = models.CharField(max_length=255, blank=True)
    country = models.CharField(max_length=2, blank=True)

    # SAP-specific
    sap_document_number = models.CharField(max_length=30, blank=True)
    sap_movement_type = models.CharField(max_length=10, blank=True)
    sap_material_code = models.CharField(max_length=40, blank=True)
    vendor_name = models.CharField(max_length=255, blank=True)

    # Utility-specific
    meter_id = models.CharField(max_length=50, blank=True)
    account_number = models.CharField(max_length=50, blank=True)
    tariff_code = models.CharField(max_length=30, blank=True)

    # Travel-specific
    traveler_id = models.CharField(max_length=50, blank=True)
    origin = models.CharField(max_length=10, blank=True)
    destination = models.CharField(max_length=10, blank=True)
    distance_km = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    travel_class = models.CharField(max_length=20, blank=True)

    # Review workflow
    review_status = models.CharField(max_length=20, choices=REVIEW_STATUS, default='pending')
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_records')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewer_notes = models.TextField(blank=True)

    # Audit
    is_locked = models.BooleanField(default=False)
    is_manually_edited = models.BooleanField(default=False)
    original_co2e_tonnes = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-period_start']
        indexes = [
            models.Index(fields=['organization', 'review_status']),
            models.Index(fields=['organization', 'scope', 'period_start']),
            models.Index(fields=['batch']),
        ]

    def __str__(self):
        return f"{self.subcategory} | {self.period_start} | {self.co2e_tonnes:.4f} tCO2e"


class ActivityRecordEdit(models.Model):
    """Append-only audit log of every manual change to an ActivityRecord."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    activity_record = models.ForeignKey(ActivityRecord, on_delete=models.CASCADE, related_name='edits')
    edited_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    edited_at = models.DateTimeField(auto_now_add=True)
    field_name = models.CharField(max_length=50)
    old_value = models.TextField()
    new_value = models.TextField()
    reason = models.TextField(blank=True)

    class Meta:
        ordering = ['edited_at']


class AnomalyFlag(models.Model):
    FLAG_TYPES = [
        ('spike', 'Consumption Spike'),
        ('outlier', 'Statistical Outlier'),
        ('duplicate', 'Possible Duplicate'),
        ('unit_mismatch', 'Unit Mismatch'),
        ('missing_factor', 'Missing Emission Factor'),
        ('gap', 'Billing Period Gap'),
    ]
    SEVERITY = [('low', 'Low'), ('medium', 'Medium'), ('high', 'High')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    activity_record = models.ForeignKey(ActivityRecord, on_delete=models.CASCADE, related_name='flags')
    flag_type = models.CharField(max_length=30, choices=FLAG_TYPES)
    description = models.TextField()
    severity = models.CharField(max_length=10, choices=SEVERITY, default='medium')
    is_resolved = models.BooleanField(default=False)
    resolved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
