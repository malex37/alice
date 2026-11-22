import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { SqliteTaskStore } from './sqlite-store.js';

const config = loadConfig(process.env);
const store = new SqliteTaskStore(config.dbPath);
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
