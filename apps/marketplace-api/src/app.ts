import { PrismaClient } from '@prisma/client';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import multer from 'multer';
import { ZodError } from 'zod';
import { MarketplaceConfig } from './config';
import { HttpError } from './http-error';
import { RepositoryService } from './repository.service';

function adminGuard(expected: string) {
  const expectedBytes = Buffer.from(expected);
  return (request: Request, _response: Response, next: NextFunction) => {
    const header = request.header('authorization') || '';
    const supplied = header.startsWith('Bearer ') ? Buffer.from(header.slice(7)) : Buffer.alloc(0);
    if (supplied.length !== expectedBytes.length || !timingSafeEqual(supplied, expectedBytes)) return next(new HttpError(401, 'Unauthorized'));
    next();
  };
}

export function createApp(prisma: PrismaClient, config: MarketplaceConfig) {
  const app = express();
  const repository = new RepositoryService(prisma, config);
  const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: config.maxArtifactBytes, fields: 10 } });
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));

  app.get('/health/live', (_request, response) => response.json({ status: 'alive' }));
  app.get('/health/ready', async (_request, response, next) => { try { response.json(await repository.health()); } catch (error) { next(error); } });
  app.get('/v1/repository-key', (_request, response) => response.json(repository.keyDocument()));
  app.get('/v1/index', async (request, response, next) => {
    try { response.json(await repository.signedIndex(String(request.query.coreVersion || ''), String(request.query.channel || 'stable'))); }
    catch (error) { next(error); }
  });
  app.get('/v1/artifacts/:sha256', async (request, response, next) => {
    try {
      const result = await repository.artifact(request.params.sha256);
      await repository.recordDownload(result.artifact.pluginVersionId, result.artifact.sha256);
      response.set({
        'Content-Type': 'application/vnd.wattanam.plugin+zip',
        'Content-Length': String(result.artifact.sizeBytes),
        'Content-Disposition': `attachment; filename="${result.artifact.pluginVersion.pluginId}-${result.artifact.pluginVersion.version}.wtp"`,
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: `"sha256-${result.artifact.sha256}"`,
      });
      createReadStream(result.path).on('error', next).pipe(response);
    } catch (error) { next(error); }
  });

  const requireAdmin = adminGuard(config.adminToken);
  app.post('/admin/v1/publishers', requireAdmin, async (request, response, next) => {
    try { response.status(201).json(await repository.createOfficialPublisher(request.body)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/plugin-releases', requireAdmin, upload.single('package'), async (request, response, next) => {
    try {
      if (!request.file?.buffer || !request.file.originalname.endsWith('.wtp')) throw new HttpError(400, 'A .wtp package is required');
      response.status(201).json(await repository.publishPlugin(request.body, request.file.buffer));
    } catch (error) { next(error); }
  });
  app.post('/admin/v1/core-releases', requireAdmin, async (request, response, next) => {
    try { response.status(201).json(await repository.publishCoreRelease(request.body)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/advisories', requireAdmin, async (request, response, next) => {
    try { response.status(201).json(await repository.publishAdvisory(request.body)); } catch (error) { next(error); }
  });

  app.use((_request, _response, next) => next(new HttpError(404, 'Not found')));
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof HttpError) return response.status(error.status).json({ error: error.message });
    if (error instanceof ZodError) return response.status(400).json({ error: 'Invalid request', details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) });
    if (error instanceof multer.MulterError) return response.status(400).json({ error: error.message });
    const code = (error as { code?: string }).code;
    if (code === 'P2002') return response.status(409).json({ error: 'Record already exists' });
    console.error(error);
    return response.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
