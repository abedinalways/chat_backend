export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  FILE = 'FILE',
  SYSTEM = 'SYSTEM',
}

export enum MessageStatus {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
}

export enum NotificationType {
  MESSAGE = 'MESSAGE',
  FRIEND_REQUEST = 'FRIEND_REQUEST',
  SYSTEM = 'SYSTEM',
  MENTION = 'MENTION',
}

export interface IMessage {
  id: string;
  content: string;
  senderId: string;
  receiverId: string | null;
  conversationId: string;
  type: MessageType;
  status: MessageStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IConversation {
  id: string;
  participants: string[];
  lastMessage?: IMessage;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  data?: Record<string, any>;
  createdAt: Date;
}
