import { afterEach, expect, it, vi } from 'vitest';
import { api, UnauthorizedError } from './api.js';

afterEach(() => vi.unstubAllGlobals());

function stub(response: Response, token: string | null = null) {
  const fetch = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('localStorage', { getItem: () => token });
  return fetch;
}

it('signals 401 so the UI can ask for a token', async () => {
  stub(new Response(null, { status: 401 }));
  await expect(api.list()).rejects.toBeInstanceOf(UnauthorizedError);
});

it('sends the token and no content type on DELETE', async () => {
  const fetch = stub(new Response(null, { status: 204 }), 'test-token');
  await api.remove('1');
  expect(fetch.mock.calls[0]?.[1].headers).toEqual({ authorization: 'Bearer test-token' });
});
