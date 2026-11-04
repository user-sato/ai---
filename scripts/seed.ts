import 'dotenv/config';
import { loadConfig } from '../src/config.js';
import { prisma } from '../src/db.js';
const c = loadConfig();
if (!c.LINE_GROUP_ID)
  throw new Error('Set LINE_GROUP_ID before seeding (use a synthetic ID locally)');
try {
  const existing = await prisma.project.findUnique({ where: { id: c.PROJECT_ID } });
  if (existing && existing.groupId !== c.LINE_GROUP_ID)
    throw new Error('Group reassignment requires an explicit migration');
  await prisma.project.upsert({
    where: { id: c.PROJECT_ID },
    create: { id: c.PROJECT_ID, name: c.PROJECT_NAME, groupId: c.LINE_GROUP_ID },
    update: { name: c.PROJECT_NAME },
  });
  console.log('Project registered (identifiers omitted).');
} finally {
  await prisma.$disconnect();
}
