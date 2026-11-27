"""qdify to-do list."""

import asyncio
from collections.abc import Awaitable
from dataclasses import asdict

from homeassistant.components.todo import (
    TodoItem,
    TodoItemStatus,
    TodoListEntity,
    TodoListEntityFeature,
)
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .coordinator import QdifyConfigEntry, QdifyCoordinator
from .core import (
    ItemFields,
    QdifyAuthError,
    QdifyError,
    changed_fields,
    create_payload,
    task_to_fields,
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: QdifyConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([QdifyTodoList(entry.runtime_data)])


def _fields(item: TodoItem) -> ItemFields:
    return ItemFields(
        uid=item.uid,
        summary=item.summary,
        status=item.status,
        description=item.description,
        due=item.due,
    )


class QdifyTodoList(CoordinatorEntity[QdifyCoordinator], TodoListEntity):
    _attr_name = "qdify"
    _attr_supported_features = (
        TodoListEntityFeature.CREATE_TODO_ITEM
        | TodoListEntityFeature.UPDATE_TODO_ITEM
        | TodoListEntityFeature.DELETE_TODO_ITEM
        | TodoListEntityFeature.SET_DUE_DATE_ON_ITEM
        | TodoListEntityFeature.SET_DESCRIPTION_ON_ITEM
    )

    def __init__(self, coordinator: QdifyCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_tasks"

    # A plain property: the base class caches this, and the coordinator data changes.
    @property
    def todo_items(self) -> list[TodoItem] | None:
        if self.coordinator.data is None:
            return None
        items = []
        for task in self.coordinator.data:
            values = asdict(task_to_fields(task))
            values["status"] = TodoItemStatus(values["status"])
            items.append(TodoItem(**values))
        return items

    async def async_create_todo_item(self, item: TodoItem) -> None:
        await self._write(self.coordinator.client.create_task(create_payload(_fields(item))))

    async def async_update_todo_item(self, item: TodoItem) -> None:
        before = next((t for t in self.coordinator.data if t["id"] == item.uid), None)
        if before is None:
            raise HomeAssistantError("That task no longer exists in qdify")
        if patch := changed_fields(before, _fields(item)):
            await self._write(self.coordinator.client.update_task(item.uid, patch))

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        await self._write(
            asyncio.gather(*(self.coordinator.client.delete_task(uid) for uid in uids))
        )

    async def _write(self, request: Awaitable[object]) -> None:
        try:
            await request
        except QdifyAuthError as err:
            self.coordinator.config_entry.async_start_reauth(self.hass)
            raise HomeAssistantError(str(err)) from err
        except QdifyError as err:
            raise HomeAssistantError(str(err)) from err
        finally:
            # Not async_request_refresh: its debounce leaves the list stale after quick edits.
            await self.coordinator.async_refresh()
