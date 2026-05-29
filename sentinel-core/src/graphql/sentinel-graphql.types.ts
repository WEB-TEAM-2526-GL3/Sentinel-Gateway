import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  InputType,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { UserRole } from '../users/enum/user-role.enum';
import { UserStatus } from '../users/enum/user-status.enum';
import { IncidentLogAction } from '../incidents/enum/incident-log-action.enum';
import { IncidentSeverity } from '../incidents/enum/incident-severity.enum';
import { IncidentStatus } from '../incidents/enum/incident-status.enum';
import { MonitoringRuleType } from '../monitoring/entities/monitoring-rule.entity';
import { WebhookDeliveryStatus } from '../webhooks/types/webhook-delivery-status.enum';
import { WebhookEventType } from '../webhooks/types/webhook-event-type.enum';
import { WebhookProvider } from '../webhooks/types/webhook-provider.enum';

registerEnumType(UserRole, { name: 'UserRole' });
registerEnumType(UserStatus, { name: 'UserStatus' });
registerEnumType(IncidentLogAction, { name: 'IncidentLogAction' });
registerEnumType(IncidentSeverity, { name: 'IncidentSeverity' });
registerEnumType(IncidentStatus, { name: 'IncidentStatus' });
registerEnumType(MonitoringRuleType, { name: 'MonitoringRuleType' });
registerEnumType(WebhookDeliveryStatus, { name: 'WebhookDeliveryStatus' });
registerEnumType(WebhookEventType, { name: 'WebhookEventType' });
registerEnumType(WebhookProvider, { name: 'WebhookProvider' });

@ObjectType('User')
export class UserGql {
  @Field(() => ID)
  id!: string;

  @Field()
  email!: string;

  @Field()
  fullName!: string;

  @Field(() => UserRole)
  role!: UserRole;

  @Field(() => UserStatus, { nullable: true })
  status?: UserStatus;

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date;
}

@ObjectType('AuthPayload')
export class AuthPayloadGql {
  @Field()
  accessToken!: string;

  @Field()
  tokenType!: string;

  @Field()
  expiresIn!: string;

  @Field(() => UserGql)
  user!: UserGql;
}

@InputType()
export class RegisterInput {
  @Field()
  @IsEmail()
  email!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @Field()
  @IsString()
  @MinLength(6)
  password!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  ceoSecret!: string;
}

@InputType()
export class LoginInput {
  @Field()
  @IsEmail()
  email!: string;

  @Field()
  @IsString()
  @MinLength(6)
  password!: string;
}

@ObjectType('GatewayService')
export class GatewayServiceGql {
  @Field(() => ID, { nullable: true })
  id?: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  url?: string;

  @Field({ nullable: true })
  host?: string;

  @Field(() => Int, { nullable: true })
  port?: number;

  @Field({ nullable: true })
  protocol?: string;

  @Field({ nullable: true })
  path?: string;

  @Field(() => [String], { nullable: true })
  tags?: string[];
}

@ObjectType('GatewayRoute')
export class GatewayRouteGql {
  @Field(() => ID, { nullable: true })
  id?: string;

  @Field({ nullable: true })
  name?: string;

  @Field(() => [String], { nullable: true })
  paths?: string[];

  @Field(() => [String], { nullable: true })
  hosts?: string[];

  @Field(() => [String], { nullable: true })
  methods?: string[];

  @Field({ nullable: true })
  stripPath?: boolean;

  @Field(() => [String], { nullable: true })
  tags?: string[];
}

@ObjectType('GatewayConsumer')
export class GatewayConsumerGql {
  @Field(() => ID, { nullable: true })
  id?: string;

  @Field({ nullable: true })
  username?: string;

  @Field({ nullable: true })
  customId?: string;

  @Field(() => [String], { nullable: true })
  tags?: string[];

  @Field({ nullable: true })
  apiKey?: string;
}

@ObjectType('GatewayPlugin')
export class GatewayPluginGql {
  @Field(() => ID, { nullable: true })
  id?: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  enabled?: boolean;

  @Field({ nullable: true })
  configJson?: string;
}

@InputType()
export class GatewayRouteInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  @Field(() => [String])
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  paths!: string[];

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  stripPath?: boolean;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  methods?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hosts?: string[];
}

@InputType()
export class GatewayRouteUpdateInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  paths?: string[];

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  stripPath?: boolean;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  methods?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hosts?: string[];
}

@InputType()
export class GatewayServiceInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  url!: string;

  @Field(() => GatewayRouteInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => GatewayRouteInput)
  route?: GatewayRouteInput;
}

@InputType()
export class GatewayServiceUpdateInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  url?: string;
}

@InputType()
export class GatewayConsumerInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  username!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  customId?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

