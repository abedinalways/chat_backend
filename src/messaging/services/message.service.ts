import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IMessage,
  MessageType,
  MessageStatus,
  IConversation,
} from '../interfaces/message.interface';

@Injectable()
export class MessageService {
  constructor(private readonly prisma: PrismaService) {}

  async sendMessage(
    senderId: string,
    conversationId: string,
    content: string,
    type: MessageType = MessageType.TEXT,
    receiverId?: string,
  ): Promise<IMessage> {
    const cleanReceiverId =
      receiverId && receiverId.length > 0 ? receiverId : undefined;

    const message = await this.prisma.message.create({
      data: {
        content,
        type,
        status: MessageStatus.SENT,
        senderId,
        receiverId: cleanReceiverId,
        conversationId,
      },
      include: {
        sender: true,
        receiver: true,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return {
      id: message.id,
      content: message.content,
      senderId: message.senderId,
      receiverId: message.receiverId,
      conversationId: message.conversationId,
      type: message.type as MessageType,
      status: message.status as MessageStatus,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      sender: message.sender
        ? {
            id: message.sender.id,
            email: message.sender.email,
            name: message.sender.name,
            avatar: message.sender.avatar,
          }
        : undefined,
      receiver: message.receiver
        ? {
            id: message.receiver.id,
            email: message.receiver.email,
            name: message.receiver.name,
            avatar: message.receiver.avatar,
          }
        : null,
    };
  }

  async getConversationMessages(
    conversationId: string,
    limit = 50,
    offset = 0,
  ): Promise<IMessage[]> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      include: {
        sender: true,
        receiver: true,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip: offset,
    });

    return messages.map((message) => ({
      id: message.id,
      content: message.content,
      senderId: message.senderId,
      receiverId: message.receiverId,
      conversationId: message.conversationId,
      type: message.type as MessageType,
      status: message.status as MessageStatus,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      sender: message.sender
        ? {
            id: message.sender.id,
            email: message.sender.email,
            name: message.sender.name,
            avatar: message.sender.avatar,
          }
        : undefined,
      receiver: message.receiver
        ? {
            id: message.receiver.id,
            email: message.receiver.email,
            name: message.receiver.name,
            avatar: message.receiver.avatar,
          }
        : null,
    }));
  }

  async getMessageById(messageId: string): Promise<IMessage> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: true,
        receiver: true,
      },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    return {
      id: message.id,
      content: message.content,
      senderId: message.senderId,
      receiverId: message.receiverId,
      conversationId: message.conversationId,
      type: message.type as MessageType,
      status: message.status as MessageStatus,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      sender: message.sender
        ? {
            id: message.sender.id,
            email: message.sender.email,
            name: message.sender.name,
            avatar: message.sender.avatar,
          }
        : undefined,
      receiver: message.receiver
        ? {
            id: message.receiver.id,
            email: message.receiver.email,
            name: message.receiver.name,
            avatar: message.receiver.avatar,
          }
        : null,
    };
  }

  async updateMessageStatus(
    messageId: string,
    status: MessageStatus,
  ): Promise<IMessage> {
    const existing = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: true,
        receiver: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Message not found');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { status },
      include: {
        sender: true,
        receiver: true,
      },
    });

    return {
      id: updated.id,
      content: updated.content,
      senderId: updated.senderId,
      receiverId: updated.receiverId,
      conversationId: updated.conversationId,
      type: updated.type as MessageType,
      status: updated.status as MessageStatus,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      sender: updated.sender
        ? {
            id: updated.sender.id,
            email: updated.sender.email,
            name: updated.sender.name,
            avatar: updated.sender.avatar,
          }
        : undefined,
      receiver: updated.receiver
        ? {
            id: updated.receiver.id,
            email: updated.receiver.email,
            name: updated.receiver.name,
            avatar: updated.receiver.avatar,
          }
        : null,
    };
  }

  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.senderId !== userId) {
      throw new BadRequestException('You can only delete your own messages');
    }

    await this.prisma.message.delete({
      where: { id: messageId },
    });
  }

  async createConversation(participantIds: string[]): Promise<IConversation> {
    if (participantIds.length < 2) {
      throw new BadRequestException(
        'Conversation must have at least 2 participants',
      );
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        participants: {
          create: participantIds.map((userId) => ({ userId })),
        },
      },
      include: {
        participants: {
          include: {
            user: true,
          },
        },
      },
    });

    return {
      id: conversation.id,
      participants: conversation.participants.map((p) => ({
        id: p.user.id,
        email: p.user.email,
        name: p.user.name,
        avatar: p.user.avatar,
      })),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  async getUserConversations(userId: string): Promise<IConversation[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: {
          some: { userId },
        },
      },
      include: {
        participants: {
          include: {
            user: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return conversations.map((conversation) => ({
      id: conversation.id,
      participants: conversation.participants.map((p) => ({
        id: p.user.id,
        email: p.user.email,
        name: p.user.name,
        avatar: p.user.avatar,
      })),
      lastMessage: conversation.messages[0]
        ? {
            id: conversation.messages[0].id,
            content: conversation.messages[0].content,
            senderId: conversation.messages[0].senderId,
            receiverId: conversation.messages[0].receiverId,
            conversationId: conversation.messages[0].conversationId,
            type: conversation.messages[0].type as MessageType,
            status: conversation.messages[0].status as MessageStatus,
            createdAt: conversation.messages[0].createdAt,
            updatedAt: conversation.messages[0].updatedAt,
            sender: conversation.messages[0].sender
              ? {
                  id: conversation.messages[0].sender.id,
                  email: conversation.messages[0].sender.email,
                  name: conversation.messages[0].sender.name,
                  avatar: conversation.messages[0].sender.avatar,
                }
              : undefined,
          }
        : undefined,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    }));
  }

  async getConversationById(conversationId: string): Promise<IConversation> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return {
      id: conversation.id,
      participants: conversation.participants.map((p) => ({
        id: p.user.id,
        email: p.user.email,
        name: p.user.name,
        avatar: p.user.avatar,
      })),
      lastMessage: conversation.messages[0]
        ? {
            id: conversation.messages[0].id,
            content: conversation.messages[0].content,
            senderId: conversation.messages[0].senderId,
            receiverId: conversation.messages[0].receiverId,
            conversationId: conversation.messages[0].conversationId,
            type: conversation.messages[0].type as MessageType,
            status: conversation.messages[0].status as MessageStatus,
            createdAt: conversation.messages[0].createdAt,
            updatedAt: conversation.messages[0].updatedAt,
            sender: conversation.messages[0].sender
              ? {
                  id: conversation.messages[0].sender.id,
                  email: conversation.messages[0].sender.email,
                  name: conversation.messages[0].sender.name,
                  avatar: conversation.messages[0].sender.avatar,
                }
              : undefined,
          }
        : undefined,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  /** Check if a user is a participant of a conversation */
  async isUserInConversation(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    return !!participant;
  }

  /** Get all participant IDs for a conversation */
  async getConversationParticipantIds(
    conversationId: string,
  ): Promise<string[]> {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });

    return participants.map((p) => p.userId);
  }
}
