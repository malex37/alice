"""Config flow for qdify."""

from collections.abc import Mapping
from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_API_TOKEN, CONF_URL
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import TextSelector, TextSelectorConfig, TextSelectorType

from .const import DOMAIN
from .core import QdifyAuthError, QdifyClient, QdifyError, normalize_base_url

_PASSWORD = TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD))
_USER_SCHEMA = vol.Schema({vol.Required(CONF_URL): str, vol.Optional(CONF_API_TOKEN): _PASSWORD})
_REAUTH_SCHEMA = vol.Schema({vol.Required(CONF_API_TOKEN): _PASSWORD})


class QdifyConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def _check(self, url: str, token: str | None) -> dict[str, str]:
        client = QdifyClient(async_get_clientsession(self.hass), url, token)
        try:
            # /api/health is public, so it wouldn't prove the token works.
            await client.list_tasks()
        except QdifyAuthError:
            return {"base": "invalid_auth"}
        except QdifyError:
            return {"base": "cannot_connect"}
        return {}

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                url = normalize_base_url(user_input[CONF_URL])
            except ValueError:
                errors[CONF_URL] = "invalid_url"
            else:
                self._async_abort_entries_match({CONF_URL: url})
                token = user_input.get(CONF_API_TOKEN, "").strip() or None
                if not (errors := await self._check(url, token)):
                    return self.async_create_entry(
                        title="qdify", data={CONF_URL: url, CONF_API_TOKEN: token}
                    )
        schema = self.add_suggested_values_to_schema(_USER_SCHEMA, user_input)
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)

    async def async_step_reauth(self, entry_data: Mapping[str, Any]) -> ConfigFlowResult:
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        entry = self._get_reauth_entry()
        errors: dict[str, str] = {}
        if user_input is not None:
            token = user_input[CONF_API_TOKEN].strip()
            if not (errors := await self._check(entry.data[CONF_URL], token)):
                return self.async_update_reload_and_abort(
                    entry, data_updates={CONF_API_TOKEN: token}
                )
        return self.async_show_form(
            step_id="reauth_confirm", data_schema=_REAUTH_SCHEMA, errors=errors
        )
