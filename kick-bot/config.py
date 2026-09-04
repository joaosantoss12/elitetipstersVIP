import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN  = os.environ["BOT_TOKEN"]
GROUP_ID   = int(os.environ["GROUP_ID"])
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

PLAN_LABELS: dict[str, str] = {
    "monthly":   "1 Mês",
    "quarterly": "3 Meses",
    "yearly":    "1 Ano",
}

RENEWAL_WARNING_DAYS = 3  # DM sent this many days before expiry
VIP_PURCHASE_URL = os.environ.get("SITE_URL", "").rstrip("/")
