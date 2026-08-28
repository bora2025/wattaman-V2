import { Injectable } from '@nestjs/common';
import { MessagesGateway } from '../parent/messages.gateway';

/**
 * Wraps MessagesGateway for the realtime.notify plugin capability. Always
 * prefixes the emitted socket event with `plugin:<pluginId>:` so a plugin
 * can never spoof a core event name (message:new, announcement:new, ...) or
 * target another plugin's event namespace.
 */
@Injectable()
export class PluginRealtimeService {
  constructor(private readonly gateway: MessagesGateway) {}

  notifyUser(pluginId: string, userId: string, event: string, payload: unknown) {
    this.gateway.server.to(`user-${userId}`).emit(`plugin:${pluginId}:${event}`, payload);
  }
}
