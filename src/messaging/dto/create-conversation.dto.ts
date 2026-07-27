import { IsString, ArrayNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateConversationDto {
  @ApiProperty({
    example: ['cm0user1abc123', 'cm0user2def456'],
    description: 'Array of user IDs to add to the conversation',
    required: true,
    isArray: true,
  })
  @IsString({ each: true })
  @ArrayNotEmpty()
  participantIds!: string[];
}