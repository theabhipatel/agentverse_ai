import type { Server } from 'node:http';
import { createApp } from './app.js';
import { logger } from './common/logger/index.js';
import { config } from './config/env.js';
import { closeDatabase, connectDatabase } from './db/index.js';
import { failInterruptedDocuments } from './modules/knowledge/knowledge.processor.js';
import { seedLlmConfig } from './modules/llm/llm.service.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

let server: Server | undefined;
let shuttingDown = false;

async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ reason }, 'Shutting down');

  const forceExit = setTimeout(() => {
    logger.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
      logger.info('HTTP server closed');
    }
    await closeDatabase();
    logger.info('Database pool closed');
    clearTimeout(forceExit);
    process.exit(exitCode);
  } catch (error) {
    logger.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  }
}

async function bootstrap(): Promise<void> {
  await connectDatabase();
  logger.info('Database connected');
  // Seeds the provider keys from the env file on the very first boot, then loads
  // them into memory. Nothing reaches a provider before this has run.
  await seedLlmConfig();
  // The processing queue lives in memory, so anything it held before a restart is gone.
  await failInterruptedDocuments();

  const app = createApp();
  server = app.listen(config.app.port, () => {
    logger.info({ port: config.app.port, env: config.app.env }, 'Server listening');
  });
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM', 0);
});
process.on('SIGINT', () => {
  void shutdown('SIGINT', 0);
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  void shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  void shutdown('uncaughtException', 1);
});

bootstrap().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Failed to start application');
  void shutdown('bootstrapFailure', 1);
});
