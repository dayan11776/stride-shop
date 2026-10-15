from django.db import migrations, models


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
    ]

