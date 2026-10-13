from django.contrib import admin

from .models import AuditLog, ContactMessage, ContentPage, FAQ, HomepageSection, NewsletterSubscriber

admin.site.register([NewsletterSubscriber, HomepageSection, ContentPage, FAQ, ContactMessage, AuditLog])
