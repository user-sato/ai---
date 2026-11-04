import { CloudTasksClient } from '@google-cloud/tasks';
import type { Queue } from '../ports.js';
import type { Config } from '../config.js';
export class TasksAdapter implements Queue {
  private client = new CloudTasksClient();
  constructor(private c: Config) {}
  async enqueue(jobId: string) {
    await this.client.createTask(
      {
        parent: this.client.queuePath(
          this.c.GCP_PROJECT_ID,
          this.c.GCP_LOCATION,
          this.c.TASKS_QUEUE,
        ),
        task: {
          dispatchDeadline: { seconds: 300 },
          httpRequest: {
            httpMethod: 'POST',
            url: `${this.c.WORKER_URL}/internal/jobs/run`,
            headers: { 'Content-Type': 'application/json' },
            body: Buffer.from(JSON.stringify({ jobId })).toString('base64'),
            oidcToken: {
              serviceAccountEmail: this.c.INTERNAL_SERVICE_ACCOUNT,
              audience: this.c.INTERNAL_AUDIENCE,
            },
          },
        },
      },
      { timeout: 30_000, retry: null },
    );
  }
}
