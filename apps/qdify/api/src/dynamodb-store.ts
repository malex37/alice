import {
  ConditionalCheckFailedException,
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceInUseException,
  ResourceNotFoundException,
  waitUntilTableExists,
  type DynamoDBClientConfig,
} from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { Task, type CreateTask, type ListTasksQuery, type UpdateTask } from '@alice/qdify-shared';
import type { TaskStore } from './store.js';
import { applyPatch, newTask } from './task-rules.js';

// One partition holds every task: ample for one person, and leaves room for USER#<id> later.
const PK = 'TASKS';
const MAX_UPDATE_ATTEMPTS = 5;

interface Item extends Task {
  pk: string;
  sk: string;
  /** Bumped on every write, so an update can't overwrite one it didn't read. */
  version: number;
}

export interface DynamoTaskStoreOptions {
  table: string;
  /** Set for a local emulator such as MiniStack; unset means real AWS. */
  endpoint?: string | undefined;
  region?: string | undefined;
}

export class DynamoTaskStore implements TaskStore {
  private readonly client: DynamoDBClient;
  private readonly doc: DynamoDBDocumentClient;
  private readonly table: string;

  constructor({ table, endpoint, region }: DynamoTaskStoreOptions) {
    const config: DynamoDBClientConfig = { region: region ?? (endpoint ? 'us-east-1' : undefined) };
    if (endpoint) {
      config.endpoint = endpoint;
      // Emulators accept any credentials. Fixed ones keep real AWS keys from being used here.
      if (!process.env['AWS_ACCESS_KEY_ID']) {
        config.credentials = { accessKeyId: 'test', secretAccessKey: 'test' };
      }
    }
    this.table = table;
    this.client = new DynamoDBClient(config);
    this.doc = DynamoDBDocumentClient.from(this.client);
  }

  /** Creates the table if it is missing. For emulators; in AWS the infrastructure owns it. */
  async ensureTable(): Promise<void> {
    try {
      await this.client.send(new DescribeTableCommand({ TableName: this.table }));
      return;
    } catch (error) {
      if (!(error instanceof ResourceNotFoundException)) throw error;
    }
    try {
      await this.client.send(
        new CreateTableCommand({
          TableName: this.table,
          BillingMode: 'PAY_PER_REQUEST',
          AttributeDefinitions: [
            { AttributeName: 'pk', AttributeType: 'S' },
            { AttributeName: 'sk', AttributeType: 'S' },
          ],
          KeySchema: [
            { AttributeName: 'pk', KeyType: 'HASH' },
            { AttributeName: 'sk', KeyType: 'RANGE' },
          ],
        }),
      );
    } catch (error) {
      // Another process created it first.
      if (!(error instanceof ResourceInUseException)) throw error;
    }
    await waitUntilTableExists({ client: this.client, maxWaitTime: 60 }, { TableName: this.table });
  }

  async list({ status }: ListTasksQuery): Promise<Task[]> {
    const tasks: Task[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await this.doc.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': PK },
          ConsistentRead: true,
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of page.Items ?? []) tasks.push(toTask(item));
      startKey = page.LastEvaluatedKey;
    } while (startKey);
    // A GSI isn't worth it at this size, so filter and sort here. Newest first; the id only
    // makes ties deterministic.
    return tasks
      .filter((task) => !status || task.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }

  async get(id: string): Promise<Task | null> {
    const item = await this.read(id);
    return item ? toTask(item) : null;
  }

  async create(input: CreateTask): Promise<Task> {
    const task = newTask(input);
    await this.doc.send(
      new PutCommand({
        TableName: this.table,
        Item: { ...task, pk: PK, sk: task.id, version: 1 } satisfies Item,
        ConditionExpression: 'attribute_not_exists(sk)',
      }),
    );
    return task;
  }

  async update(id: string, patch: UpdateTask): Promise<Task | null> {
    // Read, merge, then write only if nobody else wrote in between; retry if they did.
    for (let attempt = 1; ; attempt++) {
      const current = await this.read(id);
      if (!current) return null;
      const next = applyPatch(toTask(current), patch);
      try {
        await this.doc.send(
          new PutCommand({
            TableName: this.table,
            Item: { ...next, pk: PK, sk: id, version: current.version + 1 } satisfies Item,
            ConditionExpression: 'version = :version',
            ExpressionAttributeValues: { ':version': current.version },
          }),
        );
        return next;
      } catch (error) {
        if (!(error instanceof ConditionalCheckFailedException)) throw error;
        if (attempt >= MAX_UPDATE_ATTEMPTS) throw new Error(`Task ${id} kept changing; gave up`);
      }
    }
  }

  async delete(id: string): Promise<boolean> {
    const { Attributes } = await this.doc.send(
      new DeleteCommand({
        TableName: this.table,
        Key: { pk: PK, sk: id },
        ReturnValues: 'ALL_OLD',
      }),
    );
    return Attributes !== undefined;
  }

  async close(): Promise<void> {
    this.client.destroy();
  }

  private async read(id: string): Promise<Item | null> {
    const { Item } = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: { pk: PK, sk: id }, ConsistentRead: true }),
    );
    return (Item as Item | undefined) ?? null;
  }
}

/** Drops the key and version attributes, and checks the rest. */
function toTask(item: unknown): Task {
  return Task.parse(item);
}
