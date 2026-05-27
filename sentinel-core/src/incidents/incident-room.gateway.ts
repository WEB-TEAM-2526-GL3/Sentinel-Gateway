import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ActivateFallbackDto } from './dto/activate-fallback.dto';
import { IncidentActionDto } from './dto/incident-action.dto';
import { JoinIncidentDto } from './dto/join-incident.dto';
import { LeaveIncidentDto } from './dto/leave-incident.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { IncidentsService } from './incidents.service';

interface PresentAdmin {
  adminId: string;
  adminName: string;
  socketId: string;
}

@WebSocketGateway({
  namespace: '/incident-room',
  cors: { origin: '*' },
})
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class IncidentRoomGateway implements OnGatewayDisconnect {
  private readonly logger = new Logger(IncidentRoomGateway.name);
  private readonly presenceByIncident = new Map<string, Map<string, PresentAdmin>>();

  @WebSocketServer()
  server: Server;

  constructor(private readonly incidentsService: IncidentsService) {}

  handleDisconnect(client: Socket): void {
    for (const incidentId of this.presenceByIncident.keys()) {
      this.removePresence(incidentId, client.id);
      this.emitPresence(incidentId);
    }
  }

  @SubscribeMessage('joinIncident')
  async joinIncident(
    @MessageBody() body: JoinIncidentDto,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    await this.handleSocketAction(client, body.incidentId, async () => {
      const room = this.roomName(body.incidentId);
      await client.join(room);
      this.addPresence(body.incidentId, {
        adminId: body.adminId,
        adminName: body.adminName,
        socketId: client.id,
      });

      const snapshot = await this.incidentsService.getIncidentWithLogs(
        body.incidentId,
      );
      client.emit('incidentJoined', {
        ...snapshot,
        presence: this.getPresence(body.incidentId),
      });
      this.emitPresence(body.incidentId);
    });
  }

  @SubscribeMessage('leaveIncident')
  async leaveIncident(
    @MessageBody() body: LeaveIncidentDto,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    await this.handleSocketAction(client, body.incidentId, async () => {
      await client.leave(this.roomName(body.incidentId));
      this.removePresence(body.incidentId, client.id);
      this.emitPresence(body.incidentId);
    });
  }

  @SubscribeMessage('sendMessage')
  async sendMessage(
    @MessageBody() body: SendMessageDto,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    await this.handleSocketAction(client, body.incidentId, async () => {
      const log = await this.incidentsService.sendMessage(body);
      this.server.to(this.roomName(body.incidentId)).emit('incidentMessage', log);
    });
  }

  @SubscribeMessage('ackIncident')
  async ackIncident(
    @MessageBody() body: IncidentActionDto,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    await this.handleSocketAction(client, body.incidentId, async () => {
      const snapshot = await this.incidentsService.acknowledge(body);
      this.server
        .to(this.roomName(body.incidentId))
        .emit('incidentUpdated', snapshot);
    });
  }

  @SubscribeMessage('resolveIncident')
  async resolveIncident(
    @MessageBody() body: IncidentActionDto,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    await this.handleSocketAction(client, body.incidentId, async () => {
      const snapshot = await this.incidentsService.resolve(body);
      this.server
        .to(this.roomName(body.incidentId))
        .emit('incidentUpdated', snapshot);
    });
  }

  @SubscribeMessage('activateFallback')
  async activateFallback(
    @MessageBody() body: ActivateFallbackDto,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    await this.handleSocketAction(client, body.incidentId, async () => {
      const snapshot = await this.incidentsService.activateFallback(body);
      this.server
        .to(this.roomName(body.incidentId))
        .emit('incidentUpdated', snapshot);
    });
  }

  private async handleSocketAction(
    client: Socket,
    incidentId: string,
    action: () => Promise<void>,
  ): Promise<void> {
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      this.logger.warn(message);
      client.emit('incidentError', { incidentId, message });
    }
  }

  private addPresence(incidentId: string, admin: PresentAdmin): void {
    const presence = this.presenceByIncident.get(incidentId) ?? new Map();
    presence.set(admin.socketId, admin);
    this.presenceByIncident.set(incidentId, presence);
  }

  private removePresence(incidentId: string, socketId: string): void {
    const presence = this.presenceByIncident.get(incidentId);

    if (!presence) {
      return;
    }

    presence.delete(socketId);

    if (presence.size === 0) {
      this.presenceByIncident.delete(incidentId);
    }
  }

  private getPresence(incidentId: string): PresentAdmin[] {
    return [...(this.presenceByIncident.get(incidentId)?.values() ?? [])];
  }

  private emitPresence(incidentId: string): void {
    this.server.to(this.roomName(incidentId)).emit('presenceUpdated', {
      incidentId,
      admins: this.getPresence(incidentId),
    });
  }

  private roomName(incidentId: string): string {
    return `incident:${incidentId}`;
  }
}
