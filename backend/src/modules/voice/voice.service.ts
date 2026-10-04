import { serviceUnavailable } from '../../common/errors/index.js';
import { logger } from '../../common/logger/index.js';
import { getTtsRuntime } from '../llm/llm.state.js';
import { withoutThinking } from '../agent/agent.model.js';
import { completeTurn, startTurn } from '../conversation/conversation.service.js';
import type { TurnStart } from '../conversation/conversation.types.js';
import { SPEECH_SAMPLE_RATE, streamSpeech } from './voice.tts.js';
import type { VoiceEvent } from './voice.types.js';

/**
 * Each speech request takes about a second before its first audio. The first
 * piece is sent at the first comma or sentence end, so the voice starts early.
 * Later pieces are whole sentences, long enough to cover the next request's wait.
 */
const MIN_FIRST_PIECE_CHARS = 12;
const MIN_PIECE_CHARS = 40;

/** A clause or sentence end followed by a space, or a line break. "3.5" does not count. */
const CLAUSE_END = /[.!?,;:](?=\s)|\n/g;
const SENTENCE_END = /[.!?](?=\s)|\n/g;

/** Where the next piece of speech ends, or -1 when there is not enough text for one yet. */
function nextPieceEnd(text: string, from: number, isFirst: boolean): number {
  const rest = text.slice(from);
  if (isFirst) {
    for (const match of rest.matchAll(CLAUSE_END)) {
      if (match.index + match[0].length >= MIN_FIRST_PIECE_CHARS) {
        return from + match.index + match[0].length;
      }
    }
    return -1;
  }
  let end = -1;
  for (const match of rest.matchAll(SENTENCE_END)) {
    end = match.index + match[0].length;
  }
  return end >= MIN_PIECE_CHARS ? from + end : -1;
}

/** The prompt asks for plain speech, but a stray symbol would be read out, so it is removed. */
function forSpeech(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\[\d+\]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Everything that can refuse a turn runs here, before the event stream opens, so a refusal is a plain JSON error. */
export async function startVoiceTurn(userId: string, conversationId: string, content: string): Promise<TurnStart> {
  if (!getTtsRuntime()) {
    throw serviceUnavailable('Voice conversation is not configured');
  }
  return startTurn(userId, conversationId, content);
}

/**
 * Streams the reply as speech, a piece at a time, each piece's text sent just
 * before its audio so the transcript can follow the voice.
 *
 * When the browser goes away, as it does when the user talks over the reply,
 * the speech stops. If nothing was said or done yet, the turn is cancelled and
 * taken back, and the browser sends it again joined to what the user said next.
 * Otherwise it runs to the end and is stored, because stopping it part way could
 * leave a tool action done with no record of it.
 */
export async function streamVoiceReply(
  turn: TurnStart,
  send: (event: VoiceEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  send({ type: 'start', userMessage: turn.userMessage, sampleRate: SPEECH_SAMPLE_RATE });

  // The response is already open by now, so a failure can only be reported inside the stream.
  try {
    await speakReply(turn, send, signal);
  } catch (error) {
    if (signal.aborted) {
      logger.info({ conversationId: turn.conversation.id }, 'Voice turn cancelled before it answered');
      return;
    }
    logger.error({ err: error, conversationId: turn.conversation.id }, 'Voice reply failed');
    send({ type: 'error', message: 'The voice reply failed. Please try again.' });
    return;
  }
  send({ type: 'done' });
}

async function speakReply(
  turn: TurnStart,
  send: (event: VoiceEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let raw = '';
  let spoken = 0;
  let replyComplete = false;
  let spokeAny = false;
  let toolCalled = false;
  let speaking = false;
  let speaker: Promise<void> = Promise.resolve();

  const cancel = new AbortController();
  const cancelIfUnanswered = (): void => {
    if (!spokeAny && !toolCalled) {
      cancel.abort();
    }
  };
  signal.addEventListener('abort', cancelIfUnanswered, { once: true });
  if (signal.aborted) {
    cancelIfUnanswered();
  }

  const say = async (text: string): Promise<void> => {
    const line = forSpeech(text);
    if (!line) {
      return;
    }
    spokeAny = true;
    send({ type: 'speech', text });
    try {
      await streamSpeech(line, (pcm) => send({ type: 'audio', data: pcm.toString('base64') }), signal);
    } catch (error) {
      if (!signal.aborted) {
        logger.warn({ err: error, conversationId: turn.conversation.id }, 'Speech for part of a reply failed');
      }
    }
  };

  /** One speech request at a time keeps the audio in order. */
  const pump = (): void => {
    // A flag, not the promise: with nothing to say the loop ends before its promise is even assigned.
    if (speaking) {
      return;
    }
    speaking = true;
    speaker = (async () => {
      try {
        while (!signal.aborted) {
          const visible = withoutThinking(raw);
          const end = replyComplete ? visible.length : nextPieceEnd(visible, spoken, spoken === 0);
          if (end <= spoken) {
            break;
          }
          const text = visible.slice(spoken, end);
          spoken = end;
          await say(text);
        }
      } finally {
        speaking = false;
      }
    })();
  };

  const result = await completeTurn(turn, {
    mode: 'voice',
    signal: cancel.signal,
    onToolCall: () => {
      toolCalled = true;
    },
    onTextDelta: (delta) => {
      raw += delta;
      pump();
    },
  });

  send({ type: 'reply', replies: result.replies, conversation: result.conversation });

  if (withoutThinking(raw).length === 0) {
    // Nothing streamed, as when the agent failed and a stored fallback reply stands in.
    raw = [...result.replies].reverse().find((message) => message.role === 'assistant')?.content ?? '';
  }
  // A request already running sees this on its next pass and speaks what is left.
  replyComplete = true;
  pump();
  await speaker;
}
