import { IsString, ArrayNotEmpty } from 'class-validator';

export class CreateConversationDto {
  @IsString({ each: true })
  @ArrayNotEmpty()
  participantIds: string[];
}
