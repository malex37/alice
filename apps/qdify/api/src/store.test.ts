import { randomUUID } from 'node:crypto';
import { DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { CreateTask } from '@alice/qdify-shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DynamoTaskStore } from './dynamodb-store.js';
import { MemoryTaskStore } from './memory-store.js';
import type { TaskStore } from './store.js';

// The same checks run against every store. The DynamoDB run needs MiniStack:
// QDIFY_TEST_DYNAMODB_ENDPOINT=http://127.0.0.1:4566 (`moon run qdify-api:test-dynamodb`).
const endpoint = process.env['QDIFY_TEST_DYNAMODB_ENDPOINT'];

const input = (overrides: Partial<CreateTask> = {}): CreateTask => ({
  title: 'A',
  notes: null,
  status: 'open',
  priority: 'normal',
  dueDate: null,
  ...overrides,
});

interface Harness {
  store: TaskStore;
  /** A second store over the same data, or null if the store can't share data. */
  reopen: (() => TaskStore) | null;
}

function contract(name: string, open: () => Promise<Harness>, after?: () => Promise<void>) {
  describe(name, () => {
    let h: Harness;
    beforeAll(async () => {
      h = await open();
    });
    afterAll(async () => {
      await h.store.close();
      await after?.();
    });

    it('creates, reads, updates and deletes', async () => {
      const task = await h.store.create(input({ notes: 'n', dueDate: '2026-12-01' }));
      expect(await h.store.get(task.id)).toEqual(task);

      const updated = await h.store.update(task.id, { title: 'B', notes: null });
      expect(updated).toMatchObject({ title: 'B', notes: null, dueDate: '2026-12-01' });
      expect(updated?.createdAt).toBe(task.createdAt);
      expect(await h.store.get(task.id)).toEqual(updated);

      expect(await h.store.delete(task.id)).toBe(true);
      expect(await h.store.get(task.id)).toBeNull();
      expect(await h.store.delete(task.id)).toBe(false);
      expect(await h.store.update(task.id, { title: 'C' })).toBeNull();
    });

    it('lists newest first and filters by status', async () => {
      const ids: string[] = [];
      for (const status of ['open', 'done', 'open'] as const) {
        ids.push((await h.store.create(input({ title: `list-${status}`, status }))).id);
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      const all = (await h.store.list({})).filter((task) => ids.includes(task.id));
      expect(all.map((task) => task.id)).toEqual([...ids].reverse());
      const done = (await h.store.list({ status: 'done' })).filter((t) => ids.includes(t.id));
      expect(done.map((task) => task.id)).toEqual([ids[1]]);
    });

    it('keeps both of two concurrent updates', async () => {
      const task = await h.store.create(input());
      await Promise.all([
        h.store.update(task.id, { title: 'renamed' }),
        h.store.update(task.id, { priority: 'high' }),
        h.store.update(task.id, { notes: 'noted' }),
      ]);
      expect(await h.store.get(task.id)).toMatchObject({
        title: 'renamed',
        priority: 'high',
        notes: 'noted',
      });
    });

    it('shares data with a second store', async (context) => {
      if (!h.reopen) return context.skip();
      const task = await h.store.create(input());
      const other = h.reopen();
      expect(await other.get(task.id)).toEqual(task);
      await other.close();
    });
  });
}

contract('MemoryTaskStore', async () => ({ store: new MemoryTaskStore(), reopen: null }));

// A table per run, so the tests never touch the app's data in a shared MiniStack.
const table = `qdify-test-${randomUUID()}`;
describe.runIf(endpoint)('with MiniStack', () => {
  contract(
    'DynamoTaskStore',
    async () => {
      const store = new DynamoTaskStore({ table, endpoint });
      await store.ensureTable();
      await store.ensureTable(); // A second call finds the table and does nothing.
      return { store, reopen: () => new DynamoTaskStore({ table, endpoint }) };
    },
    async () => {
      const client = new DynamoDBClient({
        endpoint,
        region: 'us-east-1',
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      });
      await client.send(new DeleteTableCommand({ TableName: table }));
      client.destroy();
    },
  );
});
