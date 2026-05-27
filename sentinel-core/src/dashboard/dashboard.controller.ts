import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // ─── SSE Streams ──────────────────────────────────────────────

  @Get('stream')
  streamOverview(@Res() res: Response) {
    this.sseHeaders(res);
    this.dashboardService.addConnection('overview', {}, res);
  }

  @Get('stream/clients/:id')
  streamClientDetail(@Param('id') id: string, @Res() res: Response) {
    this.sseHeaders(res);
    this.dashboardService.addConnection('client-detail', { clientId: id }, res);
  }

  @Get('stream/providers/:id')
  streamProviderDetail(@Param('id') id: string, @Res() res: Response) {
    this.sseHeaders(res);
    this.dashboardService.addConnection(
      'provider-detail',
      { providerId: id },
      res,
    );
  }

  @Get('stream/providers')
  streamProviderList(@Res() res: Response) {
    this.sseHeaders(res);
    this.dashboardService.addConnection('provider-list', {}, res);
  }

  // ─── History REST ────────────────────────────────────────────

  @Get('history/requests')
  historyRequests(
    @Query('clientId') clientId?: string,
    @Query('providerId') providerId?: string,
    @Query('range') range = '1h',
    @Query('step') step = '5m',
  ) {
    return this.dashboardService.getHistoryRequests(
      { clientId, providerId },
      range,
      step,
    );
  }

  // TODO: Implement remaining history endpoints
  @Get('history/errors')
  historyErrors() {
    return [];
  }

  @Get('history/latency')
  historyLatency() {
    return [];
  }

  @Get('history/tokens')
  historyTokens() {
    return [];
  }

  // ─── Helper ──────────────────────────────────────────────────

  private sseHeaders(res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  }
}
