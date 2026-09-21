"""Scheduler helpers: kick expired members and DM renewal warnings.

No interactive commands here — buying, renewing and getting the group link
all happen on the website (mandatory Telegram login). This file only talks
to the Telegram Bot API on the scheduler's behalf.
"""
from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup

import database as db
from config import GROUP_ID, PLAN_LABELS, VIP_PURCHASE_URL


async def send_renewal_dm(bot: Bot, telegram_user_id: int, days_left: int, plan: str) -> bool:
    plan_label = PLAN_LABELS.get(plan, plan)
    dias = "dia" if days_left == 1 else "dias"
    keyboard = (
        InlineKeyboardMarkup([[InlineKeyboardButton("🔄 Renovar VIP", url=VIP_PURCHASE_URL)]])
        if VIP_PURCHASE_URL else None
    )
    try:
        await bot.send_message(
            telegram_user_id,
            f"⏳ <b>A tua subscrição VIP expira em {days_left} {dias}</b>\n\n"
            f"Plano: {plan_label}\n\n"
            f"Renova agora para não perderes o acesso ao Elite Tipsters EPC.\n\n"
            f"🔄 Se renovares antes de expirar, os dias que ainda tens são "
            f"<b>somados</b> ao novo período — não perdes nada.",
            parse_mode="HTML",
            reply_markup=keyboard,
        )
        return True
    except Exception as e:
        print(f"Could not DM {telegram_user_id}: {e}")
        return False


async def kick_and_notify(bot: Bot, sub: dict) -> bool:
    """Revoke the invite link, remove the member from the VIP group, then DM
    them. Returns True only if the member was actually removed, so the caller
    can leave the subscription active and retry when the kick fails.
    """
    user_id = sub["telegram_user_id"]
    plan_label = PLAN_LABELS.get(sub["plan"], sub["plan"])

    # Revoke before kicking: member_limit is a simultaneous-members cap, not a
    # lifetime one, so a kicked user could otherwise rejoin with the same link.
    if sub.get("invite_link_id"):
        record = db.get_link_by_id(sub["invite_link_id"])
        if record:
            try:
                await bot.revoke_chat_invite_link(GROUP_ID, record["link"])
            except Exception as e:
                print(f"Could not revoke link for {user_id} in {GROUP_ID}: {e}")

    removed = False
    try:
        await bot.ban_chat_member(GROUP_ID, user_id)
        await bot.unban_chat_member(GROUP_ID, user_id)  # unban so a future purchase can rejoin
        removed = True
    except Exception as e:
        print(f"Could not kick {user_id} from {GROUP_ID}: {e}")

    if not removed:
        return False

    try:
        await bot.send_message(
            user_id,
            f"❌ <b>A tua subscrição expirou</b>\n\n"
            f"Plano: {plan_label}\n\n"
            f"Foste removido do grupo VIP. Podes renovar a qualquer momento no site.",
            parse_mode="HTML",
            reply_markup=(
                InlineKeyboardMarkup([[InlineKeyboardButton("🔄 Renovar VIP", url=VIP_PURCHASE_URL)]])
                if VIP_PURCHASE_URL else None
            ),
        )
    except Exception as e:
        print(f"Could not DM removal notice to {user_id}: {e}")

    return True
