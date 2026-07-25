import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';
import { MessageService } from '../services/message.service';
import { NotificationService } from '../services/notification.service';
import { JwtService } from '@nestjs/jwt';
import {
  MessageType,
  MessageStatus,
  NotificationType,
} from '../interfaces/message.interface';
import { WS_EVENTS, WS_EMIT } from '../constants/socket.constants';
import { SendMessageDto } from '../dto/send-message.dto';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/chat',
  transports: ['websocket', 'polling'],
})
@Injectable()
export class MessagingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private connectedUsers = new Map<string, string>();

  constructor(
    private readonly messageService: MessageService,
    private readonly notificationService: NotificationService,
    private readonly jwtService: JwtService,
  ) {}

  afterInit() {
    console.log('Messaging Gateway initialized on /chat namespace');
  }

  async handleConnection(client: Socket) {
    try {
      const token: string | undefined =
        client.handshake.auth.token || client.handshake.headers.authorization;

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = (await this.jwtService.verifyAsync(
        token.replace('Bearer ', ''),
      )) as JwtPayload;

      const userId = payload.sub;
      this.connectedUsers.set(userId, client.id);
      (client.data as Record<string, unknown>).userId = userId;
      void client.join(`user:${userId}`);

      client.emit(WS_EMIT.USER_CONNECTED, { userId, socketId: client.id });
      console.log(`User connected: ${userId}`);
    } catch (error) {
      console.error('WebSocket connection error:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    for (const [userId, socketId] of this.connectedUsers.entries()) {
      if (socketId === client.id) {
        this.connectedUsers.delete(userId);
        console.log(`User disconnected: ${userId}`);
        break;
      }
    }
  }

  sendMessageToUser(userId: string, event: string, message: unknown) {
    this.server.to(`user:${userId}`).emit(event, message);
  }

  sendNotificationToUser(userId: string, notification: unknown) {
    this.server.to(`user:${userId}`).emit(WS_EMIT.NOTIFICATION, notification);
  }

  broadcastToConversation(
    conversationId: string,
    event: string,
    message: unknown,
  ) {
    this.server.to(`conversation:${conversationId}`).emit(event, message);
  }

  @SubscribeMessage(WS_EVENTS.SEND_MESSAGE)
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const senderId = (client.data as Record<string, string>).userId;
    if (!senderId) {
      return { event: WS_EMIT.ERROR, data: { message: 'Unauthorized' } };
    }

    try {
      const message = await this.messageService.sendMessage(
        senderId,
        dto.conversationId,
        dto.content,
        dto.type || MessageType.TEXT,
        dto.receiverId,
      );

      this.broadcastToConversation(
        dto.conversationId,
        WS_EMIT.NEW_MESSAGE,
        message,
      );

      if (dto.receiverId && dto.receiverId !== senderId) {
        await this.notificationService.createNotification(
          dto.receiverId,
          'New Message',
          'You have a new message',
          NotificationType.MESSAGE,
          { conversationId: dto.conversationId, messageId: message.id },
        );

        this.sendNotificationToUser(dto.receiverId, {
          type: 'new_notification',
          data: {
            title: 'New Message',
            message: 'You have a new message',
          },
        });
      }

      return { event: 'message_sent', data: message };
    } catch (error) {
      const err = error as Error;
      return { event: WS_EMIT.ERROR, data: { message: err.message } };
    }
  }

  @SubscribeMessage(WS_EVENTS.TYPING)
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: { conversationId: string; isTyping: boolean },
  ) {
    const userId = (client.data as Record<string, string>).userId;
    if (!userId) {
      return { event: WS_EMIT.ERROR, data: { message: 'Unauthorized' } };
    }

    this.server
      .to(`conversation:${dto.conversationId}`)
      .emit(WS_EMIT.TYPING_UPDATE, {
        userId,
        conversationId: dto.conversationId,
        isTyping: dto.isTyping,
      });

    return {
      event: 'typing_sent',
      data: { conversationId: dto.conversationId, isTyping: dto.isTyping },
    };
  }

  @SubscribeMessage(WS_EVENTS.MARK_AS_READ)
  async handleWsMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: { messageId: string },
  ) {
    const userId = (client.data as Record<string, string>).userId;
    if (!userId) {
      return { event: WS_EMIT.ERROR, data: { message: 'Unauthorized' } };
    }

    try {
      await this.messageService.updateMessageStatus(
        dto.messageId,
        MessageStatus.READ,
      );

      this.server.emit(WS_EMIT.MESSAGE_READ, {
        messageId: dto.messageId,
        userId,
      });

      return { event: 'mark_as_read_sent', data: { messageId: dto.messageId } };
    } catch (error) {
      const err = error as Error;
      return { event: WS_EMIT.ERROR, data: { message: err.message } };
    }
  }

  @SubscribeMessage(WS_EVENTS.JOIN_CONVERSATION)
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: { conversationId: string },
  ) {
    void client.join(`conversation:${dto.conversationId}`);
    return {
      event: 'joined_conversation',
      data: { conversationId: dto.conversationId },
    };
  }

  @SubscribeMessage(WS_EVENTS.LEAVE_CONVERSATION)
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: { conversationId: string },
  ) {
    void client.leave(`conversation:${dto.conversationId}`);
    return {
      event: 'left_conversation',
      data: { conversationId: dto.conversationId },
    };
  }

  async handleMarkAsRead(data: { userId: string; messageId: string }) {
    try {
      await this.messageService.updateMessageStatus(
        data.messageId,
        MessageStatus.READ,
      );

      this.server.emit(WS_EMIT.MESSAGE_READ, {
        messageId: data.messageId,
        userId: data.userId,
      });
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  }
}
