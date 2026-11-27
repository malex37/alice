import type { CreateTask, ListTasksQuery, Task, UpdateTask } from '@alice/qdify-shared';
import type { TaskStore } from './store.js';
import { applyPatch, newTask } from './task-rules.js';

/** Keeps tasks in this process only. For tests, so they don't need a running MiniStack. */
export class MemoryTaskStore implements TaskStore {
  private readonly tasks = new Map<string, Task>();

  async list({ status }: ListTasksQuery): Promise<Task[]> {
    return [...this.tasks.values()]
      .filter((task) => !status || task.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }

  async get(id: string): Promise<Task | null> {
    return this.tasks.get(id) ?? null;
  }

  async create(input: CreateTask): Promise<Task> {
    const task = newTask(input);
    this.tasks.set(task.id, task);
    return task;
  }

  async update(id: string, patch: UpdateTask): Promise<Task | null> {
    const current = this.tasks.get(id);
    if (!current) return null;
    const next = applyPatch(current, patch);
    this.tasks.set(id, next);
    return next;
  }

  async delete(id: string): Promise<boolean> {
    return this.tasks.delete(id);
  }

  async close(): Promise<void> {}
}
