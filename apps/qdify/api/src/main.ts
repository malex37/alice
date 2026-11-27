import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { DynamoTaskStore } from './dynamodb-store.js';

const config = loadConfig(process.env);
const store = new DynamoTaskStore(config.dynamodb);
// Against an emulator the app creates its own table; in AWS the infrastructure does.
if (config.dynamodb.endpoint) await store.ensureTable();
const app = await buildApp({ store, token: config.token, webDist: config.webDist, logger: true });

if (!config.token) app.log.warn('QDIFY_API_TOKEN is not set: the task API is unauthenticated');

async function shutdown() {
  await app.close();
  await store.close();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

await app.listen({ host: config.host, port: config.port });
