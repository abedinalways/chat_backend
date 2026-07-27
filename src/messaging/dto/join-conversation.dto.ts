import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class JoinConversationDto {
  @ApiProperty({
    example: 'cm0abcdef1234567890',
    description: 'Conversation ID to join',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  conversationId!: string;
}