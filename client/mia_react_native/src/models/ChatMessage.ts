import { parseCreatedAt } from '../utils/chatDates';

export type ChatMessage = {
  id: number;
  role: string;
  content: string;
  messageType: string;
  audioUrl?: string | null;
  createdAt: Date;
  audioDurationSec?: number | null;
};

export function chatMessageFromJson(json: Record<string, unknown>): ChatMessage {
  return {
    id: json.id as number,
    role: json.role as string,
    content: json.content as string,
    messageType: (json.messageType as string) ?? 'text',
    audioUrl: json.audioUrl as string | undefined,
    createdAt: parseCreatedAt(json.createdAt as string),
    audioDurationSec: json.audioDurationSec as number | undefined,
  };
}

export function isUserMessage(msg: ChatMessage): boolean {
  return msg.role === 'user';
}

export function isAudioMessage(msg: ChatMessage): boolean {
  return msg.messageType === 'audio';
}
