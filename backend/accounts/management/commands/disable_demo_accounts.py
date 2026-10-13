"""Disable legacy demo users that were previously created with public passwords."""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


LEGACY_DEMO_EMAILS = ("admin@stride.local", "customer@stride.local")


class Command(BaseCommand):
    help = "Disable legacy STRIDE demo accounts with predictable credentials."

    def handle(self, *args, **options):
        user_model = get_user_model()
        users = user_model.objects.filter(email__in=LEGACY_DEMO_EMAILS)
        disabled = 0
        for user in users:
            user.is_active = False
            user.is_staff = False
            user.is_superuser = False
            user.role = user_model.Role.CUSTOMER
            user.set_unusable_password()
            user.save(update_fields=["is_active", "is_staff", "is_superuser", "role", "password"])
            disabled += 1
        self.stdout.write(self.style.SUCCESS(f"Disabled {disabled} legacy demo account(s)."))
