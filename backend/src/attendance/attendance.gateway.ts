import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { authenticateSocket, requireSocketUser } from '../common/socket-auth';
import { getCorsOriginsForGateway } from '../config/environment';

@WebSocketGateway({
  cors: {
    origin: getCorsOriginsForGateway(),
    credentials: true,
  },
})
export class AttendanceGateway implements OnGatewayConnection {
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

  @SubscribeMessage('joinClass')
  handleJoinClass(
    @MessageBody() classId: string,
    @ConnectedSocket() client: Socket,
  ) {
    requireSocketUser(client);
    client.join(`class-${classId}`);
  }

  @SubscribeMessage('leaveClass')
  handleLeaveClass(
    @MessageBody() classId: string,
    @ConnectedSocket() client: Socket,
  ) {
    requireSocketUser(client);
    client.leave(`class-${classId}`);
  }

  @SubscribeMessage('joinDashboard')
  handleJoinDashboard(@ConnectedSocket() client: Socket) {
    requireSocketUser(client);
    client.join('dashboard');
  }

  @SubscribeMessage('leaveDashboard')
  handleLeaveDashboard(@ConnectedSocket() client: Socket) {
    requireSocketUser(client);
    client.leave('dashboard');
  }

  notifyAttendanceUpdate(classId: string, attendanceData: any) {
    this.server.to(`class-${classId}`).emit('attendanceUpdate', attendanceData);
    // Also broadcast a lightweight dashboard ping so admin dashboards refresh in real-time
    this.server.to('dashboard').emit('dashboardUpdate', {
      classId,
      studentId: attendanceData?.studentId,
      status: attendanceData?.status,
      timestamp: attendanceData?.timestamp ?? new Date(),
    });
  }
}
