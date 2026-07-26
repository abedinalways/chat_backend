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
} from '@nestjs/common';
import { MessageService } from '../services/message.service';
import { NotificationService } from '../services/notification.service';
import { MessagingGateway } from '../gateways/messaging.gateway';
import {
  MessageType,
  MessageStatus,
  NotificationType,
} from '../interfaces/message.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../auth/decorators/user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { SendMessageDto } from '../dto/send-message.dto';
import { CreateConversationDto } from '../dto/create-conversation.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(
    private readonly messageService: MessageService,
    private readonly notificationService: NotificationService,
    private readonly messagingGateway: MessagingGateway,
  ) { }

  @Get('conversations')
  async getUserConversations(@User() user: JwtPayload) {
    const conversations = await this.messageService.getUserConversations(
      user.sub,
    );
    return { success: true, data: conversations };
  }

  @Get('conversations/:id')
  async getConversation(
    @User() user: JwtPayload,
    @Param('id') conversationId: string,
  ) {
    const conversation =
      await this.messageService.getConversationById(conversationId);
    return { success: true, data: conversation };
  }

  @Post('conversations')
  async createConversation(
    @User() user: JwtPayload,
    @Body() body: CreateConversationDto,
  ) {
    if (!body.participantIds.includes(user.sub)) {
      body.participantIds.push(user.sub);
    }

    const conversation = await this.messageService.createConversation(
      body.participantIds,
    );
    return { success: true, data: conversation };
  }

  @Get('messages')
  async getMessages(
    @User() user: JwtPayload,
    @Query('conversationId') conversationId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!conversationId) {
      throw new BadRequestException('Conversation ID is required');
    }

    const messages = await this.messageService.getConversationMessages(
      conversationId,
      parseInt(limit || '50') || 50,
      parseInt(offset || '0') || 0,
    );

    return { success: true, data: messages };
  }

  @Post('messages')
  async sendMessage(@User() user: JwtPayload, @Body() dto: SendMessageDto) {
    const message = await this.messageService.sendMessage(
      user.sub,
      dto.conversationId,
      dto.content,
      dto.type || MessageType.TEXT,
      dto.receiverId,
    );

    this.messagingGateway.broadcastToConversation(
      dto.conversationId,
      'new_message',
      message,
    );

    if (dto.receiverId && dto.receiverId !== user.sub) {
      await this.notificationService.createNotification(
        dto.receiverId,
        'New Message',
        'You have a new message',
        NotificationType.MESSAGE,
        { conversationId: dto.conversationId, messageId: message.id },
      );

      this.messagingGateway.sendNotificationToUser(dto.receiverId, {
        type: 'new_notification',
        data: {
          title: 'New Message',
          message: 'You have a new message',
        },
      });
    }

    return { success: true, data: message };
  }

  @Get('messages/:id')
  async getMessage(@User() user: JwtPayload, @Param('id') messageId: string) {
    const message = await this.messageService.getMessageById(messageId);
    return { success: true, data: message };
  }

  @Post('messages/:messageId/read')
  async markAsRead(
    @User() user: JwtPayload,
    @Param('messageId') messageId: string,
  ) {
    const message = await this.messageService.updateMessageStatus(
      messageId,
      MessageStatus.READ,
    );

    await this.messagingGateway.markAsReadFromRest({
      userId: user.sub,
      messageId: messageId,
      conversationId: message.conversationId,
    });

    return { success: true, data: message };
  }

  @Get('notifications')
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
  async getUnreadCount(@User() user: JwtPayload) {
    const count = await this.notificationService.getUnreadCount(user.sub);
    return { success: true, data: { count } };
  }

  @Post('notifications/:id/read')
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
  async markAllNotificationsAsRead(@User() user: JwtPayload) {
    await this.notificationService.markAllAsRead(user.sub);
    return { success: true, message: 'All notifications marked as read' };
  }

  @Delete('messages/:id')
  async deleteMessage(
    @User() user: JwtPayload,
    @Param('id') messageId: string,
  ) {
    await this.messageService.deleteMessage(messageId, user.sub);
    return { success: true, message: 'Message deleted' };
  }

  @Delete('notifications/:id')
  async deleteNotification(
    @User() user: JwtPayload,
    @Param('id') notificationId: string,
  ) {
    await this.notificationService.deleteNotification(notificationId, user.sub);
    return { success: true, message: 'Notification deleted' };
  }
}
