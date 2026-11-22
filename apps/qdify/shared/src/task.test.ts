import { describe, expect, it } from 'vitest';
import { CreateTask, UpdateTask } from './task.js';

describe('CreateTask', () => {
  it('fills defaults', () => {
    expect(CreateTask.parse({ title: ' Buy milk ' })).toEqual({
      title: 'Buy milk',
      notes: null,
      status: 'open',
      priority: 'normal',
      dueDate: null,
    });
  });

  it('rejects blank titles and impossible dates', () => {
    expect(CreateTask.safeParse({ title: '  ' }).success).toBe(false);
    expect(CreateTask.safeParse({ title: 'x', dueDate: '2026-02-30' }).success).toBe(false);
  });
});

describe('UpdateTask', () => {
  it('leaves omitted fields out', () => {
    expect(UpdateTask.parse({ dueDate: null })).toEqual({ dueDate: null });
  });

  it('rejects empty patches and unknown fields', () => {
    expect(UpdateTask.safeParse({}).success).toBe(false);
    expect(UpdateTask.safeParse({ id: 'nope' }).success).toBe(false);
  });
});
