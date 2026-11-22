import asyncio

import pytest
from aiohttp import ClientSession, web
from aiohttp.test_utils import TestServer
from qdify_core import QdifyAuthError, QdifyClient, QdifyError, normalize_base_url


def call(handler, action, token="test-token"):
    """Run one client action against a throwaway server."""

    async def run():
        app = web.Application()
        app.router.add_route("*", "/{path:.*}", handler)
        async with TestServer(app) as server, ClientSession() as session:
            return await action(QdifyClient(session, str(server.make_url("")).rstrip("/"), token))

    return asyncio.run(run())


def respond(status, **kwargs):
    async def handler(request):
        return web.Response(status=status, **kwargs)

    return handler


def test_create_sends_token_and_body():
    async def handler(request):
        assert request.path == "/api/tasks"
        assert request.headers["Authorization"] == "Bearer test-token"
        return web.json_response(await request.json(), status=201)

    assert call(handler, lambda c: c.create_task({"title": "A"})) == {"title": "A"}


def test_no_token_sends_no_header():
    async def handler(request):
        assert "Authorization" not in request.headers
        return web.json_response([])

    assert call(handler, lambda c: c.list_tasks(), token=None) == []


def test_unauthorized():
    with pytest.raises(QdifyAuthError):
        call(respond(401), lambda c: c.list_tasks())


@pytest.mark.parametrize("status", [302, 400, 404, 500])
def test_failures(status):
    with pytest.raises(QdifyError):
        call(respond(status), lambda c: c.update_task("t1", {"title": "A"}))


def test_html_is_not_a_task_list():
    with pytest.raises(QdifyError):
        call(respond(200, text="<html>", content_type="text/html"), lambda c: c.list_tasks())


@pytest.mark.parametrize("status", [204, 404])
def test_delete_is_idempotent(status):
    assert call(respond(status), lambda c: c.delete_task("t1")) is None


@pytest.mark.parametrize("value", ["http://h:8787/", " http://h:8787/api ", "http://h:8787"])
def test_normalize_url(value):
    assert normalize_base_url(value) == "http://h:8787"


@pytest.mark.parametrize("value", ["h:8787", "ftp://h", "http://", "http://h:99999", "http://h/?a"])
def test_reject_url(value):
    with pytest.raises(ValueError):
        normalize_base_url(value)
