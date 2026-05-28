from rest_framework import serializers
from apps.ingestion.models import DataSource, IngestionBatch


class DataSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataSource
        fields = ['id', 'name', 'source_type', 'is_active', 'config', 'created_at']
        read_only_fields = ['id', 'created_at']


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
