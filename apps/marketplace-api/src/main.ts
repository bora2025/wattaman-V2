import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { readConfig } from './config';

async function main() {
  const config = readConfig();
  const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });
  await prisma.$connect();
  const server = createApp(prisma, config).listen(config.port, '0.0.0.0', () => {
    console.log(JSON.stringify({ level: 'info', message: 'marketplace listening', port: config.port }));
  });
  const shutdown = async () => {
    server.close();
    await prisma.$disconnect();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
