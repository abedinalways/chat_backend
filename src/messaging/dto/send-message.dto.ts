import {
  IsString,
  IsNotEmpty,
  Length,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MessageType } from '../interfaces/message.interface';

export class SendMessageDto {
  @ApiProperty({
    example: 'Hello, how are you?',
    description: 'Message content (1-5000 characters)',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 5000)
  content!: string;

  @ApiProperty({
    example: 'cm0abcdef1234567890',
    description: 'Conversation ID to send the message to',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  conversationId!: string;

  @ApiProperty({
    example: 'cm0otheruser123456',
    description: 'Optional specific receiver ID (for direct messages)',
    required: false,
  })
  @IsOptional()
  @IsString()
  receiverId?: string;

  @ApiProperty({
    enum: MessageType,
    example: MessageType.TEXT,
    description: 'Message type',
    required: false,
    default: MessageType.TEXT,
  })
  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType;
}