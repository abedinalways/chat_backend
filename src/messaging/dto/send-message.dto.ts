import {
  IsString,
  IsNotEmpty,
  Length,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { MessageType } from '../interfaces/message.interface';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 5000)
  content: string;

  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsOptional()
  @IsString()
  receiverId?: string;

  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType;
}
