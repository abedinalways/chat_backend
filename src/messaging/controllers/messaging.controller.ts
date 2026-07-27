import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  Delete,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { MessageService } from '../services/message.service';
import { NotificationService } from '../services/notification.service';
import { MessagingGateway } from '../gateways/messaging.gateway';
import { MessageType, NotificationType } from '../interfaces/message.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../auth/decorators/user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { SendMessageDto } from '../dto/send-message.dto';
import { CreateConversationDto } from '../dto/create-conversation.dto';
import { WS_EMIT } from '../constants/socket.constants';

@ApiTags('Chat & Messaging')
@ApiBearerAuth('JWT-auth')
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(
    private readonly messageService: MessageService,
    private readonly notificationService: NotificationService,
    private readonly messagingGateway: MessagingGateway,
  ) {}

  @Get('conversations')
  @ApiOperation({
    summary: 'Get user conversations',
    description: 'Returns all conversations for the authenticated user',
  })
  async getUserConversations(@User() user: JwtPayload) {
    const conversations = await this.messageService.getUserConversations(
      user.sub,
    );
    return { success: true, data: conversations };
  }

  @Get('conversations/:id')
  @ApiOperation({
    summary: 'Get conversation by ID',
    description: 'Returns a specific conversation if the user is a participant',
  })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  async getConversation(
    @User() user: JwtPayload,
    @Param('id') conversationId: string,
  ) {
    const isParticipant = await this.messageService.isUserInConversation(
      user.sub,
      conversationId,
    );
    if (!isParticipant) {
      throw new ForbiddenException('Not a participant of this conversation');
    }

    const conversation =
      await this.messageService.getConversationById(conversationId);
    return { success: true, data: conversation };
  }

  @Post('conversations')
  @ApiOperation({
    summary: 'Create a conversation',
    description: 'Creates a new conversation with the specified participants',
  })
  async createConversation(
    @User() user: JwtPayload,
    @Body() body: CreateConversationDto,
  ) {
    const uniqueParticipantIds = [
      ...new Set([user.sub, ...body.participantIds]),
    ];

    const conversation =
      await this.messageService.createConversation(uniqueParticipantIds);
    return { success: true, data: conversation };
  }

  @Get('messages')
  @ApiOperation({
    summary: 'Get conversation messages',
    description: 'Returns paginated messages for a conversation',
  })
  @ApiQuery({
    name: 'conversationId',
    required: true,
    description: 'Conversation ID',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of messages to return (default: 50)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Number of messages to skip (default: 0)',
  })
  async getMessages(
    @User() user: JwtPayload,
    @Query('conversationId') conversationId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!conversationId) {
      throw new BadRequestException('Conversation ID is required');
    }

    const isParticipant = await this.messageService.isUserInConversation(
      user.sub,
      conversationId,
    );
    if (!isParticipant) {
      throw new ForbiddenException('Not a participant of this conversation');
    }

    const messages = await this.messageService.getConversationMessages(
      conversationId,
      parseInt(limit || '50') || 50,
      parseInt(offset || '0') || 0,
    );

    return { success: true, data: messages };
  }

  @Post('messages')
  @ApiOperation({
    summary: 'Send a message',
    description: 'Sends a message to a conversation',
  })
  async sendMessage(@User() user: JwtPayload, @Body() dto: SendMessageDto) {
    const isParticipant = await this.messageService.isUserInConversation(
      user.sub,
      dto.conversationId,
    );
    if (!isParticipant) {
      throw new ForbiddenException('Not a participant of this conversation');
    }

    const message = await this.messageService.sendMessage(
      user.sub,
      dto.conversationId,
      dto.content,
      dto.type || MessageType.TEXT,
      dto.receiverId,
    );

    this.messagingGateway.broadcastToConversation(
      dto.conversationId,
      WS_EMIT.NEW_MESSAGE,
      message,
    );

    const participantIds =
      await this.messageService.getConversationParticipantIds(
        dto.conversationId,
      );

    for (const participantId of participantIds) {
      if (participantId !== user.sub) {
        await this.notificationService.createNotification(
          participantId,
          'New Message',
          dto.content,
          NotificationType.MESSAGE,
          { conversationId: dto.conversationId, messageId: message.id },
        );

        this.messagingGateway.sendNotificationToUser(participantId, {
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

    return { success: true, data: message };
  }

  @Get('messages/:id')
  @ApiOperation({
    summary: 'Get message by ID',
    description: 'Returns a specific message',
  })
  @ApiParam({ name: 'id', description: 'Message ID' })
  async getMessage(@User() user: JwtPayload, @Param('id') messageId: string) {
    const message = await this.messageService.getMessageById(messageId);

    const isParticipant = await this.messageService.isUserInConversation(
      user.sub,
      message.conversationId,
    );
    if (!isParticipant) {
      throw new ForbiddenException('Not a participant of this conversation');
    }

    return { success: true, data: message };
  }

  @Post('messages/:messageId/read')
  @ApiOperation({
    summary: 'Mark message as read',
    description: 'Marks a message as read and broadcasts the read receipt',
  })
  @ApiParam({ name: 'messageId', description: 'Message ID to mark as read' })
  async markAsRead(
    @User() user: JwtPayload,
    @Param('messageId') messageId: string,
  ) {
    const message = await this.messageService.getMessageById(messageId);

    const isParticipant = await this.messageService.isUserInConversation(
      user.sub,
      message.conversationId,
    );
    if (!isParticipant) {
      throw new ForbiddenException('Not a participant of this conversation');
    }

    await this.messagingGateway.markAsReadFromRest({
      userId: user.sub,
      messageId: messageId,
      conversationId: message.conversationId,
    });

    return { success: true, data: message };
  }

  @Get('notifications')
  @ApiOperation({
    summary: 'Get user notifications',
    description: 'Returns paginated notifications for the authenticated user',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of notifications to return (default: 50)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Number of notifications to skip (default: 0)',
  })
  async getNotifications(
    @User() user: JwtPayload,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const notifications = await this.notificationService.getUserNotifications(
      user.sub,
      parseInt(limit || '50') || 50,
      parseInt(offset || '0') || 0,
    );
    return { success: true, data: notifications };
  }

  @Get('notifications/unread-count')
  @ApiOperation({
    summary: 'Get unread notification count',
    description: 'Returns the count of unread notifications',
  })
  async getUnreadCount(@User() user: JwtPayload) {
    const count = await this.notificationService.getUnreadCount(user.sub);
    return { success: true, data: { count } };
  }

  @Post('notifications/:id/read')
  @ApiOperation({
    summary: 'Mark notification as read',
    description: 'Marks a specific notification as read',
  })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  async markNotificationAsRead(
    @User() user: JwtPayload,
    @Param('id') notificationId: string,
  ) {
    const notification = await this.notificationService.markAsRead(
      notificationId,
      user.sub,
    );
    return { success: true, data: notification };
  }

  @Post('notifications/read-all')
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description: 'Marks all unread notifications as read for the authenticated user',
  })
  async markAllNotificationsAsRead(@User() user: JwtPayload) {
    await this.notificationService.markAllAsRead(user.sub);
    return { success: true, message: 'All notifications marked as read' };
  }

  @Delete('messages/:id')
  @ApiOperation({
    summary: 'Delete a message',
    description: 'Deletes a message (only the sender can delete their own messages)',
  })
  @ApiParam({ name: 'id', description: 'Message ID' })
  async deleteMessage(
    @User() user: JwtPayload,
    @Param('id') messageId: string,
  ) {
    await this.messageService.deleteMessage(messageId, user.sub);
    return { success: true, message: 'Message deleted' };
  }

  @Delete('notifications/:id')
  @ApiOperation({
    summary: 'Delete a notification',
    description: 'Deletes a specific notification',
  })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  async deleteNotification(
    @User() user: JwtPayload,
    @Param('id') notificationId: string,
  ) {
    await this.notificationService.deleteNotification(notificationId, user.sub);
    return { success: true, message: 'Notification deleted' };
  }
}