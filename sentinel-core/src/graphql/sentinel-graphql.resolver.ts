import {
  ForbiddenException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { Args, Context, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Request } from 'express';

import { AuthService } from '../auth/auth.service';
import { CeoSecretService } from '../auth/ceo-secret.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { GatewayService } from '../gateway/gateway.service';
import { IncidentsService } from '../incidents/incidents.service';
import type { IncidentLogEntity } from '../incidents/entities/incident-log.entity';
import type { IncidentEntity } from '../incidents/entities/incident.entity';
import { MessengerWebhookService } from '../messenger/messenger-webhook.service';
import { MetricsService } from '../metrics/metrics.service';
import type { GatewayMetrics, MetricsScope } from '../metrics/types/metrics.types';
import { MonitoringService } from '../monitoring/monitoring.service';
import type { CheckResult, MonitoringStatusReport } from '../monitoring/interfaces/check-result.interface';
import type { MonitoringRuleEntity } from '../monitoring/entities/monitoring-rule.entity';
import { UsersService } from '../users/users.service';
import type { UserEntity } from '../users/entities/user.entity';
import { WebhooksService } from '../webhooks/webhooks.service';
import type { WebhookDelivery } from '../webhooks/types/webhook-delivery.model';
import type { PublicWebhook } from '../webhooks/types/webhook.model';
import { WebhookEventType } from '../webhooks/types/webhook-event-type.enum';
import type {
  PublicMessengerInboundEvent,
  MessengerRecipientSummary,
} from '../messenger/types/messenger-inbound-event.model';
import { IncidentStatus } from '../incidents/enum/incident-status.enum';
import { IncidentSeverity } from '../incidents/enum/incident-severity.enum';
import type { IncidentSnapshot } from '../incidents/incidents.service';
import { GqlJwtAuthGuard } from './gql-jwt-auth.guard';
import {
  AddServiceHeaderInput,
  AuthPayloadGql,
  CreateIncidentInput,
  CreateMonitoringRuleInput,
  CreateWebhookInput,
  DashboardOverviewGql,
  EmitWebhookEventInput,
  GatewayConsumerGql,
  GatewayConsumerInput,
  GatewayConsumerUpdateInput,
  GatewayMetricsGql,
  GatewayPluginGql,
  GatewayRouteGql,
  GatewayRouteInput,
  GatewayRouteUpdateInput,
  GatewayServiceGql,
  GatewayServiceInput,
  GatewayServiceUpdateInput,
  IncidentActionInput,
  IncidentGql,
  IncidentLogGql,
  IncidentSnapshotGql,
  LoginInput,
  MessengerInboundEventGql,
  MessengerRecipientGql,
  MetricsScopeInput,
  MonitoringCheckResultGql,
  MonitoringRuleGql,
  MonitoringStatusReportGql,
  RegisterInput,
  SendIncidentMessageInput,
  UpdateMonitoringRuleInput,
  UpdateWebhookInput,
  UserGql,
  WebhookDeliveryGql,
  WebhookEmitResultGql,
  WebhookGql,
} from './sentinel-graphql.types';

type GqlRequest = Request & { user: AuthenticatedUser };
type GqlContext = { req: GqlRequest };
type UnknownRecord = Record<string, unknown>;

@Resolver()
export class SentinelGraphqlResolver {
  constructor(
    private readonly authService: AuthService,
    private readonly ceoSecretService: CeoSecretService,
    private readonly usersService: UsersService,
    private readonly gatewayService: GatewayService,
    private readonly incidentsService: IncidentsService,
    private readonly monitoringService: MonitoringService,
    private readonly metricsService: MetricsService,
    private readonly webhooksService: WebhooksService,
    private readonly messengerService: MessengerWebhookService,
  ) {}

  @Query(() => String)
  graphqlHealth(): string {
    return 'Sentinel GraphQL is ready';
  }

  @Mutation(() => AuthPayloadGql)
  async register(@Args('input') input: RegisterInput): Promise<AuthPayloadGql> {
    return this.authService.register(input);
  }

  @Mutation(() => AuthPayloadGql)
  async login(@Args('input') input: LoginInput): Promise<AuthPayloadGql> {
    return this.authService.login(input);
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => UserGql)
  me(@Context() context: GqlContext): UserGql {
    return context.req.user;
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => String)
  logout(): string {
    return this.authService.logout().message;
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => [UserGql])
  async admins(): Promise<UserGql[]> {
    const users = await this.usersService.findAll();
    return users.map((user) => this.mapUser(user));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => UserGql)
  async deactivateAdmin(
    @Args('id', { type: () => ID }) id: string,
    @Args('ceoSecret') ceoSecret: string,
    @Context() context: GqlContext,
  ): Promise<UserGql> {
    this.ceoSecretService.validateOrThrow(ceoSecret);

    if (context.req.user.id === id) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }

    const user = await this.usersService.deactivateUser(id);
    if (!user) {
      throw new NotFoundException('Admin not found');
    }

    return this.mapUser(user);
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => DashboardOverviewGql)
  async dashboardOverview(
    @Context() context: GqlContext,
  ): Promise<DashboardOverviewGql> {
    const [incidents, services] = await Promise.all([
      this.incidentsService.listIncidents(IncidentStatus.OPEN),
      this.gatewayService.listServices(),
    ]);

    return {
      me: context.req.user,
      openIncidents: incidents.map((incident) => this.mapIncident(incident)),
      monitoringStatus: this.mapMonitoringStatus(
        this.monitoringService.getLastReport(),
      ),
      gatewayServices: services.map((service) =>
        this.mapGatewayService(service),
      ),
    };
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => [GatewayServiceGql])
  async gatewayServices(): Promise<GatewayServiceGql[]> {
    const services = await this.gatewayService.listServices();
    return services.map((service) => this.mapGatewayService(service));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => GatewayServiceGql, { name: 'gatewayService' })
  async gatewayServiceById(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<GatewayServiceGql> {
    return this.mapGatewayService(await this.gatewayService.getService(id));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => GatewayServiceGql)
  async createGatewayService(
    @Args('input') input: GatewayServiceInput,
  ): Promise<GatewayServiceGql> {
    return this.mapGatewayService(await this.gatewayService.createService(input));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => GatewayServiceGql)
  async updateGatewayService(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: GatewayServiceUpdateInput,
  ): Promise<GatewayServiceGql> {
    return this.mapGatewayService(
      await this.gatewayService.updateService({ ...input, id }),
    );
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => Boolean)
  async deleteGatewayService(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.gatewayService.deleteService(id);
    return true;
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => GatewayPluginGql)
  async addServiceApiKey(
    @Args('serviceId', { type: () => ID }) serviceId: string,
    @Args('apiKey') apiKey: string,
  ): Promise<GatewayPluginGql> {
    return this.mapGatewayPlugin(
      await this.gatewayService.addBearerTokenToService(serviceId, apiKey),
    );
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => GatewayPluginGql)
  async addServiceHeader(
    @Args('serviceId', { type: () => ID }) serviceId: string,
    @Args('input') input: AddServiceHeaderInput,
  ): Promise<GatewayPluginGql> {
    return this.mapGatewayPlugin(
      await this.gatewayService.addHeaderToService(
        serviceId,
        input.headerName,
        input.headerValue,
      ),
    );
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => [GatewayRouteGql])
  async gatewayRoutes(): Promise<GatewayRouteGql[]> {
    const routes = await this.gatewayService.listRoutes();
    return routes.map((route) => this.mapGatewayRoute(route));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => GatewayRouteGql)
  async gatewayRoute(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<GatewayRouteGql> {
    return this.mapGatewayRoute(await this.gatewayService.getRoute(id));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => GatewayRouteGql)
  async createGatewayRoute(
    @Args('serviceId', { type: () => ID }) serviceId: string,
    @Args('input') input: GatewayRouteInput,
  ): Promise<GatewayRouteGql> {
    return this.mapGatewayRoute(
      await this.gatewayService.createRoute(serviceId, input),
    );
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => GatewayRouteGql)
  async updateGatewayRoute(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: GatewayRouteUpdateInput,
  ): Promise<GatewayRouteGql> {
    return this.mapGatewayRoute(
      await this.gatewayService.updateRoute({ ...input, id }),
    );
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => Boolean)
  async deleteGatewayRoute(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.gatewayService.deleteRoute(id);
    return true;
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => [GatewayConsumerGql])
  async gatewayConsumers(): Promise<GatewayConsumerGql[]> {
    const consumers = await this.gatewayService.listConsumers();
    return consumers.map((consumer) => this.mapGatewayConsumer(consumer));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => GatewayConsumerGql)
  async gatewayConsumer(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<GatewayConsumerGql> {
    return this.mapGatewayConsumer(await this.gatewayService.getConsumer(id));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => GatewayConsumerGql)
  async createGatewayConsumer(
    @Args('input') input: GatewayConsumerInput,
  ): Promise<GatewayConsumerGql> {
    return this.mapGatewayConsumer(
      await this.gatewayService.createConsumer(input),
    );
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => GatewayConsumerGql)
  async updateGatewayConsumer(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: GatewayConsumerUpdateInput,
  ): Promise<GatewayConsumerGql> {
    return this.mapGatewayConsumer(
      await this.gatewayService.updateConsumer({ ...input, id }),
    );
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => Boolean)
  async deleteGatewayConsumer(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.gatewayService.deleteConsumer(id);
    return true;
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => Boolean)
  async allowConsumerForRoute(
    @Args('routeId', { type: () => ID }) routeId: string,
    @Args('consumerId', { type: () => ID }) consumerId: string,
  ): Promise<boolean> {
    await this.gatewayService.addConsumerToRoute(routeId, consumerId);
    return true;
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => Boolean)
  async revokeConsumerFromRoute(
    @Args('routeId', { type: () => ID }) routeId: string,
    @Args('consumerId', { type: () => ID }) consumerId: string,
  ): Promise<boolean> {
    await this.gatewayService.removeConsumerFromRoute(routeId, consumerId);
    return true;
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => [IncidentGql])
  async incidents(
    @Args('status', { type: () => IncidentStatus, nullable: true })
    status?: IncidentStatus,
  ): Promise<IncidentGql[]> {
    const incidents = await this.incidentsService.listIncidents(status);
    return incidents.map((incident) => this.mapIncident(incident));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => IncidentSnapshotGql)
  async incident(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<IncidentSnapshotGql> {
    return this.mapIncidentSnapshot(
      await this.incidentsService.getIncidentSnapshot(id),
    );
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => IncidentSnapshotGql)
  async createIncident(
    @Args('input') input: CreateIncidentInput,
  ): Promise<IncidentSnapshotGql> {
    return this.mapIncidentSnapshot(
      await this.incidentsService.createIncident(input),
    );
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => IncidentLogGql)
  async sendIncidentMessage(
    @Args('input') input: SendIncidentMessageInput,
  ): Promise<IncidentLogGql> {
    return this.mapIncidentLog(await this.incidentsService.sendMessage(input));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => IncidentSnapshotGql)
  async ackIncident(
    @Args('input') input: IncidentActionInput,
  ): Promise<IncidentSnapshotGql> {
    return this.mapIncidentSnapshot(
      await this.incidentsService.acknowledge(input),
    );
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => IncidentSnapshotGql)
  async resolveIncident(
    @Args('input') input: IncidentActionInput,
  ): Promise<IncidentSnapshotGql> {
    return this.mapIncidentSnapshot(await this.incidentsService.resolve(input));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => [MonitoringRuleGql])
  async monitoringRules(): Promise<MonitoringRuleGql[]> {
    const rules = await this.monitoringService.listRules();
    return rules.map((rule) => this.mapMonitoringRule(rule));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => MonitoringRuleGql)
  async monitoringRule(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<MonitoringRuleGql> {
    return this.mapMonitoringRule(await this.monitoringService.findRule(id));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => MonitoringRuleGql)
  async createMonitoringRule(
    @Args('input') input: CreateMonitoringRuleInput,
  ): Promise<MonitoringRuleGql> {
    return this.mapMonitoringRule(
      await this.monitoringService.createRule(
        input as Parameters<MonitoringService['createRule']>[0],
      ),
    );
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => MonitoringRuleGql)
  async updateMonitoringRule(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateMonitoringRuleInput,
  ): Promise<MonitoringRuleGql> {
    return this.mapMonitoringRule(
      await this.monitoringService.updateRule(
        id,
        input as Parameters<MonitoringService['updateRule']>[1],
      ),
    );
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => Boolean)
  async deleteMonitoringRule(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.monitoringService.deleteRule(id);
    return true;
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => MonitoringStatusReportGql)
  async runMonitoringCheck(): Promise<MonitoringStatusReportGql> {
    return this.mapMonitoringStatus(
      await this.monitoringService.runManualCheck(),
    ) as MonitoringStatusReportGql;
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => MonitoringStatusReportGql, { nullable: true })
  monitoringStatus(): MonitoringStatusReportGql | null {
    return this.mapMonitoringStatus(this.monitoringService.getLastReport());
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => GatewayMetricsGql)
  async gatewayMetrics(
    @Args('scope', { nullable: true }) scope?: MetricsScopeInput,
    @Args('range', { nullable: true }) range?: string,
  ): Promise<GatewayMetricsGql> {
    return this.mapGatewayMetrics(
      await this.metricsService.queryGatewayMetrics(
        this.mapMetricsScope(scope),
        range ?? '5m',
      ),
    );
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => GatewayMetricsGql, { nullable: true })
  latestGatewayMetrics(
    @Args('scope', { nullable: true }) scope?: MetricsScopeInput,
  ): GatewayMetricsGql | null {
    const metrics = this.metricsService.getLatest(this.mapMetricsScope(scope));
    return metrics ? this.mapGatewayMetrics(metrics) : null;
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => Boolean, { nullable: true })
  serviceHealth(@Args('serviceId') serviceId: string): boolean | null {
    return this.metricsService.getServiceHealth(serviceId);
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => [WebhookGql])
  webhooks(
    @Args('isActive', { nullable: true }) isActive?: boolean,
    @Args('eventType', { type: () => WebhookEventType, nullable: true })
    eventType?: WebhookEventType,
  ): WebhookGql[] {
    return this.webhooksService
      .listWebhooks({ isActive, eventType })
      .map((webhook) => this.mapWebhook(webhook));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => WebhookGql)
  webhook(@Args('id', { type: () => ID }) id: string): WebhookGql {
    return this.mapWebhook(this.webhooksService.getWebhook(id));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => [WebhookEventType])
  webhookEventTypes(): WebhookEventType[] {
    return this.webhooksService.listEventTypes();
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => WebhookGql)
  createWebhook(@Args('input') input: CreateWebhookInput): WebhookGql {
    return this.mapWebhook(this.webhooksService.createWebhook(input));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => WebhookGql)
  updateWebhook(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateWebhookInput,
  ): WebhookGql {
    return this.mapWebhook(this.webhooksService.updateWebhook(id, input));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => WebhookGql)
  deactivateWebhook(
    @Args('id', { type: () => ID }) id: string,
  ): WebhookGql {
    return this.mapWebhook(this.webhooksService.deactivateWebhook(id));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => WebhookDeliveryGql)
  async testWebhook(
    @Args('id', { type: () => ID }) id: string,
    @Args('payloadJson', { nullable: true }) payloadJson?: string,
  ): Promise<WebhookDeliveryGql> {
    const payload = payloadJson ? this.parseJson(payloadJson) : undefined;
    return this.mapWebhookDelivery(
      await this.webhooksService.testWebhook(id, { payload }),
    );
  }

  @UseGuards(GqlJwtAuthGuard)
  @Mutation(() => WebhookEmitResultGql)
  async emitWebhookEvent(
    @Args('input') input: EmitWebhookEventInput,
  ): Promise<WebhookEmitResultGql> {
    return this.webhooksService.emit({
      eventType: input.eventType,
      source: input.source,
      payload: this.parseJson(input.payloadJson),
    });
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => [WebhookDeliveryGql])
  webhookDeliveries(
    @Args('webhookId', { nullable: true }) webhookId?: string,
    @Args('eventType', { type: () => WebhookEventType, nullable: true })
    eventType?: WebhookEventType,
    @Args('status', { nullable: true }) status?: string,
  ): WebhookDeliveryGql[] {
    return this.webhooksService
      .listDeliveries({
        webhookId,
        eventType,
        status: status as Parameters<WebhooksService['listDeliveries']>[0]['status'],
      })
      .map((delivery) => this.mapWebhookDelivery(delivery));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => [MessengerInboundEventGql])
  messengerEvents(
    @Args('senderId', { nullable: true }) senderId?: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): MessengerInboundEventGql[] {
    return this.messengerService
      .listEvents({ senderId, limit: limit?.toString() })
      .map((event) => this.mapMessengerEvent(event));
  }

  @UseGuards(GqlJwtAuthGuard)
  @Query(() => [MessengerRecipientGql])
  messengerRecipients(): MessengerRecipientGql[] {
    return this.messengerService
      .listRecipients()
      .map((recipient) => this.mapMessengerRecipient(recipient));
  }

  private mapUser(user: UserEntity | AuthenticatedUser): UserGql {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: 'status' in user ? user.status : undefined,
      createdAt: 'createdAt' in user ? user.createdAt : undefined,
      updatedAt: 'updatedAt' in user ? user.updatedAt : undefined,
    };
  }

  private mapGatewayService(service: unknown): GatewayServiceGql {
    return {
      id: this.getString(service, 'id'),
      name: this.getString(service, 'name'),
      url: this.getString(service, 'url'),
      host: this.getString(service, 'host'),
      port: this.getNumber(service, 'port'),
      protocol: this.getString(service, 'protocol'),
      path: this.getString(service, 'path'),
      tags: this.getStringArray(service, 'tags'),
    };
  }

  private mapGatewayRoute(route: unknown): GatewayRouteGql {
    return {
      id: this.getString(route, 'id'),
      name: this.getString(route, 'name'),
      paths: this.getStringArray(route, 'paths'),
      hosts: this.getStringArray(route, 'hosts'),
      methods: this.getStringArray(route, 'methods'),
      stripPath:
        this.getBoolean(route, 'stripPath') ?? this.getBoolean(route, 'strip_path'),
      tags: this.getStringArray(route, 'tags'),
    };
  }

  private mapGatewayConsumer(input: {
    consumer: unknown;
    apiKey: string;
  }): GatewayConsumerGql {
    const consumer = input.consumer;
    return {
      id: this.getString(consumer, 'id'),
      username: this.getString(consumer, 'username'),
      customId:
        this.getString(consumer, 'customId') ??
        this.getString(consumer, 'custom_id'),
      tags: this.getStringArray(consumer, 'tags'),
      apiKey: input.apiKey,
    };
  }

  private mapGatewayPlugin(plugin: unknown): GatewayPluginGql {
    return {
      id: this.getString(plugin, 'id'),
      name: this.getString(plugin, 'name'),
      enabled: this.getBoolean(plugin, 'enabled'),
      configJson: this.stringifyJson(this.getValue(plugin, 'config')),
    };
  }

  private mapIncidentSnapshot(snapshot: IncidentSnapshot): IncidentSnapshotGql {
    return {
      incident: this.mapIncident(snapshot.incident),
      logs: snapshot.logs.map((log) => this.mapIncidentLog(log)),
    };
  }

  private mapIncident(incident: IncidentEntity): IncidentGql {
    return {
      id: incident.id,
      serviceId: incident.serviceId,
      providerId: incident.providerId,
      severity: incident.severity,
      reason: incident.reason,
      status: incident.status,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
      resolvedAt: incident.resolvedAt,
    };
  }

  private mapIncidentLog(log: IncidentLogEntity): IncidentLogGql {
    return {
      id: log.id,
      incidentId: log.incidentId,
      adminId: log.adminId,
      adminName: log.adminName,
      action: log.action,
      detailsJson: this.stringifyJson(log.details),
      createdAt: log.createdAt,
    };
  }

  private mapMonitoringRule(rule: MonitoringRuleEntity): MonitoringRuleGql {
    return {
      id: rule.id,
      name: rule.name,
      serviceName: rule.serviceName,
      providerId: rule.providerId,
      type: rule.type,
      errorRateThreshold:
        rule.errorRateThreshold === null
          ? null
          : Number(rule.errorRateThreshold),
      latencyThresholdMs: rule.latencyThresholdMs,
      metricWindow: rule.metricWindow,
      cooldownMinutes: rule.cooldownMinutes,
      isActive: rule.isActive,
      severity: rule.severity as unknown as IncidentSeverity,
      lastTriggeredAt: rule.lastTriggeredAt,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  private mapMonitoringStatus(
    report: MonitoringStatusReport | null,
  ): MonitoringStatusReportGql | null {
    if (!report) return null;
    return {
      checkedAt: report.checkedAt,
      totalRules: report.totalRules,
      activeRules: report.activeRules,
      triggeredRules: report.triggeredRules,
      results: report.results.map((result) => this.mapCheckResult(result)),
    };
  }

  private mapCheckResult(result: CheckResult): MonitoringCheckResultGql {
    return {
      ruleId: result.ruleId,
      ruleName: result.ruleName,
      serviceName: result.serviceName,
      type: result.type,
      triggered: result.triggered,
      currentValue: result.currentValue,
      threshold: result.threshold,
      reason: result.reason,
      checkedAt: result.checkedAt,
    };
  }

  private mapMetricsScope(scope?: MetricsScopeInput): MetricsScope {
    return {
      consumerId: scope?.consumerId,
      serviceId: scope?.serviceId,
    };
  }

  private mapGatewayMetrics(metrics: GatewayMetrics): GatewayMetricsGql {
    return {
      totalRequests: this.finiteNumberOrZero(metrics.totalRequests),
      requestsPerSecond: this.finiteNumberOrZero(metrics.requestsPerSecond),
      statusCodes: Object.entries(metrics.statusCodes).map(([code, count]) => ({
        code,
        count: this.finiteNumberOrZero(count),
      })),
      latency: {
        p50: this.finiteNumberOrNull(metrics.latency.p50),
        p95: this.finiteNumberOrNull(metrics.latency.p95),
        p99: this.finiteNumberOrNull(metrics.latency.p99),
      },
    };
  }

  private mapWebhook(webhook: PublicWebhook): WebhookGql {
    return {
      id: webhook.id,
      name: webhook.name,
      provider: webhook.provider,
      url: webhook.url,
      eventTypes: webhook.eventTypes,
      isActive: webhook.isActive,
      hasSecret: webhook.hasSecret,
      maxRetries: webhook.maxRetries,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt,
    };
  }

  private mapWebhookDelivery(delivery: WebhookDelivery): WebhookDeliveryGql {
    return {
      id: delivery.id,
      webhookId: delivery.webhookId,
      eventType: delivery.eventType,
      source: delivery.source,
      payloadJson: this.stringifyJson(delivery.payload),
      status: delivery.status,
      attemptCount: delivery.attemptCount,
      responseStatus: delivery.responseStatus,
      responseBody: delivery.responseBody,
      error: delivery.error,
      durationMs: delivery.durationMs,
      createdAt: delivery.createdAt,
      deliveredAt: delivery.deliveredAt,
    };
  }

  private mapMessengerEvent(
    event: PublicMessengerInboundEvent,
  ): MessengerInboundEventGql {
    return {
      id: event.id,
      senderId: event.senderId,
      recipientId: event.recipientId,
      messageText: event.messageText,
      postbackPayload: event.postbackPayload ?? undefined,
      timestamp: event.timestamp,
      receivedAt: event.receivedAt,
    };
  }

  private mapMessengerRecipient(
    recipient: MessengerRecipientSummary,
  ): MessengerRecipientGql {
    return {
      senderId: recipient.senderId,
      lastMessageText: recipient.lastMessageText,
      lastSeenAt: recipient.lastSeenAt,
    };
  }

  private parseJson(value: string): Record<string, unknown> {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected a JSON object');
    }
    return parsed as Record<string, unknown>;
  }

  private stringifyJson(value: unknown): string {
    return JSON.stringify(value ?? {});
  }

  private asRecord(value: unknown): UnknownRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as UnknownRecord;
  }

  private getValue(value: unknown, key: string): unknown {
    return this.asRecord(value)?.[key];
  }

  private getString(value: unknown, key: string): string | undefined {
    const field = this.getValue(value, key);
    return typeof field === 'string' ? field : undefined;
  }

  private getNumber(value: unknown, key: string): number | undefined {
    const field = this.getValue(value, key);
    return typeof field === 'number' ? field : undefined;
  }

  private getBoolean(value: unknown, key: string): boolean | undefined {
    const field = this.getValue(value, key);
    return typeof field === 'boolean' ? field : undefined;
  }

  private getStringArray(value: unknown, key: string): string[] | undefined {
    const field = this.getValue(value, key);
    return Array.isArray(field)
      ? field.filter((item): item is string => typeof item === 'string')
      : undefined;
  }

  private finiteNumberOrNull(value: number | null | undefined): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private finiteNumberOrZero(value: number | null | undefined): number {
    return this.finiteNumberOrNull(value) ?? 0;
  }
}
