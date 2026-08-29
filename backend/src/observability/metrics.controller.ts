import { Controller, Get, Header, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { MetricsService } from './metrics.service';
import { readMetricsToken } from './metrics-config';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = readMetricsToken();
    if (!token) throw new UnauthorizedException('METRICS_TOKEN is not configured; /metrics is disabled by default');
    const header = request.header('authorization') || '';
    const supplied = header.startsWith('Bearer ') ? Buffer.from(header.slice(7)) : Buffer.alloc(0);
    const expected = Buffer.from(token);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new UnauthorizedException('Invalid metrics token');
    return this.metrics.renderPrometheusText();
  }
}
