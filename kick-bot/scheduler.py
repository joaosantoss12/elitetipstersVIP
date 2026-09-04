"""
Run this daily as a scheduled task on PythonAnywhere.
PythonAnywhere → Tasks → Daily → python /path/to/scheduler.py
"""
import asyncio
import math
from datetime import datetime, timezone, timedelta

from telegram import Bot

import database as db
import bot as bot_module
from config import BOT_TOKEN, RENEWAL_WARNING_DAYS


async def main() -> None:
    telegram_bot = Bot(token=BOT_TOKEN)
    now = datetime.now(timezone.utc)

    # --- Kick expired users ---
    expired = db.get_expired_subscriptions()
    kicked = 0
    for sub in expired:
        expires_at = datetime.fromisoformat(sub["expires_at"])
        who = (
            f"id={sub['telegram_user_id']} "
            f"name={sub.get('telegram_name') or '-'} "
            f"@{sub.get('telegram_username') or '-'} "
            f"plan={sub.get('plan')} "
            f"expired={expires_at.strftime('%Y-%m-%d %H:%M UTC')}"
        )
        if await bot_module.kick_and_notify(telegram_bot, sub):
            db.deactivate_subscription(sub["id"])
            kicked += 1
            print(f"Kicked and deactivated {who}")
        else:
            print(f"FAILED to kick {who} — left active, will retry next run")

    # --- Renewal warnings: DM anyone with RENEWAL_WARNING_DAYS or fewer left ---
    cutoff = now + timedelta(days=RENEWAL_WARNING_DAYS)
    expiring = db.get_active_subscriptions_expiring_within(cutoff)
    warned = 0
    for sub in expiring:
        expires_at = datetime.fromisoformat(sub["expires_at"])
        days_left = max(1, math.ceil((expires_at - now).total_seconds() / 86400))
        if await bot_module.send_renewal_dm(
            telegram_bot, sub["telegram_user_id"], days_left, sub["plan"]
        ):
            warned += 1

    await telegram_bot.shutdown()
    print(f"Scheduler done. {kicked} of {len(expired)} kicked, "
          f"{warned} of {len(expiring)} warned.")


if __name__ == "__main__":
    asyncio.run(main())
