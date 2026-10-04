import 'dotenv/config';
import { z } from 'zod';

/**
 * The only place in the codebase allowed to read process.env.
 * Everything else imports the validated `config` object below.
 */

const booleanFromString = z.enum(['true', 'false']).default('false');

/** An unset variable and an empty one mean the same thing in a .env file. */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), schema.optional());

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    CLIENT_URL: z.string().url(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    ACCESS_TOKEN_SECRET: z.string().min(32, 'must be at least 32 characters'),
    ACCESS_TOKEN_EXPIRES_IN: z.string().min(1).default('15m'),
    REFRESH_TOKEN_SECRET: z.string().min(32, 'must be at least 32 characters'),
    REFRESH_TOKEN_EXPIRES_IN: z.string().min(1).default('7d'),
    COOKIE_SECURE: booleanFromString,
    // Encrypts the provider API keys held in the database. Any random string: the
    // 32 byte cipher key is derived from it.
    ENCRYPTION_KEY: z.string().min(32, 'must be at least 32 characters'),

    // The first administrator, created on boot when the database has no account for it.
    ADMIN_EMAIL: optional(z.string().email()),
    ADMIN_PASSWORD: optional(z.string().min(4)),
    ADMIN_NAME: z.string().min(1).default('Admin'),

    GOOGLE_CLIENT_ID: optional(z.string().min(1)),
    GOOGLE_CLIENT_SECRET: optional(z.string().min(1)),
    GOOGLE_CALLBACK_URL: optional(z.string().url()),

    APP_NAME: z.string().min(1).default('AgentVerse AI'),

    // Everything from here to COMPOSIO_API_KEY is the first run seed for the
    // provider keys and models. Once they are in the database, Admin > AI models
    // owns them and these values are never read again.
    LLM_PROVIDER: z.enum(['minimax', 'openrouter', 'openai', 'glm']).default('openrouter'),
    MINIMAX_API_KEY: optional(z.string().min(1)),
    MINIMAX_BASE_URL: z.string().url().default('https://api.minimax.io/v1'),
    MINIMAX_MODEL: z.string().min(1).default('MiniMax-M3'),
    OPENROUTER_API_KEY: optional(z.string().min(1)),
    OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
    OPENROUTER_MODEL: optional(z.string().min(1)),
    GLM_API_KEY: optional(z.string().min(1)),
    ELEVENLABS_API_KEY: optional(z.string().min(1)),

    // Outbound email. Optional: without SMTP_HOST the password reset route answers 503.
    SMTP_HOST: optional(z.string().min(1)),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: booleanFromString,
    SMTP_USER: optional(z.string().min(1)),
    SMTP_PASSWORD: optional(z.string().min(1)),
    MAIL_FROM: optional(z.string().min(1)),
    PASSWORD_RESET_EXPIRES_IN: z.string().min(1).default('15m'),

    // Speech to text.
    GROQ_API_KEY: optional(z.string().min(1)),
    GROQ_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
    STT_MODEL: z.string().min(1).default('whisper-large-v3'),

    // Text to speech for voice chat. It runs on the MiniMax account key.
    TTS_MODEL: z.string().min(1).default('speech-2.8-turbo'),
    TTS_VOICE: z.string().min(1).default('English_ConfidentWoman'),

    COMPOSIO_API_KEY: z.string().min(1),
    COMPOSIO_CALLBACK_URL: z.string().url(),

    // Intelligence Hub embeddings, and the OpenAI chat provider: one account key.
    OPENAI_API_KEY: optional(z.string().min(1)),
    EMBEDDING_MODEL: z.string().min(1).default('text-embedding-3-small'),

    // S3 compatible object storage (MinIO) for Intelligence Hub files.
    // Optional: without it, file uploads answer 503. URL documents still work.
    S3_ENDPOINT: optional(z.string().url()),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_ACCESS_KEY: optional(z.string().min(1)),
    S3_SECRET_KEY: optional(z.string().min(8)),
    S3_BUCKET: z.string().min(3).default('agentverse-intelligence-hub'),
  })
  .superRefine((env, ctx) => {
    if (env.ACCESS_TOKEN_SECRET === env.REFRESH_TOKEN_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REFRESH_TOKEN_SECRET'],
        message: 'must be different from ACCESS_TOKEN_SECRET',
      });
    }

    // Mail is optional, but a host without a sender address cannot send anything.
    if (env.SMTP_HOST && !env.MAIL_FROM) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MAIL_FROM'],
        message: 'required when SMTP_HOST is set',
      });
    }

    // Seeding is optional. Half a credential pair is always a mistake.
    if (Boolean(env.ADMIN_EMAIL) !== Boolean(env.ADMIN_PASSWORD)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [env.ADMIN_EMAIL ? 'ADMIN_PASSWORD' : 'ADMIN_EMAIL'],
        message: 'ADMIN_EMAIL and ADMIN_PASSWORD must be set together',
      });
    }

    // Storage is optional, but a partial set of credentials is always a mistake.
    const storageKeys = ['S3_ENDPOINT', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const;
    if (storageKeys.some((key) => env[key])) {
      for (const key of storageKeys) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: 'required when file storage is configured',
          });
        }
      }
    }

    // Google login is optional for now. Once credentials are supplied it is all-or-nothing.
    const googleKeys = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'] as const;
    const hasGoogleCredentials = Boolean(env.GOOGLE_CLIENT_ID) || Boolean(env.GOOGLE_CLIENT_SECRET);
    if (hasGoogleCredentials) {
      for (const key of googleKeys) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: 'required when Google login is configured',
          });
        }
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // The logger depends on config, so this failure is reported on stderr directly.
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  process.stderr.write(`\nInvalid environment configuration:\n${details}\n\nApplication not started.\n\n`);
  process.exit(1);
}

