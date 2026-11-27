from dataclasses import replace
from datetime import UTC, date, datetime

import pytest
from qdify_core import ItemFields, changed_fields, create_payload, task_to_fields

TASK = {
    "id": "t1",
    "title": "Buy milk",
    "notes": "2 litres",
    "status": "open",
    "priority": "high",
    "dueDate": "2026-12-01",
    "completedAt": None,
}


def test_task_to_fields():
    assert task_to_fields(TASK) == ItemFields(
        uid="t1",
        summary="Buy milk",
        status="needs_action",
        description="2 litres",
        due=date(2026, 12, 1),
    )


def test_done_is_completed():
    fields = task_to_fields({**TASK, "status": "done", "completedAt": "2026-11-22T10:00:00.000Z"})
    assert fields.status == "completed"
    assert fields.completed == datetime(2026, 11, 22, 10, tzinfo=UTC)


def test_create_defaults():
    assert create_payload(ItemFields(summary="A")) == {
        "title": "A",
        "status": "open",
        "notes": None,
        "dueDate": None,
    }


def test_unchanged_item_sends_nothing():
    assert changed_fields(TASK, task_to_fields(TASK)) == {}


@pytest.mark.parametrize(
    ("change", "patch"),
    [
        ({"status": "completed"}, {"status": "done"}),
        ({"summary": "Buy oat milk"}, {"title": "Buy oat milk"}),
        ({"description": None}, {"notes": None}),
        ({"description": ""}, {"notes": None}),
        ({"due": None}, {"dueDate": None}),
        ({"due": date(2026, 12, 2)}, {"dueDate": "2026-12-02"}),
    ],
)
def test_only_changes_are_sent(change, patch):
    assert changed_fields(TASK, replace(task_to_fields(TASK), **change)) == patch
