from rest_framework import serializers
from apps.emissions.models import ActivityRecord, AnomalyFlag, EmissionFactor, ActivityRecordEdit
from apps.ingestion.models import DataSource, IngestionBatch, RawRecord
from apps.core.models import Organization


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ['id', 'name', 'slug']


class DataSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataSource
        fields = ['id', 'name', 'source_type', 'is_active', 'created_at']


class IngestionBatchSerializer(serializers.ModelSerializer):
    source_name = serializers.CharField(source='source.name', read_only=True)
    source_type = serializers.CharField(source='source.source_type', read_only=True)
    uploaded_by_name = serializers.CharField(source='uploaded_by.username', read_only=True)

    class Meta:
        model = IngestionBatch
        fields = [
            'id', 'source_name', 'source_type', 'uploaded_by_name',
            'uploaded_at', 'status', 'original_filename',
            'row_count', 'parsed_count', 'error_count', 'notes',
        ]


class AnomalyFlagSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnomalyFlag
        fields = ['id', 'flag_type', 'description', 'severity', 'is_resolved', 'created_at']


class ActivityRecordListSerializer(serializers.ModelSerializer):
    flags = AnomalyFlagSerializer(many=True, read_only=True)
    source_name = serializers.CharField(source='source.name', read_only=True)
    source_type = serializers.CharField(source='source.source_type', read_only=True)
    reviewed_by_name = serializers.CharField(source='reviewed_by.username', read_only=True)
    batch_filename = serializers.CharField(source='batch.original_filename', read_only=True)

    class Meta:
        model = ActivityRecord
        fields = [
            'id', 'scope', 'category', 'subcategory',
            'quantity', 'unit', 'quantity_normalized', 'unit_normalized',
            'co2e_tonnes',
            'period_start', 'period_end',
            'facility_code', 'facility_name', 'location', 'country',
            'review_status', 'reviewed_by_name', 'reviewed_at', 'reviewer_notes',
            'is_locked', 'is_manually_edited',
            'source_name', 'source_type', 'batch_filename',
            'flags', 'created_at',
        ]


class ActivityRecordDetailSerializer(ActivityRecordListSerializer):
    edits = serializers.SerializerMethodField()
    raw_data = serializers.SerializerMethodField()
    emission_factor_details = serializers.SerializerMethodField()

    class Meta(ActivityRecordListSerializer.Meta):
        fields = ActivityRecordListSerializer.Meta.fields + [
            'sap_document_number', 'sap_movement_type', 'sap_material_code', 'vendor_name',
            'meter_id', 'account_number', 'tariff_code',
            'traveler_id', 'origin', 'destination', 'distance_km', 'travel_class',
            'original_co2e_tonnes', 'edits', 'raw_data', 'emission_factor_details',
        ]

    def get_edits(self, obj):
        return ActivityRecordEditSerializer(obj.edits.all(), many=True).data

    def get_raw_data(self, obj):
        if obj.raw_record:
            return obj.raw_record.raw_data
        return None

    def get_emission_factor_details(self, obj):
        if obj.emission_factor:
            ef = obj.emission_factor
            return {
                'subcategory': ef.subcategory,
                'factor_value': str(ef.factor_value),
                'unit_input': ef.unit_input,
                'source': ef.source,
                'version': ef.version,
            }
        return None


class ActivityRecordEditSerializer(serializers.ModelSerializer):
    edited_by_name = serializers.CharField(source='edited_by.username', read_only=True)

    class Meta:
        model = ActivityRecordEdit
        fields = ['id', 'edited_by_name', 'edited_at', 'field_name', 'old_value', 'new_value', 'reason']


class DashboardSerializer(serializers.Serializer):
    total_co2e_tonnes = serializers.DecimalField(max_digits=18, decimal_places=4)
    scope1_co2e = serializers.DecimalField(max_digits=18, decimal_places=4)
    scope2_co2e = serializers.DecimalField(max_digits=18, decimal_places=4)
    scope3_co2e = serializers.DecimalField(max_digits=18, decimal_places=4)
    pending_count = serializers.IntegerField()
    flagged_count = serializers.IntegerField()
    approved_count = serializers.IntegerField()
    rejected_count = serializers.IntegerField()
    total_records = serializers.IntegerField()
    recent_batches = IngestionBatchSerializer(many=True)
    monthly_co2e = serializers.ListField()
    category_breakdown = serializers.ListField()
