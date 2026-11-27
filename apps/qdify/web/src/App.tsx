import type { Task, TaskPriority, TaskStatus } from '@alice/qdify-shared';
import { useCallback, useEffect, useState } from 'react';
import { api, saveToken, UnauthorizedError } from './api.js';
import { TaskForm } from './TaskForm.js';
import { TokenPrompt } from './TokenPrompt.js';
import { control, page, row } from './ui.js';

const FILTERS: { label: string; value: TaskStatus | 'all' }[] = [
  { label: 'Open', value: 'open' },
  { label: 'Done', value: 'done' },
  { label: 'All', value: 'all' },
];
const PRIORITY_LABEL: Record<TaskPriority, string | null> = {
  low: 'Low priority',
  normal: null,
  high: 'High priority',
};

// dueDate has no timezone, so compare it with the local calendar date.
function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function App() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [filter, setFilter] = useState<TaskStatus | 'all'>('open');
  const [editing, setEditing] = useState<string | null>(null);
  const [needsToken, setNeedsToken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Runs an optional change, then reloads. Resolves to whether it succeeded. */
  const sync = useCallback(async (change?: () => Promise<unknown>) => {
    try {
      await change?.();
      setTasks(await api.list());
      setError(null);
      setNeedsToken(false);
      return true;
    } catch (cause) {
      if (cause instanceof UnauthorizedError) setNeedsToken(true);
      else setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    }
  }, []);

  useEffect(() => {
    void sync();
    // Pick up changes made from Home Assistant.
    const refresh = () => void sync();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [sync]);

  if (needsToken) {
    return (
      <TokenPrompt
        onSubmit={(token) => {
          saveToken(token);
          void sync();
        }}
      />
    );
  }

  const visible = tasks?.filter((task) => filter === 'all' || task.status === filter);

  return (
    <main className={page}>
      <h1>qdify</h1>
      <TaskForm submitLabel="Add task" onSubmit={(input) => sync(() => api.create(input))} />
      <nav aria-label="Filter tasks" className="mt-6 flex gap-2">
        {FILTERS.map(({ label, value }) => (
          <button
            key={value}
            className={`${control} aria-pressed:font-bold aria-pressed:underline`}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {!visible && !error && <p>Loading…</p>}
      {visible?.length === 0 && <p>No tasks here.</p>}
      <ul className="list-none p-0">
        {visible?.map((task) =>
          editing === task.id ? (
            <li key={task.id} className={row}>
              <TaskForm
                task={task}
                submitLabel="Save"
                onCancel={() => setEditing(null)}
                onSubmit={async (input) => {
                  const saved = await sync(() => api.update(task.id, input));
                  if (saved) setEditing(null);
                  return saved;
                }}
              />
            </li>
          ) : (
            <li key={task.id} className={`${row} flex items-start gap-3`}>
              <input
                type="checkbox"
                className={`${control} mt-[0.35rem]`}
                aria-label={`Done: ${task.title}`}
                checked={task.status === 'done'}
                onChange={(event) => {
                  const status = event.target.checked ? 'done' : 'open';
                  void sync(() => api.update(task.id, { status }));
                }}
              />
              <div className="min-w-0 flex-1 wrap-anywhere">
                <span className={task.status === 'done' ? 'line-through opacity-65' : undefined}>
                  {task.title}
                </span>
                {task.notes && <p className="m-0 whitespace-pre-wrap opacity-80">{task.notes}</p>}
                <small className="flex gap-3">
                  {PRIORITY_LABEL[task.priority] && <span>{PRIORITY_LABEL[task.priority]}</span>}
                  {task.dueDate && (
                    <span
                      className={
                        task.status === 'open' && task.dueDate < today() ? 'text-danger' : ''
                      }
                    >
                      Due {task.dueDate}
                    </span>
                  )}
                </small>
              </div>
              <button className={control} onClick={() => setEditing(task.id)}>
                Edit
              </button>
              <button
                className={control}
                onClick={() => {
                  if (confirm(`Delete "${task.title}"?`)) void sync(() => api.remove(task.id));
                }}
              >
                Delete
              </button>
            </li>
          ),
        )}
      </ul>
    </main>
  );
}
