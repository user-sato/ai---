import 'dotenv/config';
import { loadConfig } from './config.js';
import { prisma } from './db.js';
import { buildApp } from './app.js';
import { Worker } from './jobs.js';
import { OpenAIAdapter } from './adapters/openai.js';
import { GoogleAdapter } from './adapters/google.js';
import { LineAdapter } from './adapters/line.js';
import { TasksAdapter } from './adapters/queue.js';
import { mockPorts } from './adapters/mock.js';
const c = loadConfig();
const ports = c.DRY_RUN
  ? mockPorts()
  : {
      ai: new OpenAIAdapter(c.OPENAI_API_KEY, c.OPENAI_MODEL),
      google: new GoogleAdapter(c),
      line: new LineAdapter(c.LINE_CHANNEL_ACCESS_TOKEN),
      queue: new TasksAdapter(c),
    };
const worker = new Worker(prisma, c, ports);
const app = buildApp(prisma, c, worker);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  });
await app.listen({
  port: c.PORT,
  host: c.INTERNAL_AUTH_MODE === 'local' ? '127.0.0.1' : '0.0.0.0',
});
