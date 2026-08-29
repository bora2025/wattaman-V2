import { BadRequestException, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';
import { runsBackgroundJobs } from '../config/environment';

@Injectable()
export class PluginJobsService implements OnApplicationShutdown {
  private readonly logger = new Logger(PluginJobsService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly definitions = new Set<string>();
  private readonly running = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  async register(pluginId: string, definition: { id: string; intervalSeconds: number; handler(): void | Promise<void> }) {
    if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(definition.id)) throw new BadRequestException('Plugin job id is invalid');
    const minimum = process.env.NODE_ENV === 'test' ? 1 : 60;
    if (!Number.isInteger(definition.intervalSeconds) || definition.intervalSeconds < minimum || definition.intervalSeconds > 31_536_000) {
      throw new BadRequestException(`Plugin job interval must be ${minimum}..31536000 seconds`);
    }
    const key = `${pluginId}:${definition.id}`;
    if (this.definitions.has(key)) throw new BadRequestException(`Plugin job is already registered: ${definition.id}`);
    await this.prisma.pluginJobDefinition.upsert({
      where: { pluginId_jobId: { pluginId, jobId: definition.id } },
      create: { pluginId, jobId: definition.id, intervalSeconds: definition.intervalSeconds },
      update: { intervalSeconds: definition.intervalSeconds, enabled: true },
    });
    if (runsBackgroundJobs()) {
      const timer = setInterval(() => this.run(pluginId, definition.id, definition.handler), definition.intervalSeconds * 1000);
      timer.unref();
      this.timers.set(key, timer);
    }
    this.definitions.add(key);
    return () => this.unregister(pluginId, definition.id);
  }

  unregister(pluginId: string, jobId: string) {
    const key = `${pluginId}:${jobId}`;
    const timer = this.timers.get(key);
    if (timer) clearInterval(timer);
    this.timers.delete(key);
    this.definitions.delete(key);
  }

  async clear(pluginId: string) {
    for (const key of [...this.definitions]) if (key.startsWith(`${pluginId}:`)) this.unregister(pluginId, key.slice(pluginId.length + 1));
    await this.prisma.pluginJobDefinition.updateMany({ where: { pluginId }, data: { enabled: false } });
  }

  async run(pluginId: string, jobId: string, handler: () => void | Promise<void>) {
    const key = `${pluginId}:${jobId}`;
    if (this.running.has(key)) return;
    this.running.add(key);
    try {
      await this.prisma.$transaction(async (tx) => {
        const lock = await tx.$queryRawUnsafe<Array<{ acquired: boolean }>>(
          'SELECT pg_try_advisory_xact_lock(hashtext($1), hashtext($2)) AS acquired', pluginId, jobId,
        );
        if (!lock[0]?.acquired) return;
        await this.executeClaimed(tx, pluginId, jobId, handler);
      }, { maxWait: 5_000, timeout: 24 * 60 * 60 * 1000 });
    } catch (error) {
      this.logger.error(`Plugin job ${key} transaction failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally { this.running.delete(key); }
  }

  private async executeClaimed(tx: Prisma.TransactionClient, pluginId: string, jobId: string, handler: () => void | Promise<void>) {
    const startedAt = new Date();
    const run = await tx.pluginJobRun.create({ data: { pluginId, jobId, status: 'running', startedAt } });
    await tx.pluginJobDefinition.update({ where: { pluginId_jobId: { pluginId, jobId } }, data: { lastStartedAt: startedAt, lastStatus: 'running', lastError: null } });
    try {
      await handler();
      const finishedAt = new Date();
      await tx.pluginJobRun.update({ where: { id: run.id }, data: { status: 'completed', finishedAt } });
      await tx.pluginJobDefinition.update({ where: { pluginId_jobId: { pluginId, jobId } }, data: { lastCompletedAt: finishedAt, lastStatus: 'completed' } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const finishedAt = new Date();
      this.logger.error(`Plugin job ${pluginId}:${jobId} failed: ${message}`);
      await tx.pluginJobRun.update({ where: { id: run.id }, data: { status: 'failed', finishedAt, error: message } });
      await tx.pluginJobDefinition.update({ where: { pluginId_jobId: { pluginId, jobId } }, data: { lastCompletedAt: finishedAt, lastStatus: 'failed', lastError: message } });
    }
  }

  onApplicationShutdown() { for (const timer of this.timers.values()) clearInterval(timer); this.timers.clear(); this.definitions.clear(); }
}
