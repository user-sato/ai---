// Prints commands only. Never creates cloud resources.
import { readFileSync } from 'node:fs';
const definitions = JSON.parse(
  readFileSync(new URL('../infra/schedules.json', import.meta.url), 'utf8'),
) as { name: string; schedule: string; path: string; timeZone: string }[];
for (const job of definitions)
  console.log(
    `gcloud scheduler jobs create http secretary-${job.name} --location="$REGION" --schedule='${job.schedule}' --time-zone='${job.timeZone}' --uri="$SERVICE_URL/internal/jobs/${job.path}" --http-method=POST --oidc-service-account-email="$JOB_SA" --oidc-token-audience="$SERVICE_URL" --attempt-deadline=180s --max-retry-attempts=3`,
  );
