import uuid
from django.db import models
from django.contrib.auth.models import User
from apps.core.models import Organization


class DataSource(models.Model):
    SOURCE_TYPES = [
        ('SAP', 'SAP Flat File'),
        ('UTILITY', 'Utility CSV'),
        ('TRAVEL', 'Corporate Travel (Concur)'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='sources')
    name = models.CharField(max_length=255)
    source_type = models.CharField(max_length=20, choices=SOURCE_TYPES)
    config = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.organization.slug} / {self.name}"


class IngestionBatch(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source = models.ForeignKey(DataSource, on_delete=models.CASCADE, related_name='batches')
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    raw_file = models.FileField(upload_to='batches/', null=True, blank=True)
    original_filename = models.CharField(max_length=255, blank=True)
    row_count = models.IntegerField(default=0)
    parsed_count = models.IntegerField(default=0)
    error_count = models.IntegerField(default=0)
    notes = models.TextField(blank=True)
    processing_log = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"{self.source.name} @ {self.uploaded_at:%Y-%m-%d %H:%M}"


class RawRecord(models.Model):
    PARSE_STATUS = [
        ('parsed', 'Parsed'),
        ('error', 'Error'),
        ('skipped', 'Skipped'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    batch = models.ForeignKey(IngestionBatch, on_delete=models.CASCADE, related_name='raw_records')
    row_number = models.IntegerField()
    raw_data = models.JSONField()
    parse_status = models.CharField(max_length=10, choices=PARSE_STATUS, default='parsed')
    parse_errors = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ['batch', 'row_number']
