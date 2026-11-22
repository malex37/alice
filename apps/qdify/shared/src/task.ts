import { z } from 'zod';

export const TaskStatus = z.enum(['open', 'done']);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const TaskPriority = z.enum(['low', 'normal', 'high']);
export type TaskPriority = z.infer<typeof TaskPriority>;

const title = z.string().trim().min(1).max(500);
const notes = z.string().max(20_000).nullable();
/** Calendar date, YYYY-MM-DD, with no timezone. */
const dueDate = z.iso.date().nullable();

export const Task = z.object({
  id: z.uuid(),
  title,
  notes,
  status: TaskStatus,
  priority: TaskPriority,
  dueDate,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
export type Task = z.infer<typeof Task>;

export const CreateTask = z.strictObject({
  title,
  notes: notes.default(null),
  status: TaskStatus.default('open'),
  priority: TaskPriority.default('normal'),
  dueDate: dueDate.default(null),
});
export type CreateTask = z.infer<typeof CreateTask>;
export type CreateTaskInput = z.input<typeof CreateTask>;

// Not CreateTask.partial(): that would apply the defaults and wipe omitted fields.
export const UpdateTask = z
  .strictObject({
    title: title.optional(),
    notes: notes.optional(),
    status: TaskStatus.optional(),
    priority: TaskPriority.optional(),
    dueDate: dueDate.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, 'At least one field is required');
export type UpdateTask = z.infer<typeof UpdateTask>;

export const ListTasksQuery = z.strictObject({ status: TaskStatus.optional() });
export type ListTasksQuery = z.infer<typeof ListTasksQuery>;
