"""Polling coordinator for qdify."""

import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import DOMAIN, UPDATE_INTERVAL
from .core import QdifyAuthError, QdifyClient, QdifyError

_LOGGER = logging.getLogger(__name__)

type QdifyConfigEntry = ConfigEntry[QdifyCoordinator]


class QdifyCoordinator(DataUpdateCoordinator[list[dict[str, Any]]]):
    config_entry: QdifyConfigEntry

    def __init__(self, hass: HomeAssistant, entry: QdifyConfigEntry, client: QdifyClient) -> None:
        super().__init__(
            hass, _LOGGER, config_entry=entry, name=DOMAIN, update_interval=UPDATE_INTERVAL
        )
        self.client = client

    async def _async_update_data(self) -> list[dict[str, Any]]:
        try:
            return await self.client.list_tasks()
        except QdifyAuthError as err:
            raise ConfigEntryAuthFailed(str(err)) from err
        except QdifyError as err:
            raise UpdateFailed(str(err)) from err
