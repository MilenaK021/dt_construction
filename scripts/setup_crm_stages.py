"""
setup_crm_stages.py — one-time setup script: creates custom CRM pipeline
stages in Odoo for tracking leads coming from the website contact form.

Run once from the dt_construction project root:

    python -m scripts.setup_crm_stages

Stages created (in order):
    1. Discussion            — Обсуждение
    2. Contract Negotiation  — Заключение договора
    3. Contract Signing      — Подпись договора
    4. Completed              — Завершено

Idempotent — running it again will not create duplicates.
"""

import os
import sys

# Allow running as `python -m scripts.setup_crm_stages` from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.odoo_client import OdooClient, ODOO_DB, ODOO_PASS


STAGES = [
    {"name": "Discussion",           "sequence": 10},
    {"name": "Contract Negotiation", "sequence": 20},
    {"name": "Contract Signing",     "sequence": 30},
    {"name": "Completed",            "sequence": 40, "is_won": True},
]


def main():
    odoo  = OdooClient()
    uid   = odoo._uid
    models = odoo._models()

    existing = models.execute_kw(
        ODOO_DB, uid, ODOO_PASS,
        "crm.stage", "search_read",
        [[]],
        {"fields": ["id", "name", "sequence"]}
    )
    existing_names = {s["name"] for s in existing}
    print(f"Existing CRM stages: {sorted(existing_names) or '(none)'}")

    created = []
    for stage in STAGES:
        if stage["name"] in existing_names:
            print(f"  ✓ '{stage['name']}' already exists — skipping")
            continue

        vals = {
            "name":     stage["name"],
            "sequence": stage["sequence"],
        }
        if stage.get("is_won"):
            vals["is_won"] = True

        stage_id = models.execute_kw(
            ODOO_DB, uid, ODOO_PASS,
            "crm.stage", "create",
            [vals]
        )
        created.append((stage["name"], stage_id))
        print(f"  + Created '{stage['name']}' (id={stage_id})")

    if created:
        print(f"\nDone — created {len(created)} new stage(s).")
    else:
        print("\nDone — all stages already existed, nothing to do.")

    print("\nAll CRM pipeline stages now:")
    all_stages = models.execute_kw(
        ODOO_DB, uid, ODOO_PASS,
        "crm.stage", "search_read",
        [[]],
        {"fields": ["id", "name", "sequence"], "order": "sequence"}
    )
    for s in all_stages:
        print(f"  [{s['id']}] {s['name']} (sequence {s['sequence']})")


if __name__ == "__main__":
    main()