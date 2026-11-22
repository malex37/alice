import { randomUUID } from 'node:crypto';
import type { CreateTask, Task, UpdateTask } from '@alice/qdify-shared';

// Domain rules every TaskStore implementation shares.

export function newTask(input: CreateTask, now = new Date()): Task {
  const timestamp = now.toISOString();
  return {
    ...input,
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: input.status === 'done' ? timestamp : null,
  };
}

export function applyPatch(task: Task, patch: UpdateTask, now = new Date()): Task {
  const timestamp = now.toISOString();
  const status = patch.status ?? task.status;
  return {
    ...task,
    title: patch.title ?? task.title,
    notes: patch.notes === undefined ? task.notes : patch.notes,
    status,
    priority: patch.priority ?? task.priority,
    dueDate: patch.dueDate === undefined ? task.dueDate : patch.dueDate,
    updatedAt: timestamp,
    completedAt: status === 'open' ? null : (task.completedAt ?? timestamp),
  };
}
