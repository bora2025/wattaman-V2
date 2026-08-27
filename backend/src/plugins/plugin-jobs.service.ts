import { BadRequestException, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PluginJobsService implements OnApplicationShutdown {
  private readonly logger = new Logger(PluginJobsService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly running = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  async register(pluginId: string, definition: { id: string; intervalSeconds: number; handler(): void | Promise<void> }) {
    if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(definition.id)) throw new BadRequestException('Plugin job id is invalid');
    const minimum = process.env.NODE_ENV === 'test' ? 1 : 60;
    if (!Number.isInteger(definition.intervalSeconds) || definition.intervalSeconds < minimum || definition.intervalSeconds > 31_536_000) {
      throw new BadRequestException(`Plugin job interval must be ${minimum}..31536000 seconds`);
    }
    const key = `${pluginId}:${definition.id}`;
    if (this.timers.has(key)) throw new BadRequestException(`Plugin job is already registered: ${definition.id}`);
    await this.prisma.pluginJobDefinition.upsert({
      where: { pluginId_jobId: { pluginId, jobId: definition.id } },
      create: { pluginId, jobId: definition.id, intervalSeconds: definition.intervalSeconds },
      update: { intervalSeconds: definition.intervalSeconds, enabled: true },
    });
    const timer = setInterval(() => this.run(pluginId, definition.id, definition.handler), definition.intervalSeconds * 1000);
    timer.unref();
    this.timers.set(key, timer);
    return () => this.unregister(pluginId, definition.id);
  }

  unregister(pluginId: string, jobId: string) {
    const key = `${pluginId}:${jobId}`;
    const timer = this.timers.get(key);
    if (timer) clearInterval(timer);
    this.timers.delete(key);
  }

  async clear(pluginId: string) {
    for (const key of [...this.timers.keys()]) if (key.startsWith(`${pluginId}:`)) this.unregister(pluginId, key.slice(pluginId.length + 1));
    await this.prisma.pluginJobDefinition.updateMany({ where: { pluginId }, data: { enabled: false } });
  }

  async run(pluginId: string, jobId: string, handler: () => void | Promise<void>) {
    const key = `${pluginId}:${jobId}`;
    if (this.running.has(key)) return;
    this.running.add(key);
    const startedAt = new Date();
    const run = await this.prisma.pluginJobRun.create({ data: { pluginId, jobId, status: 'running', startedAt } });
    await this.prisma.pluginJobDefinition.update({ where: { pluginId_jobId: { pluginId, jobId } }, data: { lastStartedAt: startedAt, lastStatus: 'running', lastError: null } });
    try {
      await handler();
      const finishedAt = new Date();
      await this.prisma.$transaction([
        this.prisma.pluginJobRun.update({ where: { id: run.id }, data: { status: 'completed', finishedAt } }),
        this.prisma.pluginJobDefinition.update({ where: { pluginId_jobId: { pluginId, jobId } }, data: { lastCompletedAt: finishedAt, lastStatus: 'completed' } }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const finishedAt = new Date();
      this.logger.error(`Plugin job ${key} failed: ${message}`);
      await this.prisma.$transaction([
        this.prisma.pluginJobRun.update({ where: { id: run.id }, data: { status: 'failed', finishedAt, error: message } }),
        this.prisma.pluginJobDefinition.update({ where: { pluginId_jobId: { pluginId, jobId } }, data: { lastCompletedAt: finishedAt, lastStatus: 'failed', lastError: message } }),
      ]);
    } finally { this.running.delete(key); }
  }

  onApplicationShutdown() { for (const timer of this.timers.values()) clearInterval(timer); this.timers.clear(); }
}
