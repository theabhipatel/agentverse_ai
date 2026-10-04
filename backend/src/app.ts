import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { config } from './config/env.js';
import { errorHandler } from './common/middleware/errorHandler.js';
import { notFoundHandler } from './common/middleware/notFoundHandler.js';
import { requestContext } from './common/middleware/requestContext.js';
import { sendSuccess } from './common/utils/apiResponse.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { agentRouter } from './modules/agent/agent.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { conversationRouter } from './modules/conversation/conversation.routes.js';
import { integrationRouter } from './modules/integration/integration.routes.js';
import { knowledgeRouter } from './modules/knowledge/knowledge.routes.js';
import { llmAdminRouter, llmRouter } from './modules/llm/llm.routes.js';
import { transcriptionRouter } from './modules/transcription/transcription.routes.js';
import { voiceRouter } from './modules/voice/voice.routes.js';

/** Builds the Express application. Knows nothing about ports or process lifecycle. */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: config.app.clientUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestContext);

  app.get('/api/health', (_req, res) => {
    sendSuccess(res, { status: 'ok', env: config.app.env });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/agents', agentRouter);
  app.use('/api/conversations', conversationRouter);
  app.use('/api/integrations', integrationRouter);
  // Before the admin router, whose auth middleware would otherwise run twice on these paths.
  app.use('/api/llm', llmRouter);
  app.use('/api/admin/knowledge', knowledgeRouter);
  app.use('/api/admin/llm', llmAdminRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/transcribe', transcriptionRouter);
  app.use('/api/voice', voiceRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
