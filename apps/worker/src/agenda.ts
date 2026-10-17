import { MongoBackend } from '@agendajs/mongo-backend';
import { Agenda } from 'agenda';
import { workerEnv } from './config/env';
import { logger } from './lib/logger';
import { registerJobDefinitions } from './jobs/register';

/**
 * Create the Agenda v6 instance backed by MongoDB.
 *
 * Job definitions for deadline reminders, escalations, campaign reviews and
 * notification retries are registered here; the recurring schedules are armed
 * on start (see `scheduleRecurringJobs`).
 */
export function createAgenda(): Agenda {
  const agenda = new Agenda({
    backend: new MongoBackend({
      address: workerEnv.MONGODB_URI,
      collection: workerEnv.AGENDA_DB_COLLECTION,
    }),
    processEvery: workerEnv.WORKER_PROCESS_EVERY,
    maxConcurrency: 20,
  });

  registerJobDefinitions(agenda);

  agenda.on('error', (error) => {
    logger.error({ err: error }, 'Agenda error');
  });

  agenda.on('fail', (error, job) => {
    logger.error({ err: error, job: job.attrs.name }, 'Agenda job failed');
  });

  return agenda;
}
