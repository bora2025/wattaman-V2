import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { OnGatewayConnection } from '@nestjs/websockets';
import { authenticateSocket, requireSocketUser } from '../common/socket-auth';
import { getCorsOriginsForGateway } from '../config/environment';

@WebSocketGateway({
  cors: {
    origin: getCorsOriginsForGateway(),
    credentials: true,
  },
})
export class MessagesGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      await authenticateSocket(this.jwt, client);
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('joinUser')
  handleJoinUser(
    @MessageBody() userId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const user = requireSocketUser(client);
    if (userId !== user.userId) throw new WsException('Cannot join another user room');
    client.join(`user-${user.userId}`);
  }

  @SubscribeMessage('leaveUser')
  handleLeaveUser(
    @MessageBody() userId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const user = requireSocketUser(client);
    if (userId !== user.userId) throw new WsException('Cannot leave another user room');
    client.leave(`user-${user.userId}`);
  }

  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() data: { from: string; to: string; isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.to) return;
    const user = requireSocketUser(client);
    this.server.to(`user-${data.to}`).emit('typing', {
      from: user.userId,
      isTyping: !!data.isTyping,
    });
  }

  notifyNewMessage(receiverId: string, senderId: string, message: any) {
    this.server.to(`user-${receiverId}`).emit('message:new', message);
    this.server.to(`user-${senderId}`).emit('message:sent', message);
  }

  notifyRead(senderId: string, readerId: string) {
    this.server.to(`user-${senderId}`).emit('message:read', { by: readerId });
  }
}
