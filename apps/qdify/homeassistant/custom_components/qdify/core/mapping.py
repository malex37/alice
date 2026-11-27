"""Translate between qdify tasks and to-do item fields."""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

NEEDS_ACTION = "needs_action"
COMPLETED = "completed"

_TO_ITEM_STATUS = {"open": NEEDS_ACTION, "done": COMPLETED}
_TO_TASK_STATUS = {item: task for task, item in _TO_ITEM_STATUS.items()}


@dataclass(frozen=True)
class ItemFields:
    """The parts of a to-do item that qdify stores."""

    summary: str | None
    status: str | None = None
    description: str | None = None
    due: date | None = None
    uid: str | None = None
    completed: datetime | None = None


def task_to_fields(task: dict[str, Any]) -> ItemFields:
    return ItemFields(
        uid=task["id"],
        summary=task["title"],
        status=_TO_ITEM_STATUS[task["status"]],
        description=task.get("notes"),
        due=date.fromisoformat(task["dueDate"]) if task.get("dueDate") else None,
        completed=(
            datetime.fromisoformat(task["completedAt"]) if task.get("completedAt") else None
        ),
    )


def create_payload(item: ItemFields) -> dict[str, Any]:
    return {
        "title": item.summary,
        "status": _TO_TASK_STATUS[item.status or NEEDS_ACTION],
        "notes": item.description or None,
        "dueDate": item.due.isoformat() if item.due else None,
    }


def changed_fields(before: dict[str, Any], item: ItemFields) -> dict[str, Any]:
    """Return a PATCH body with only what the user changed.

    Home Assistant hands over whole items built from the last poll. Sending every
    field would undo edits made in the web UI since that poll.
    """
    wanted = create_payload(item)
    if not item.summary:
        del wanted["title"]
    if not item.status:
        del wanted["status"]
    return {key: value for key, value in wanted.items() if (before.get(key) or None) != value}
