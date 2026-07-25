import { Module } from '@nestjs/common';
import { MessagingGateway } from './gateways/messaging.gateway';
import { NotificationService } from './services/notification.service';
import { MessageService } from './services/message.service';
import { MessagingController } from './controllers/messaging.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MessagingController],
  providers: [MessagingGateway, NotificationService, MessageService],
  exports: [NotificationService, MessageService],
})
export class MessagingModule {}
