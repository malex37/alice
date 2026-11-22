import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Task, type CreateTask, type ListTasksQuery, type UpdateTask } from '@alice/qdify-shared';
import type { TaskStore } from './store.js';
import { applyPatch, newTask } from './task-rules.js';

// The index in this list + 1 is the schema version. Append only.
const MIGRATIONS = [
  `CREATE TABLE tasks (
     id          TEXT PRIMARY KEY,
     title       TEXT NOT NULL,
     notes       TEXT,
     status      TEXT NOT NULL CHECK (status IN ('open', 'done')),
     priority    TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high')),
     dueDate     TEXT,
     createdAt   TEXT NOT NULL,
     updatedAt   TEXT NOT NULL,
     completedAt TEXT
   );
   CREATE INDEX tasks_by_status ON tasks (status, createdAt);`,
];

export class SqliteTaskStore implements TaskStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    this.migrate();
  }

  async list({ status }: ListTasksQuery): Promise<Task[]> {
    const order = 'ORDER BY createdAt DESC, rowid DESC';
    const rows = status
      ? this.db.prepare(`SELECT * FROM tasks WHERE status = ? ${order}`).all(status)
      : this.db.prepare(`SELECT * FROM tasks ${order}`).all();
    return rows.map((row) => Task.parse(row));
  }

  async get(id: string): Promise<Task | null> {
    return this.read(id);
  }

  async create(input: CreateTask): Promise<Task> {
    const task = newTask(input);
    this.db
      .prepare(
        `INSERT INTO tasks VALUES
         (:id, :title, :notes, :status, :priority, :dueDate, :createdAt, :updatedAt, :completedAt)`,
      )
      .run({ ...task });
    return task;
  }

  async update(id: string, patch: UpdateTask): Promise<Task | null> {
    // No await between read and write, so the merge can't interleave with another request.
    const current = this.read(id);
    if (!current) return null;
    const { createdAt, ...next } = applyPatch(current, patch);
    this.db
      .prepare(
        `UPDATE tasks SET title = :title, notes = :notes, status = :status, priority = :priority,
         dueDate = :dueDate, updatedAt = :updatedAt, completedAt = :completedAt WHERE id = :id`,
      )
      .run(next);
    return { ...next, createdAt };
  }

  async delete(id: string): Promise<boolean> {
    return Number(this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes) > 0;
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private read(id: string): Task | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    return row ? Task.parse(row) : null;
  }

  private migrate(): void {
    const version = Number(this.db.prepare('PRAGMA user_version').get()?.['user_version']);
    MIGRATIONS.slice(version).forEach((sql, i) => {
      this.db.exec(`BEGIN; ${sql} PRAGMA user_version = ${version + i + 1}; COMMIT;`);
    });
  }
}
