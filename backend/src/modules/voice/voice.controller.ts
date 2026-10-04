import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { getAuthenticatedUser } from '../../common/middleware/requireAuth.js';
import type { VoiceTurnInput } from './voice.schema.js';
import * as voiceService from './voice.service.js';
import type { VoiceEvent } from './voice.types.js';

interface VoiceTurnParams extends ParamsDictionary {
  id: string;
}

/** One voice turn, answered as a server sent event stream of VoiceEvent objects. */
export const turn: RequestHandler<VoiceTurnParams, unknown, VoiceTurnInput> = async (req, res) => {
  const { id: userId } = getAuthenticatedUser(req);
  const started = await voiceService.startVoiceTurn(userId, req.params.id, req.body.content);

  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) {
      abort.abort();
    }
  });

  res.status(200).set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Stops nginx holding the stream back until it ends.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const send = (event: VoiceEvent): void => {
    if (!res.writableEnded && !abort.signal.aborted) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  };

  await voiceService.streamVoiceReply(started, send, abort.signal);
  res.end();
};
