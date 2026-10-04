import type { Conversation, Message } from '../conversation/conversation.types.js';

/** What the voice route streams to the browser, one JSON object per server sent event. */
export type VoiceEvent =
  /** The stored user message, and the rate of the PCM audio that follows. */
  | { type: 'start'; userMessage: Message; sampleRate: number }
  /** The text of the audio that follows, so the transcript can appear as it is spoken. */
  | { type: 'speech'; text: string }
  /** Base64 16 bit mono PCM. Chunks play back to back in arrival order. */
  | { type: 'audio'; data: string }
  /** The reply as stored. Replaces the live transcript. Audio may still be playing. */
  | { type: 'reply'; replies: Message[]; conversation: Conversation }
  | { type: 'error'; message: string }
  | { type: 'done' };
