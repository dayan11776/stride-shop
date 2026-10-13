from django.conf import settings
from django.db import models

from common.models import TimeStampedUUIDModel, UUIDModel


class NewsletterSubscriber(UUIDModel):
    email = models.EmailField(unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="newsletter_subscriptions")
    source = models.CharField(max_length=120, blank=True)
    subscribed_at = models.DateTimeField(auto_now_add=True)
    unsubscribed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "newsletter_subscribers"
        ordering = ["-subscribed_at"]


class HomepageSection(UUIDModel):
    section_key = models.CharField(max_length=120)
    title = models.CharField(max_length=255, blank=True)
    subtitle = models.TextField(blank=True)
    cta_label = models.CharField(max_length=120, blank=True)
    cta_url = models.CharField(max_length=500, blank=True)
    image_url = models.URLField(blank=True)
    position = models.PositiveIntegerField(default=0)
    is_visible = models.BooleanField(default=True)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "homepage_sections"
        ordering = ["position", "section_key"]


class ContentPage(TimeStampedUUIDModel):
    slug = models.SlugField(max_length=180, unique=True)
    title = models.CharField(max_length=255)
    body = models.TextField()
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="updated_content_pages")

    class Meta:
        db_table = "content_pages"
        ordering = ["slug"]


class FAQ(UUIDModel):
    topic = models.CharField(max_length=120)
    question = models.TextField()
    answer = models.TextField()
    position = models.PositiveIntegerField(default=0)
    is_published = models.BooleanField(default=True)

    class Meta:
        db_table = "faqs"
        ordering = ["topic", "position", "id"]


class ContactMessage(UUIDModel):
    class Status(models.TextChoices):
        NEW = "new", "New"
        ANSWERED = "answered", "Answered"

    name = models.CharField(max_length=255)
    email = models.EmailField()
    order_number = models.CharField(max_length=40, blank=True)
    message = models.TextField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.NEW)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "contact_messages"
        ordering = ["-created_at"]


class AuditLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    staff_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_entries")
    action = models.CharField(max_length=120)
    entity = models.CharField(max_length=120)
    entity_id = models.CharField(max_length=120, blank=True)
    changes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "audit_log"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["entity", "entity_id"])]

    def __str__(self):
        return f"{self.action} {self.entity}"
