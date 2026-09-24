"""FREE/PRO pricing helpers."""
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple
from fastapi import Depends, HTTPException

FEATURES = {
    "free": {"pod": False, "notifications": False, "analytics": False, "winfarm": False, "multi_pharmacy": False},
    "pro": {"pod": True, "notifications": True, "analytics": True, "winfarm": True, "multi_pharmacy": False},
}


def _date(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def get_plan_status(user: Dict[str, Any]) -> Tuple[str, bool, Optional[int]]:
    """Return ``(plan, active, days_remaining)``; missing plans are FREE."""
    plan = user.get("plan", "free")
    expires = _date(user.get("plan_expires_at"))
    active = plan == "pro" and (expires is None or expires > datetime.now(timezone.utc))
    days = max(0, (expires - datetime.now(timezone.utc)).days) if expires else None
    return ("pro" if active else "free", active, days)


def features_for_user(user: Dict[str, Any]) -> Dict[str, bool]:
    return dict(FEATURES[get_plan_status(user)[0]])


def require_pro_plan(user: Dict[str, Any]) -> Dict[str, Any]:
    """Use inside a route after ``user = Depends(get_current_user)``."""
    plan, active, _ = get_plan_status(user)
    if not active:
        message = "Il tuo abbonamento Pro è scaduto. Rinnova ora." if user.get("plan") == "pro" else "Questa funzione richiede il piano Pro. Upgrade ora."
        raise HTTPException(status_code=402, detail=message)
    return user


def can_send_customer_notification(user: Dict[str, Any]) -> bool:
    return features_for_user(user)["notifications"]
