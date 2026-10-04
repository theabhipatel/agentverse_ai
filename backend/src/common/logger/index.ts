import pino from 'pino';
import { config } from '../../config/env.js';

export const logger = pino({
  level: config.log.level,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'accessToken', 'refreshToken'],
    remove: true,
  },
  ...(config.app.isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});

export type Logger = typeof logger;
