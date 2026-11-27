// Types only, so zod stays out of the browser bundle.
import type { CreateTaskInput, Task, UpdateTask } from '@alice/qdify-shared';

const TOKEN_KEY = 'qdify.token';

export class UnauthorizedError extends Error {}

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers['authorization'] = `Bearer ${token}`;
  // Fastify rejects a JSON content type on an empty body.
  if (body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 401) throw new UnauthorizedError('An API token is required');
  if (!response.ok) throw new Error(`${method} ${path} failed (${response.status})`);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export const api = {
  list: () => request<Task[]>('GET', '/tasks'),
  create: (input: CreateTaskInput) => request<Task>('POST', '/tasks', input),
  update: (id: string, patch: UpdateTask) => request<Task>('PATCH', `/tasks/${id}`, patch),
  remove: (id: string) => request<void>('DELETE', `/tasks/${id}`),
};
