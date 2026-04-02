from datetime import datetime, timezone, timedelta
from typing import Optional

# Category SLA in days (matches frontend CATEGORY_PRIORITY_SLA)
CATEGORY_PRIORITY_SLA: dict[str, dict[str, float]] = {
    "water":    {"low": 2,  "normal": 1,  "high": 0.5,  "urgent": 0.25},
    "waste":    {"low": 3,  "normal": 2,  "high": 1,    "urgent": 0.5},
    "lighting": {"low": 5,  "normal": 3,  "high": 2,    "urgent": 1},
    "roads":    {"low": 10, "normal": 7,  "high": 5,    "urgent": 2},
    "other":    {"low": 7,  "normal": 5,  "high": 3,    "urgent": 1},
}

# Category escalation rules (hours to next priority level)
CATEGORY_ESCALATION_RULES: dict[str, dict[str, dict]] = {
    "water":    {"low": {"hours": 12,  "next": "normal"}, "normal": {"hours": 12,  "next": "high"}, "high": {"hours": 6,   "next": "urgent"}, "urgent": {"hours": None, "next": None}},
    "waste":    {"low": {"hours": 24,  "next": "normal"}, "normal": {"hours": 24,  "next": "high"}, "high": {"hours": 12,  "next": "urgent"}, "urgent": {"hours": None, "next": None}},
    "lighting": {"low": {"hours": 48,  "next": "normal"}, "normal": {"hours": 72,  "next": "high"}, "high": {"hours": 48,  "next": "urgent"}, "urgent": {"hours": None, "next": None}},
    "roads":    {"low": {"hours": 72,  "next": "normal"}, "normal": {"hours": 120, "next": "high"}, "high": {"hours": 72,  "next": "urgent"}, "urgent": {"hours": None, "next": None}},
    "other":    {"low": {"hours": 48,  "next": "normal"}, "normal": {"hours": 72,  "next": "high"}, "high": {"hours": 48,  "next": "urgent"}, "urgent": {"hours": None, "next": None}},
}


def get_sla_deadline(created_at: datetime, category: str, priority: str) -> datetime:
    """Calculate SLA deadline from creation time, category and priority."""
    days = CATEGORY_PRIORITY_SLA.get(category, {}).get(priority, 5)
    return created_at + timedelta(days=days)


def calculate_sla_status(
    created_at: datetime,
    category: str,
    priority: str,
    status: str,
    closed_at: Optional[datetime] = None,
    sla_deadline: Optional[datetime] = None,
) -> str:
    """Return 'met', 'at_risk', or 'breached'."""
    deadline = sla_deadline or get_sla_deadline(created_at, category, priority)

    if status in ("resolved", "rejected", "deferred"):
        reference = closed_at or datetime.now(timezone.utc)
        return "met" if reference <= deadline else "breached"

    now = datetime.now(timezone.utc)
    time_remaining = (deadline - now).total_seconds()

    if time_remaining <= 0:
        return "breached"

    sla_days = CATEGORY_PRIORITY_SLA.get(category, {}).get(priority, 5)
    at_risk_seconds = sla_days * 24 * 3600 * 0.25

    return "at_risk" if time_remaining <= at_risk_seconds else "met"


def should_escalate_priority(
    created_at: datetime,
    priority: str,
    category: str,
    priority_escalated_at: Optional[datetime] = None,
) -> tuple[bool, Optional[str]]:
    """Return (should_escalate, new_priority)."""
    rules = CATEGORY_ESCALATION_RULES.get(category, {}).get(priority, {})
    next_priority = rules.get("next")
    hours = rules.get("hours")

    if not next_priority or not hours:
        return False, None

    base_date = priority_escalated_at or created_at
    hours_passed = (datetime.now(timezone.utc) - base_date).total_seconds() / 3600

    if hours_passed >= hours:
        return True, next_priority

    return False, None


# Valid status transitions per role
# Base transitions (role-independent direction)
STATUS_TRANSITIONS: dict[str, list[str]] = {
    "new":          ["under_review"],
    "under_review": ["in_progress", "rejected"],
    "in_progress":  ["resolved", "deferred", "rejected"],
    "resolved":     [],
    "rejected":     [],
    "deferred":     ["in_progress", "rejected"],
}

# Role-based allowed transitions
# Governor: supervisory only – can reopen closed/rejected cases for review
# Mayor: primary operational owner – full complaint lifecycle
# Mukhtar: intake – can only advance new complaints to under_review
ROLE_TRANSITIONS: dict[str, dict[str, list[str]]] = {
    "mukhtar": {
        "new": ["under_review"],
    },
    "district_admin": {
        "new": ["under_review"],
    },
    "mayor": {
        "new":          ["under_review"],
        "under_review": ["in_progress", "rejected"],
        "in_progress":  ["resolved", "deferred", "rejected"],
        "deferred":     ["in_progress", "rejected"],
    },
    "municipal_admin": {
        "new":          ["under_review"],
        "under_review": ["in_progress", "rejected"],
        "in_progress":  ["resolved", "deferred", "rejected"],
        "deferred":     ["in_progress", "rejected"],
    },
    "governor": {
        # Supervisory overrides only – reopen closed/rejected cases
        "resolved":     ["in_progress"],
        "rejected":     ["new", "under_review"],
    },
    "staff": {},
}


def can_transition(from_status: str, to_status: str, role: str = "governor") -> bool:
    """Check if a role can transition from from_status to to_status."""
    role_transitions = ROLE_TRANSITIONS.get(role, {})
    allowed = role_transitions.get(from_status, [])
    return to_status in allowed
