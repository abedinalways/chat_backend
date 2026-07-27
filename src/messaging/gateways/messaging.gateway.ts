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
import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { MessageService } from '../services/message.service';
import { NotificationService } from '../services/notification.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MessageType,
  MessageStatus,
  NotificationType,
} from '../interfaces/message.interface';
import { WS_EVENTS, WS_EMIT } from '../constants/socket.constants';
import { SendMessageDto } from '../dto/send-message.dto';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  namespace: '/chat',
  transports: ['websocket', 'polling'],
})
@Injectable()
export class MessagingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(MessagingGateway.name);

  @WebSocketServer()
  server!: Server;

  // Tracks userId → Set<socketId> to support multiple tabs/devices
  private connectedUsers = new Map<string, Set<string>>();

  constructor(
    private readonly messageService: MessageService,
    private readonly notificationService: NotificationService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit() {
    this.logger.log('Messaging Gateway initialized on /chat namespace');
  }

  async handleConnection(client: Socket) {
    try {
      const token: string | undefined =
        client.handshake.auth.token || client.handshake.headers.authorization;

      if (!token) {
        this.logger.warn(
          `Connection rejected — no token provided (${client.id})`,
        );
        client.disconnect();
        return;
      }

      const payload = (await this.jwtService.verifyAsync(
        token.replace('Bearer ', ''),
      )) as JwtPayload;

      const userId = payload.sub;

      // Track multiple sockets per user (multiple tabs/devices)
      if (!this.connectedUsers.has(userId)) {
        this.connectedUsers.set(userId, new Set());
      }
      this.connectedUsers.get(userId)!.add(client.id);

      (client.data as Record<string, unknown>).userId = userId;
      void client.join(`user:${userId}`);

      client.emit(WS_EMIT.USER_CONNECTED, { userId, socketId: client.id });
      this.logger.log(`User connected: ${userId} (socket: ${client.id})`);

      // Emit user online status to all their conversations
      await this.broadcastUserOnlineStatus(userId, true);
    } catch (error) {
      this.logger.error('WebSocket connection error:', error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = (client.data as Record<string, string> | undefined)?.userId;
    if (!userId) {
      this.logger.warn(`Disconnected socket with no userId: ${client.id}`);
      return;
    }
    if (this.connectedUsers.has(userId)) {
      const sockets = this.connectedUsers.get(userId)!;
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.connectedUsers.delete(userId);
        // Emit user offline status when all sockets disconnect
        await this.broadcastUserOnlineStatus(userId, false);
      }
      this.logger.log(`User disconnected: ${userId} (socket: ${client.id})`);
    }
  }

  /** Broadcast user online/offline status to all their conversation participants */
  private async broadcastUserOnlineStatus(userId: string, isOnline: boolean) {
    const userConversations =
      await this.prisma.conversationParticipant.findMany({
        where: { userId },
        select: { conversationId: true },
      });

    const statusPayload = { userId, isOnline };

    for (const { conversationId } of userConversations) {
      this.server
        .to(`conversation:${conversationId}`)
        .emit(WS_EMIT.USER_STATUS, statusPayload);
    }

    this.server.to(`user:${userId}`).emit(WS_EMIT.USER_STATUS, statusPayload);
  }

  /** Send an event to a specific user (all their connected sockets). */
  sendMessageToUser(userId: string, event: string, message: unknown) {
    this.server.to(`user:${userId}`).emit(event, message);
  }

  /** Send a notification event to a specific user. */
  sendNotificationToUser(userId: string, notification: unknown) {
    this.server.to(`user:${userId}`).emit(WS_EMIT.NOTIFICATION, notification);
  }

  /** Broadcast an event to all sockets in a conversation room. */
  broadcastToConversation(
    conversationId: string,
    event: string,
    message: unknown,
  ) {
    this.server.to(`conversation:${conversationId}`).emit(event, message);
  }

  /** Validate DTO using class-validator */
  private async validateDto<T extends object>(
    dto: T,
    classType: new () => T,
  ): Promise<void> {
    const errors = await validate(plainToInstance(classType, dto));
    if (errors.length > 0) {
      const messages = errors
        .map((e) => Object.values(e.constraints || {}).join(', '))
        .join('; ');
      throw new BadRequestException(messages);
    }
  }

  @SubscribeMessage(WS_EVENTS.SEND_MESSAGE)
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() rawDto: Record<string, unknown>,
  ) {
    const senderId = (client.data as Record<string, string>).userId;
    if (!senderId) {
      return { event: WS_EMIT.ERROR, data: { message: 'Unauthorized' } };
    }

    // Validate input
    const dto = plainToInstance(SendMessageDto, rawDto);
    await this.validateDto(dto, SendMessageDto);

    try {
      // Verify user is participant of the conversation
      const isParticipant = await this.messageService.isUserInConversation(
        senderId,
        dto.conversationId,
      );

      if (!isParticipant) {
        throw new ForbiddenException('Not a participant of this conversation');
      }

      const message = await this.messageService.sendMessage(
        senderId,
        dto.conversationId,
        dto.content,
        dto.type || MessageType.TEXT,
        dto.receiverId,
      );

      // Get all participants to emit message and notification
      const participants =
        await this.messageService.getConversationParticipantIds(
          dto.conversationId,
        );

      this.broadcastToConversation(
        dto.conversationId,
        WS_EMIT.NEW_MESSAGE,
        message,
      );

      // Notify other participants (not sender)
      for (const participantId of participants) {
        if (participantId !== senderId) {
          await this.notificationService.createNotification(
            participantId,
            'New Message',
            dto.content,
            NotificationType.MESSAGE,
            { conversationId: dto.conversationId, messageId: message.id },
          );

          this.sendNotificationToUser(participantId, {
            type: NotificationType.MESSAGE,
            data: {
              title: 'New Message',
              message: dto.content,
              conversationId: dto.conversationId,
              messageId: message.id,
            },
          });
        }
      }

      return { event: 'message_sent', data: message };
    } catch (error) {
      const err = error as Error;
      return { event: WS_EMIT.ERROR, data: { message: err.message } };
    }
  }

  @SubscribeMessage(WS_EVENTS.TYPING)
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() rawDto: { conversationId: string; isTyping: boolean },
  ) {
    const userId = (client.data as Record<string, string>).userId;
    if (!userId) {
      return { event: WS_EMIT.ERROR, data: { message: 'Unauthorized' } };
    }

    // Validate user has access to this conversation
    const isParticipant = await this.messageService.isUserInConversation(
      userId,
      rawDto.conversationId,
    );
    if (!isParticipant) {
      return { event: WS_EMIT.ERROR, data: { message: 'Forbidden' } };
    }

    // Broadcast to everyone in the conversation EXCEPT the sender
    client
      .to(`conversation:${rawDto.conversationId}`)
      .emit(WS_EMIT.TYPING_UPDATE, {
        userId,
        conversationId: rawDto.conversationId,
        isTyping: rawDto.isTyping,
      });

    return {
      event: 'typing_sent',
      data: {
        conversationId: rawDto.conversationId,
        isTyping: rawDto.isTyping,
      },
    };
  }

  @SubscribeMessage(WS_EVENTS.MARK_AS_READ)
  async handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() rawDto: { messageId: string; conversationId: string },
  ) {
    const userId = (client.data as Record<string, string>).userId;
    if (!userId) {
      return { event: WS_EMIT.ERROR, data: { message: 'Unauthorized' } };
    }

    // Validate user has access to this conversation
    const isParticipant = await this.messageService.isUserInConversation(
      userId,
      rawDto.conversationId,
    );
    if (!isParticipant) {
      return { event: WS_EMIT.ERROR, data: { message: 'Forbidden' } };
    }

    try {
      await this.messageService.updateMessageStatus(
        rawDto.messageId,
        MessageStatus.READ,
      );

      // Emit to everyone in the conversation EXCEPT the sender
      if (rawDto.conversationId) {
        client
          .to(`conversation:${rawDto.conversationId}`)
          .emit(WS_EMIT.MESSAGE_READ, {
            messageId: rawDto.messageId,
            userId,
            conversationId: rawDto.conversationId,
          });
      }

      return {
        event: 'mark_as_read_sent',
        data: { messageId: rawDto.messageId },
      };
    } catch (error) {
      const err = error as Error;
      return { event: WS_EMIT.ERROR, data: { message: err.message } };
    }
  }

  @SubscribeMessage(WS_EVENTS.JOIN_CONVERSATION)
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() rawDto: { conversationId: string },
  ) {
    const userId = (client.data as Record<string, string>).userId;
    if (!userId) {
      return { event: WS_EMIT.ERROR, data: { message: 'Unauthorized' } };
    }

    // Validate user has access to this conversation
    const isParticipant = await this.messageService.isUserInConversation(
      userId,
      rawDto.conversationId,
    );

    if (!isParticipant) {
      return { event: WS_EMIT.ERROR, data: { message: 'Forbidden' } };
    }

    void client.join(`conversation:${rawDto.conversationId}`);
    return {
      event: 'joined_conversation',
      data: { conversationId: rawDto.conversationId },
    };
  }

  @SubscribeMessage(WS_EVENTS.LEAVE_CONVERSATION)
  async handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: { conversationId: string },
  ) {
    const userId = (client.data as Record<string, string>).userId;
    if (!userId) {
      return { event: WS_EMIT.ERROR, data: { message: 'Unauthorized' } };
    }

    const isParticipant = await this.messageService.isUserInConversation(
      userId,
      dto.conversationId,
    );
    if (!isParticipant) {
      return { event: WS_EMIT.ERROR, data: { message: 'Forbidden' } };
    }

    void client.leave(`conversation:${dto.conversationId}`);
    return {
      event: 'left_conversation',
      data: { conversationId: dto.conversationId },
    };
  }

  /**
   * Mark a message as read via REST controller.
   * Broadcasts the read receipt to the conversation room only.
   */
  async markAsReadFromRest(data: {
    userId: string;
    messageId: string;
    conversationId?: string;
  }) {
    try {
      await this.messageService.updateMessageStatus(
        data.messageId,
        MessageStatus.READ,
      );

      if (data.conversationId) {
        this.broadcastToConversation(
          data.conversationId,
          WS_EMIT.MESSAGE_READ,
          {
            messageId: data.messageId,
            userId: data.userId,
            conversationId: data.conversationId,
          },
        );
      }
    } catch (error) {
      this.logger.error('Error marking message as read:', error);
    }
  }
}
