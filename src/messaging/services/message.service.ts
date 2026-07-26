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
  constructor(private readonly prisma: PrismaService) { }

  async sendMessage(
    senderId: string,
    conversationId: string,
    content: string,
    type: MessageType = MessageType.TEXT,
    receiverId?: string,
  ): Promise<IMessage> {
    const message = await this.prisma.message.create({
      data: {
        content,
        type,
        status: MessageStatus.SENT,
        senderId,
        receiverId,
        conversationId,
      },
      include: {
        sender: true,
        receiver: true,
      },
    });

    // Update conversation's updatedAt timestamp
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return message as unknown as IMessage;
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

    return messages as unknown as IMessage[];
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

    return message as unknown as IMessage;
  }

  async updateMessageStatus(
    messageId: string,
    status: MessageStatus,
  ): Promise<IMessage> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { status },
    });

    return updated as unknown as IMessage;
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
      participants: conversation.participants.map((p) => p.userId),
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
      participants: conversation.participants.map(
        (p: { userId: string }) => p.userId,
      ),
      lastMessage: conversation.messages[0] as unknown as IMessage | undefined,
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
      participants: conversation.participants.map(
        (p: { userId: string }) => p.userId,
      ),
      lastMessage: conversation.messages[0] as unknown as IMessage | undefined,
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

  /** Create message within a transaction */
  async createMessageWithTransaction(
    senderId: string,
    conversationId: string,
    content: string,
    type: MessageType = MessageType.TEXT,
    receiverId?: string,
  ): Promise<IMessage> {
    return await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          content,
          type,
          status: MessageStatus.SENT,
          senderId,
          receiverId,
          conversationId,
        },
        include: {
          sender: true,
          receiver: true,
        },
      });

      // Update conversation's updatedAt timestamp
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      return message as unknown as IMessage;
    });
  }
}
