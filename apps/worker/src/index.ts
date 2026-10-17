import { createAgenda } from './agenda';
import { scheduleRecurringJobs } from './jobs/register';
import { logger } from './lib/logger';

async function main(): Promise<void> {
  const agenda = createAgenda();

  await agenda.start();
  await scheduleRecurringJobs(agenda);
  logger.info('Interscale worker started (notification jobs registered)');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down worker');
    await agenda.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'Worker failed to start');
  process.exit(1);
});
