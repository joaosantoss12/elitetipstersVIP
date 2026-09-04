from datetime import datetime, timezone
from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_KEY

_client: Client | None = None


def _get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_link_by_id(link_id: str) -> dict | None:
    rows = _get_client().table("invite_links").select("*").eq("id", link_id).execute().data
    return rows[0] if rows else None


def get_active_subscriptions_expiring_within(cutoff: datetime) -> list[dict]:
    """Active subs still valid now but expiring at or before cutoff.

    Used for the daily renewal warning — repeats every day in the final
    stretch, there's no notified-flag gate.
    """
    return (
        _get_client().table("subscriptions")
        .select("*")
        .eq("active", True)
        .gt("expires_at", _now())
        .lte("expires_at", cutoff.isoformat())
        .execute().data
    )


def get_expired_subscriptions() -> list[dict]:
    return (
        _get_client().table("subscriptions")
        .select("*")
        .eq("active", True)
        .lte("expires_at", _now())
        .execute().data
    )


def deactivate_subscription(sub_id: str) -> None:
    _get_client().table("subscriptions").update({
        "active": False,
        "kicked_at": _now(),
    }).eq("id", sub_id).execute()
