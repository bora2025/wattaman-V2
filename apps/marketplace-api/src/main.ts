import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { readConfig } from './config';

async function main() {
  const config = readConfig();
  const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });
  await prisma.$connect();
  const app = createApp(prisma, config);
  const dispatchBillingAlerts = () => app.locals.schoolBilling.dispatchDueAlerts().catch((error: unknown) => {
    console.error(JSON.stringify({ level: 'error', message: 'school billing alert dispatch failed', error: error instanceof Error ? error.message : String(error) }));
  });
  // Idempotent notification keys make this safe across restarts and multiple Railway replicas.
  // Run once at boot, then hourly, so the final notice timestamp reliably starts the grace clock.
  void dispatchBillingAlerts();
  const billingAlertTimer = setInterval(dispatchBillingAlerts, 60 * 60 * 1000);
  billingAlertTimer.unref();
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(JSON.stringify({ level: 'info', message: 'marketplace listening', port: config.port }));
  });
  const shutdown = async () => {
    clearInterval(billingAlertTimer);
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
