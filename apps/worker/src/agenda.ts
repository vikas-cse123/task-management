import { MongoBackend } from '@agendajs/mongo-backend';
import { Agenda } from 'agenda';
import { workerEnv } from './config/env';
import { logger } from './lib/logger';

/**
 * Create the Agenda v6 instance backed by MongoDB.
 *
 * No business jobs are registered in Phase 1. Job definitions for deadline
 * reminders, overdue alerts, escalations and notification retries are added in
 * the approved notification phases.
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

  agenda.on('error', (error) => {
    logger.error({ err: error }, 'Agenda error');
  });

  agenda.on('fail', (error, job) => {
    logger.error({ err: error, job: job.attrs.name }, 'Agenda job failed');
  });

  return agenda;
}