const env = parsed.data;

/** The providers whose keys and models the admin manages. */
export type SeedProvider = 'minimax' | 'openrouter' | 'openai' | 'glm' | 'groq' | 'elevenlabs';

/**
 * First run values only. On the first boot they are copied into the database,
 * encrypted, and from then on the admin owns them and these are never read again.
 */
export interface LlmSeedConfig {
  readonly provider: 'minimax' | 'openrouter' | 'openai' | 'glm';
  readonly keys: Readonly<Record<SeedProvider, string>>;
  readonly baseUrls: Readonly<Record<'minimax' | 'openrouter' | 'groq', string>>;
  readonly chatModels: Readonly<Record<'minimax' | 'openrouter', string>>;
  readonly sttModel: string;
  readonly ttsModel: string;
  readonly ttsVoice: string;
  readonly embeddingModel: string;
}

export interface AppConfig {
  readonly app: {
    readonly env: 'development' | 'test' | 'production';
    readonly isProduction: boolean;
    readonly port: number;
    readonly clientUrl: string;
    readonly name: string;
  };
  readonly log: { readonly level: string };
  readonly db: { readonly url: string };
  readonly auth: {
    readonly access: { readonly secret: string; readonly expiresIn: string };
    readonly refresh: { readonly secret: string; readonly expiresIn: string };
    readonly cookie: { readonly secure: boolean; readonly path: string };
  };
  readonly admin: {
    readonly enabled: boolean;
    readonly email: string;
    readonly password: string;
    readonly name: string;
  };
  readonly google: {
    readonly enabled: boolean;
    readonly clientId: string;
    readonly clientSecret: string;
    readonly callbackUrl: string;
  };
  readonly encryption: { readonly key: string };
  readonly llmSeed: LlmSeedConfig;
  readonly mail: {
    readonly enabled: boolean;
    readonly host: string;
    readonly port: number;
    readonly secure: boolean;
    readonly user: string;
    readonly password: string;
    readonly from: string;
    readonly resetExpiresIn: string;
  };
  readonly composio: {
    readonly apiKey: string;
    readonly callbackUrl: string;
  };
  readonly storage: {
    readonly enabled: boolean;
    readonly endpoint: string;
    readonly region: string;
    readonly accessKey: string;
    readonly secretKey: string;
    readonly bucket: string;
  };
}

export const config: AppConfig = Object.freeze({
  app: Object.freeze({
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.PORT,
    clientUrl: env.CLIENT_URL,
    name: env.APP_NAME,
  }),
  log: Object.freeze({ level: env.LOG_LEVEL }),
  db: Object.freeze({ url: env.DATABASE_URL }),
  auth: Object.freeze({
    access: Object.freeze({
      secret: env.ACCESS_TOKEN_SECRET,
      expiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
    }),
    refresh: Object.freeze({
      secret: env.REFRESH_TOKEN_SECRET,
      expiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
    }),
    // Path scoping keeps the refresh cookie off every non-auth request.
    cookie: Object.freeze({ secure: env.COOKIE_SECURE === 'true', path: '/api/auth' }),
  }),
  admin: Object.freeze({
    enabled: Boolean(env.ADMIN_EMAIL && env.ADMIN_PASSWORD),
    email: env.ADMIN_EMAIL ?? '',
    password: env.ADMIN_PASSWORD ?? '',
    name: env.ADMIN_NAME,
  }),
  google: Object.freeze({
    enabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CALLBACK_URL),
    clientId: env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
    callbackUrl: env.GOOGLE_CALLBACK_URL ?? '',
  }),
  encryption: Object.freeze({ key: env.ENCRYPTION_KEY }),
  llmSeed: Object.freeze({
    provider: env.LLM_PROVIDER,
    keys: Object.freeze({
      minimax: env.MINIMAX_API_KEY ?? '',
      openrouter: env.OPENROUTER_API_KEY ?? '',
      openai: env.OPENAI_API_KEY ?? '',
      glm: env.GLM_API_KEY ?? '',
      groq: env.GROQ_API_KEY ?? '',
      elevenlabs: env.ELEVENLABS_API_KEY ?? '',
    }),
    baseUrls: Object.freeze({
      minimax: env.MINIMAX_BASE_URL,
      openrouter: env.OPENROUTER_BASE_URL,
      groq: env.GROQ_BASE_URL,
    }),
    chatModels: Object.freeze({ minimax: env.MINIMAX_MODEL, openrouter: env.OPENROUTER_MODEL ?? '' }),
    sttModel: env.STT_MODEL,
    ttsModel: env.TTS_MODEL,
    ttsVoice: env.TTS_VOICE,
    embeddingModel: env.EMBEDDING_MODEL,
  }),
  mail: Object.freeze({
    enabled: Boolean(env.SMTP_HOST && env.MAIL_FROM),
    host: env.SMTP_HOST ?? '',
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER ?? '',
    password: env.SMTP_PASSWORD ?? '',
    from: env.MAIL_FROM ?? '',
    resetExpiresIn: env.PASSWORD_RESET_EXPIRES_IN,
  }),
  composio: Object.freeze({
    apiKey: env.COMPOSIO_API_KEY,
    callbackUrl: env.COMPOSIO_CALLBACK_URL,
  }),
  storage: Object.freeze({
    enabled: Boolean(env.S3_ENDPOINT && env.S3_ACCESS_KEY && env.S3_SECRET_KEY),
    endpoint: env.S3_ENDPOINT ?? '',
    region: env.S3_REGION,
    accessKey: env.S3_ACCESS_KEY ?? '',
    secretKey: env.S3_SECRET_KEY ?? '',
    bucket: env.S3_BUCKET,
  }),
});
