import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import express from 'express';
import { readRuntimeConfig } from './config/environment';
import { readUpdateRepositoryConfig } from './updates/update-config';
import { readNotificationProviderConfig } from './notification/notification-config';

async function bootstrap() {
  const config = readRuntimeConfig();
  if (config.processRole === 'worker') throw new Error('PROCESS_ROLE=worker must start dist/worker instead of dist/main');
  // Validate optional repository trust configuration before opening a network port.
  readUpdateRepositoryConfig();
  // Optional providers do not block core operation when absent, but partial or
  // malformed credential sets fail before the server opens a network port.
  readNotificationProviderConfig();
  const app = await NestFactory.create(AppModule, {
    logger: config.nodeEnv === 'production'
      ? ['error', 'warn']
      : ['log', 'error', 'warn'],
  });

  // Security headers (X-Frame-Options, X-Content-Type-Options, HSTS, etc.)
  app.use(helmet());

  // Parse cookies (needed for HttpOnly token cookies)
  app.use(cookieParser());

  // Body size limits to prevent DoS via large payloads
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Compress all responses
  app.use(compression());

  // Global input validation — strips unknown properties, rejects invalid data
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // CORS — use env var in production
  const allowedOrigins = config.corsOrigins.length
    ? config.corsOrigins
    : ['http://localhost:3000', 'http://localhost:3004'];
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, server-to-server, curl)
      if (!origin) return callback(null, true);
      // Allow configured origins
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });

  // Without useProcessExit, Nest re-delivers the same signal to itself after cleanup finishes
  // (having removed its own listener first), so the process dies via the raw signal rather than
  // a clean exit -- indistinguishable from a crash to anything watching the exit code. worker.ts
  // avoids this by calling process.exit(0) itself; do the equivalent here for consistency.
  app.enableShutdownHooks(undefined, { useProcessExit: true });

  await app.listen(config.port, '0.0.0.0');
  console.log(`API server running on port ${config.port} (${config.processRole} role)`);
}
bootstrap().catch((error) => {
  console.error('API startup failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
