// Run only by the operator after explicitly authorizing Google OAuth / creation.
import 'dotenv/config';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { google } from 'googleapis';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
const client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);
const action = process.argv[2];
if (action === 'auth-url') {
  await mkdir('.secrets', { recursive: true, mode: 0o700 });
  const state = randomBytes(32).toString('hex');
  await writeFile('.secrets/google-oauth-state', state, { mode: 0o600 });
  // Authorization URL contains no client secret or refresh token.
  console.log(
    client.generateAuthUrl({
      state,
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/drive.file'],
    }),
  );
} else if (action === 'exchange') {
  if (!process.env.GOOGLE_AUTH_CODE)
    throw new Error('Set GOOGLE_AUTH_CODE securely; do not pass it on the command line');
  const expected = Buffer.from(await readFile('.secrets/google-oauth-state', 'utf8'));
  const actual = Buffer.from(process.env.GOOGLE_AUTH_STATE ?? '');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new Error('OAuth state mismatch');
  try {
    const { tokens } = await client.getToken(process.env.GOOGLE_AUTH_CODE);
    if (!tokens.refresh_token) throw new Error('Refresh token missing; repeat explicit consent');
    await mkdir('.secrets', { recursive: true, mode: 0o700 });
    await writeFile('.secrets/google-oauth.json', JSON.stringify(tokens), {
      mode: 0o600,
      flag: 'wx',
    });
    console.log('OAuth credentials saved to ignored .secrets/google-oauth.json (not printed).');
  } catch {
    throw new Error('OAuth exchange failed; details suppressed');
  }
} else if (action === 'create-root' && process.argv.includes('--approve-create')) {
  const exists = await access('.secrets/google-root.json').then(
    () => true,
    () => false,
  );
  if (exists) throw new Error('Root already configured; refusing duplicate creation');
  const tokens = JSON.parse(await readFile('.secrets/google-oauth.json', 'utf8'));
  client.setCredentials(tokens);
  const drive = google.drive({ version: 'v3', auth: client });
  try {
    const root = await drive.files.create({
      requestBody: { name: 'LINE AI書記Bot', mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    });
    await writeFile(
      '.secrets/google-root.json',
      JSON.stringify({ GOOGLE_DRIVE_ROOT_ID: root.data.id }),
      { mode: 0o600, flag: 'wx' },
    );
    console.log(
      'New private root created. Identifier saved to ignored .secrets/google-root.json. Configure participant access manually.',
    );
  } catch {
    throw new Error(
      'Root creation/setup failed; inspect Drive before retrying (no automatic deletion)',
    );
  }
} else throw new Error('Usage: google-setup.ts auth-url | exchange | create-root --approve-create');
