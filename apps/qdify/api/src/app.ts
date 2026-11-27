import { createHash, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import { CreateTask, ListTasksQuery, UpdateTask } from '@alice/qdify-shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { TaskStore } from './store.js';

export interface AppOptions {
  store: TaskStore;
  token?: string | undefined;
  webDist?: string | undefined;
  logger?: boolean;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest();
const NOT_FOUND = { error: 'not_found' };

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { store, token, webDist, logger = false } = options;
  const app = Fastify({ logger });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      const issues = error.issues.map(({ path, message }) => ({ path: path.join('.'), message }));
      return reply.code(400).send({ error: 'invalid_request', issues });
    }
    return reply.send(error);
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  // Auth hangs off the matched routes rather than a check on request.url,
  // which an encoded path such as /%61pi/tasks would slip past.
  await app.register(
    async (tasks) => {
      if (token) {
        const expected = sha256(`Bearer ${token}`);
        tasks.addHook('onRequest', async (request, reply) => {
          if (!timingSafeEqual(sha256(request.headers.authorization ?? ''), expected)) {
            return reply.code(401).send({ error: 'unauthorized' });
          }
        });
      }

      tasks.get('/', async (request) => store.list(ListTasksQuery.parse(request.query)));

      tasks.post('/', async (request, reply) => {
        const task = await store.create(CreateTask.parse(request.body));
        return reply.code(201).send(task);
      });

      tasks.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
        return (await store.get(request.params.id)) ?? reply.code(404).send(NOT_FOUND);
      });

      tasks.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
        const task = await store.update(request.params.id, UpdateTask.parse(request.body));
        return task ?? reply.code(404).send(NOT_FOUND);
      });

      tasks.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
        return (await store.delete(request.params.id))
          ? reply.code(204).send()
          : reply.code(404).send(NOT_FOUND);
      });
    },
    { prefix: '/api/tasks' },
  );

  if (webDist) await app.register(fastifyStatic, { root: resolve(webDist) });

  app.setNotFoundHandler((request, reply) => {
    const isPage = request.method === 'GET' && !request.url.startsWith('/api');
    return webDist && isPage ? reply.sendFile('index.html') : reply.code(404).send(NOT_FOUND);
  });

  return app;
}
