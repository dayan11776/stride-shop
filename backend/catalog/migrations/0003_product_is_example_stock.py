from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("catalog", "0002_product_recycled_at")]

    operations = [
        migrations.AddField(
            model_name="product",
            name="is_example_stock",
            field=models.BooleanField(default=False),
        ),
    ]
