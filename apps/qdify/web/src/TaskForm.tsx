import type { CreateTaskInput, Task, TaskPriority } from '@alice/qdify-shared';
import { useState, type FormEvent } from 'react';
import { control, fields } from './ui.js';

interface Props {
  task?: Task;
  submitLabel: string;
  onSubmit(input: CreateTaskInput): Promise<boolean>;
  onCancel?(): void;
}

export function TaskForm({ task, submitLabel, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'normal');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const ok = await onSubmit({ title, priority, notes: notes || null, dueDate: dueDate || null });
    setBusy(false);
    if (ok && !task) {
      setTitle('');
      setNotes('');
      setDueDate('');
      setPriority('normal');
    }
  }

  return (
    <form className="grid gap-2" onSubmit={submit}>
      <input
        className={control}
        aria-label="Title"
        placeholder="What needs doing?"
        required
        pattern=".*\S.*"
        maxLength={500}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <textarea
        className={control}
        aria-label="Notes"
        placeholder="Notes"
        maxLength={20_000}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />
      <div className={fields}>
        <input
          className={control}
          aria-label="Due date"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />
        <select
          className={control}
          aria-label="Priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value as TaskPriority)}
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
        <button className={control} disabled={busy}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className={control} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
