import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { MemoryTaskStore } from './memory-store.js';

const cleanup: (() => unknown)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

async function setup(options: { token?: string; webDist?: string } = {}): Promise<FastifyInstance> {
  const store = new MemoryTaskStore();
  const app = await buildApp({ store, ...options });
  cleanup.push(
    () => store.close(),
    () => app.close(),
  );
  return app;
}

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'qdify-test-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

describe('tasks', () => {
  it('creates, reads, updates and deletes', async () => {
    const app = await setup();
    const created = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'A' },
    });
    expect(created.statusCode).toBe(201);
    const url = `/api/tasks/${created.json().id}`;

    expect((await app.inject({ url })).json()).toEqual(created.json());
    const patched = await app.inject({ method: 'PATCH', url, payload: { title: 'B' } });
    expect(patched.json()).toMatchObject({ title: 'B', createdAt: created.json().createdAt });
    expect((await app.inject({ method: 'DELETE', url })).statusCode).toBe(204);
    expect((await app.inject({ url })).statusCode).toBe(404);
  });

  it('keeps omitted fields and clears explicit nulls', async () => {
    const app = await setup();
    const payload = { title: 'A', notes: 'n', dueDate: '2026-12-01', priority: 'high' };
    const { id } = (await app.inject({ method: 'POST', url: '/api/tasks', payload })).json();
    const patch = { method: 'PATCH', url: `/api/tasks/${id}`, payload: { notes: null } } as const;
    expect((await app.inject(patch)).json()).toMatchObject({ ...payload, notes: null });
  });

  it('tracks completedAt', async () => {
    const app = await setup();
    const { id } = (
      await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'A' } })
    ).json();
    const patch = async (payload: object) =>
      (await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, payload })).json();

    const done = await patch({ status: 'done' });
    expect(done.completedAt).not.toBeNull();
    expect((await patch({ title: 'renamed' })).completedAt).toBe(done.completedAt);
    expect((await patch({ status: 'open' })).completedAt).toBeNull();
  });

  it('filters by status', async () => {
    const app = await setup();
    for (const status of ['open', 'done']) {
      await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: status, status } });
    }
    const listed = (await app.inject({ url: '/api/tasks?status=done' })).json();
    expect(listed.map((task: { title: string }) => task.title)).toEqual(['done']);
  });

  it('answers 400 for bad input and 404 for missing tasks', async () => {
    const app = await setup();
    expect((await app.inject({ method: 'POST', url: '/api/tasks', payload: {} })).statusCode).toBe(
      400,
    );
    expect((await app.inject({ url: '/api/tasks?status=nope' })).statusCode).toBe(400);
    const missing = { method: 'PATCH', url: '/api/tasks/nope', payload: { title: 'x' } } as const;
    expect((await app.inject(missing)).statusCode).toBe(404);
  });
});

describe('auth', () => {
  it('protects every task route but not health', async () => {
    const app = await setup({ token: 'test-token' });
    expect((await app.inject({ url: '/api/health' })).statusCode).toBe(200);
    for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
      expect((await app.inject({ method, url: '/api/tasks/x' })).statusCode).toBe(401);
    }
    expect((await app.inject({ url: '/api/tasks' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/tasks' })).statusCode).toBe(401);
    const headers = { authorization: 'Bearer test-token' };
    expect((await app.inject({ url: '/api/tasks', headers })).statusCode).toBe(200);
  });

  it('cannot be bypassed with an encoded path', async () => {
    const app = await setup({ token: 'test-token' });
    expect((await app.inject({ url: '/%61pi/tasks' })).statusCode).toBe(401);
  });
});

describe('web build', () => {
  it('serves the page without hiding API 404s', async () => {
    const webDist = tempDir();
    writeFileSync(join(webDist, 'index.html'), '<p>qdify</p>');
    const app = await setup({ webDist, token: 'test-token' });
    expect((await app.inject({ url: '/' })).body).toContain('qdify');
    expect((await app.inject({ url: '/some/page' })).body).toContain('qdify');
    expect((await app.inject({ url: '/api/unknown' })).statusCode).toBe(404);
  });
});

describe('config', () => {
  it('treats empty variables as unset', () => {
    expect(loadConfig({ QDIFY_PORT: '', QDIFY_API_TOKEN: '' })).toMatchObject({
      host: '127.0.0.1',
      port: 8787,
      token: undefined,
      dynamodb: { table: 'qdify-tasks', endpoint: undefined },
    });
  });

  it('rejects an endpoint that is not an http(s) URL', () => {
    expect(() => loadConfig({ QDIFY_DYNAMODB_ENDPOINT: 'localhost:4566' })).toThrow();
  });
});
