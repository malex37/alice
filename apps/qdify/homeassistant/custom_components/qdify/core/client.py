"""Async client for the qdify HTTP API."""

from typing import Any
from urllib.parse import quote, urlsplit

import aiohttp

TIMEOUT = aiohttp.ClientTimeout(total=10)


class QdifyError(Exception):
    """The API could not be reached or rejected the request."""


class QdifyAuthError(QdifyError):
    """The API token is missing or wrong."""


def normalize_base_url(value: str) -> str:
    """Return the server root, or raise ValueError."""
    url = value.strip().rstrip("/").removesuffix("/api")
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError("Expected an http(s) URL")
    if parts.query or parts.fragment or parts.username:
        raise ValueError("Expected a URL without credentials, query or fragment")
    _ = parts.port  # raises ValueError when out of range
    return url


class QdifyClient:
    def __init__(
        self, session: aiohttp.ClientSession, base_url: str, token: str | None = None
    ) -> None:
        self._session = session
        self._url = f"{base_url}/api/tasks"
        self._headers = {"Authorization": f"Bearer {token}"} if token else {}

    async def list_tasks(self) -> list[dict[str, Any]]:
        tasks = await self._request("GET")
        if not isinstance(tasks, list):
            raise QdifyError("The server did not return a task list")
        return tasks

    async def create_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._request("POST", payload=payload)

    async def update_task(self, task_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        return await self._request("PATCH", task_id, payload=patch)

    async def delete_task(self, task_id: str) -> None:
        # Already gone is what the caller wanted.
        await self._request("DELETE", task_id, allow_missing=True)

    async def _request(
        self,
        method: str,
        task_id: str | None = None,
        *,
        payload: dict[str, Any] | None = None,
        allow_missing: bool = False,
    ) -> Any:
        url = self._url if task_id is None else f"{self._url}/{quote(task_id, safe='')}"
        try:
            async with self._session.request(
                method,
                url,
                json=payload,
                headers=self._headers,
                timeout=TIMEOUT,
                # A redirect could carry the token elsewhere or turn a POST into a GET.
                allow_redirects=False,
            ) as response:
                if response.status == 401:
                    raise QdifyAuthError("qdify rejected the API token")
                if response.status == 204 or (response.status == 404 and allow_missing):
                    return None
                if not 200 <= response.status < 300:
                    raise QdifyError(f"qdify returned HTTP {response.status} for {method}")
                return await response.json()
        except (aiohttp.ClientError, TimeoutError, ValueError) as err:
            raise QdifyError(f"Cannot talk to qdify: {err!r}") from err
