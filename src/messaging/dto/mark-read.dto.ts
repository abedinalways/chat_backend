import { IsString, IsNotEmpty } from 'class-validator';

export class MarkMessageReadDto {
  @IsString()
  @IsNotEmpty()
  messageId!: string;
}