@InputType()
export class GatewayConsumerUpdateInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  username?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  customId?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

@InputType()
export class AddServiceHeaderInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  headerName!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  headerValue!: string;
}

@ObjectType('Incident')
export class IncidentGql {
  @Field(() => ID)
  id!: string;

  @Field()
  serviceId!: string;

  @Field()
  providerId!: string;

  @Field(() => IncidentSeverity)
  severity!: IncidentSeverity;

  @Field()
  reason!: string;

  @Field(() => IncidentStatus)
  status!: IncidentStatus;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  resolvedAt?: Date | null;
}

@ObjectType('IncidentLog')
export class IncidentLogGql {
  @Field(() => Int)
  id!: number;

  @Field()
  incidentId!: string;

  @Field()
  adminId!: string;

  @Field()
  adminName!: string;

  @Field(() => IncidentLogAction)
  action!: IncidentLogAction;

  @Field()
  detailsJson!: string;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;
}

@ObjectType('IncidentSnapshot')
export class IncidentSnapshotGql {
  @Field(() => IncidentGql)
  incident!: IncidentGql;

  @Field(() => [IncidentLogGql])
  logs!: IncidentLogGql[];
}

@InputType()
export class CreateIncidentInput {
  @Field()
  @IsUUID()
  serviceId!: string;

  @Field()
  @IsUUID()
  providerId!: string;

  @Field(() => IncidentSeverity)
  @IsEnum(IncidentSeverity)
  severity!: IncidentSeverity;

  @Field()
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  adminId!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  adminName!: string;
}

@InputType()
export class IncidentActionInput {
  @Field()
  @IsUUID()
  incidentId!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  adminId!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  adminName!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}

@InputType()
export class SendIncidentMessageInput {
  @Field()
  @IsUUID()
  incidentId!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  adminId!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  adminName!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  message!: string;
}

@ObjectType('MonitoringRule')
export class MonitoringRuleGql {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  serviceName!: string;

  @Field(() => String, { nullable: true })
  providerId?: string | null;

  @Field(() => MonitoringRuleType)
  type!: MonitoringRuleType;

  @Field(() => Float, { nullable: true })
  errorRateThreshold?: number | null;

  @Field(() => Int, { nullable: true })
  latencyThresholdMs?: number | null;

  @Field()
  metricWindow!: string;

  @Field(() => Int)
  cooldownMinutes!: number;

  @Field()
  isActive!: boolean;

  @Field(() => IncidentSeverity)
  severity!: IncidentSeverity;

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastTriggeredAt?: Date | null;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}

@ObjectType('MonitoringCheckResult')
export class MonitoringCheckResultGql {
  @Field()
  ruleId!: string;

  @Field()
  ruleName!: string;

  @Field()
  serviceName!: string;

  @Field(() => MonitoringRuleType)
  type!: MonitoringRuleType;

  @Field()
  triggered!: boolean;

  @Field(() => Float)
  currentValue!: number;

  @Field(() => Float)
  threshold!: number;

  @Field({ nullable: true })
  reason?: string;

  @Field(() => GraphQLISODateTime)
  checkedAt!: Date;
}

@ObjectType('MonitoringStatusReport')
export class MonitoringStatusReportGql {
  @Field(() => GraphQLISODateTime)
  checkedAt!: Date;

  @Field(() => Int)
  totalRules!: number;

  @Field(() => Int)
  activeRules!: number;

  @Field(() => Int)
  triggeredRules!: number;

  @Field(() => [MonitoringCheckResultGql])
  results!: MonitoringCheckResultGql[];
}

@InputType()
export class CreateMonitoringRuleInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  serviceName!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @Field(() => MonitoringRuleType)
  @IsEnum(MonitoringRuleType)
  type!: MonitoringRuleType;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  errorRateThreshold?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  latencyThresholdMs?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  metricWindow?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  cooldownMinutes?: number;

  @Field(() => IncidentSeverity, { nullable: true })
  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;
}

@InputType()
export class UpdateMonitoringRuleInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  serviceName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @Field(() => MonitoringRuleType, { nullable: true })
  @IsOptional()
  @IsEnum(MonitoringRuleType)
  type?: MonitoringRuleType;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  errorRateThreshold?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  latencyThresholdMs?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  metricWindow?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  cooldownMinutes?: number;

  @Field(() => IncidentSeverity, { nullable: true })
  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@InputType()
export class MetricsScopeInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  consumerId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  serviceId?: string;
}

@ObjectType('LatencyMetrics')
export class LatencyMetricsGql {
  @Field(() => Float)
  p50!: number;

  @Field(() => Float)
  p95!: number;

  @Field(() => Float)
  p99!: number;
}

