import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  INotification,
  NotificationType,
} from '../interfaces/message.interface';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async createNotification(
    userId: string,
    title: string,
    message: string,
    type: NotificationType,
    data?: Record<string, any>,
  ): Promise<INotification> {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        data,
      },
    });

    return notification as INotification;
  }

  async getUserNotifications(
    userId: string,
    limit = 50,
    offset = 0,
  ): Promise<INotification[]> {
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return notifications as INotification[];
  }

  async markAsRead(
    notificationId: string,
    userId: string,
  ): Promise<INotification> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });

    return updated as INotification;
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async deleteNotification(
    notificationId: string,
    userId: string,
  ): Promise<void> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });
  }
}
