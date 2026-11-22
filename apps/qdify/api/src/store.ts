import type { CreateTask, ListTasksQuery, Task, UpdateTask } from '@alice/qdify-shared';

/** Persistence boundary. Async so a networked store (DynamoDB) can replace SQLite. */
export interface TaskStore {
  list(query: ListTasksQuery): Promise<Task[]>;
  get(id: string): Promise<Task | null>;
  create(input: CreateTask): Promise<Task>;
  update(id: string, patch: UpdateTask): Promise<Task | null>;
  delete(id: string): Promise<boolean>;
  close(): Promise<void>;
}