@ObjectType('StatusCodeMetric')
export class StatusCodeMetricGql {
  @Field()
  code!: string;

  @Field(() => Float)
  count!: number;
}

@ObjectType('GatewayMetrics')
export class GatewayMetricsGql {
  @Field(() => Float)
  totalRequests!: number;

  @Field(() => Float)
  requestsPerSecond!: number;

  @Field(() => [StatusCodeMetricGql])
  statusCodes!: StatusCodeMetricGql[];

  @Field(() => LatencyMetricsGql)
  latency!: LatencyMetricsGql;
}

@ObjectType('Webhook')
export class WebhookGql {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field(() => WebhookProvider)
  provider!: WebhookProvider;

  @Field()
  url!: string;

  @Field(() => [WebhookEventType])
  eventTypes!: WebhookEventType[];

  @Field()
  isActive!: boolean;

  @Field()
  hasSecret!: boolean;

  @Field(() => Int)
  maxRetries!: number;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}

@ObjectType('WebhookDelivery')
export class WebhookDeliveryGql {
  @Field(() => ID)
  id!: string;

  @Field()
  webhookId!: string;

  @Field(() => WebhookEventType)
  eventType!: WebhookEventType;

  @Field({ nullable: true })
  source?: string;

  @Field()
  payloadJson!: string;

  @Field(() => WebhookDeliveryStatus)
  status!: WebhookDeliveryStatus;

  @Field(() => Int)
  attemptCount!: number;

  @Field(() => Int, { nullable: true })
  responseStatus?: number;

  @Field({ nullable: true })
  responseBody?: string;

  @Field({ nullable: true })
  error?: string;

  @Field(() => Int, { nullable: true })
  durationMs?: number;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  deliveredAt?: Date;
}

@ObjectType('WebhookEmitDeliverySummary')
export class WebhookEmitDeliverySummaryGql {
  @Field(() => ID)
  id!: string;

  @Field()
  webhookId!: string;

  @Field(() => WebhookDeliveryStatus)
  status!: WebhookDeliveryStatus;

  @Field(() => Int)
  attemptCount!: number;
}

@ObjectType('WebhookEmitResult')
export class WebhookEmitResultGql {
  @Field(() => WebhookEventType)
  eventType!: WebhookEventType;

  @Field(() => Int)
  matchedWebhooks!: number;

  @Field(() => [WebhookEmitDeliverySummaryGql])
  deliveries!: WebhookEmitDeliverySummaryGql[];
}

@InputType()
export class CreateWebhookInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Field(() => WebhookProvider, { nullable: true })
  @IsOptional()
  @IsEnum(WebhookProvider)
  provider?: WebhookProvider;

  @Field()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  url!: string;

  @Field(() => [WebhookEventType])
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(WebhookEventType, { each: true })
  eventTypes!: WebhookEventType[];

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  secret?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  maxRetries?: number;
}

@InputType()
export class UpdateWebhookInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  @Field(() => WebhookProvider, { nullable: true })
  @IsOptional()
  @IsEnum(WebhookProvider)
  provider?: WebhookProvider;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  url?: string;

  @Field(() => [WebhookEventType], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(WebhookEventType, { each: true })
  eventTypes?: WebhookEventType[];

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  secret?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  maxRetries?: number;
}

@InputType()
export class EmitWebhookEventInput {
  @Field(() => WebhookEventType)
  @IsEnum(WebhookEventType)
  eventType!: WebhookEventType;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  source?: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  payloadJson!: string;
}

@ObjectType('MessengerInboundEvent')
export class MessengerInboundEventGql {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  senderId?: string;

  @Field({ nullable: true })
  recipientId?: string;

  @Field({ nullable: true })
  messageText?: string;

  @Field({ nullable: true })
  postbackPayload?: string;

  @Field(() => GraphQLISODateTime, { nullable: true })
  timestamp?: Date;

  @Field(() => GraphQLISODateTime)
  receivedAt!: Date;
}

@ObjectType('MessengerRecipient')
export class MessengerRecipientGql {
  @Field()
  senderId!: string;

  @Field({ nullable: true })
  lastMessageText?: string;

  @Field(() => GraphQLISODateTime)
  lastSeenAt!: Date;
}

@ObjectType('DashboardOverview')
export class DashboardOverviewGql {
  @Field(() => UserGql)
  me!: UserGql;

  @Field(() => [IncidentGql])
  openIncidents!: IncidentGql[];

  @Field(() => MonitoringStatusReportGql, { nullable: true })
  monitoringStatus?: MonitoringStatusReportGql | null;

  @Field(() => [GatewayServiceGql])
  gatewayServices!: GatewayServiceGql[];
}
