from django.db import migrations, models


def assign_existing_payment_providers(apps, schema_editor):
    """Preserve every pre-PayMongo online payment as a historical Xendit one."""
    payment_model = apps.get_model("commerce", "Payment")
    payment_model.objects.filter(provider="", method="cod").update(provider="cod")
    payment_model.objects.filter(provider="").exclude(method="cod").update(provider="xendit")


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="payment",
            name="provider",
            field=models.CharField(
                blank=True,
                choices=[("xendit", "Xendit"), ("paymongo", "PayMongo"), ("cod", "Cash on delivery")],
                db_index=True,
                default="",
                max_length=16,
            ),
        ),
        migrations.RunPython(assign_existing_payment_providers, migrations.RunPython.noop),
    ]

