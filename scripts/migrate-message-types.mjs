import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL ?? 'file:./dev.db' });
const prisma = new PrismaClient({ adapter });

async function main() {
  const allMessages = await prisma.teachingMessage.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, stageId: true, role: true },
  });

  const firstAssistantPerStage = new Map();
  for (const msg of allMessages) {
    if (msg.role === 'assistant' && !firstAssistantPerStage.has(msg.stageId)) {
      firstAssistantPerStage.set(msg.stageId, msg.id);
    }
  }

  const lectureIds = [...firstAssistantPerStage.values()];

  const lectureUpdate = await prisma.teachingMessage.updateMany({
    where: { id: { in: lectureIds } },
    data: { messageType: 'lecture' },
  });

  const qaUpdate = await prisma.teachingMessage.updateMany({
    where: { id: { notIn: lectureIds.length > 0 ? lectureIds : ['__none__'] } },
    data: { messageType: 'qa' },
  });

  console.log(`Tagged ${lectureUpdate.count} messages as lecture`);
  console.log(`Tagged ${qaUpdate.count} messages as qa`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
