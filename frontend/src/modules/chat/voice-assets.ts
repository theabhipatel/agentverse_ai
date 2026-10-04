import { env } from '@/config/env'

/**
 * The voice detector fetches its ONNX runtime, model and worklet only when the
 * user presses the voice button, which is why the first turn used to sit there
 * waiting: 3.5 MB over the wire even compressed. Pulling them in while the chat
 * is idle puts them in the browser cache instead, where the /vad/ rules in
 * frontend/nginx.conf keep them for a year, so voice mode starts at once from
 * then on. Kept in step with the copy list in vite.config.ts.
 */
const VOICE_ASSETS = [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.mjs',
  'silero_vad_v5.onnx',
  'vad.worklet.bundle.min.js',
]

let started = false

interface DataSaver {
  saveData?: boolean
  effectiveType?: string
}

/** Nothing is pulled down a connection the user pays for by the megabyte. */
function worthWarming(): boolean {
  const connection = (navigator as Navigator & { connection?: DataSaver }).connection
  if (!connection) {
    return true
  }
  return connection.saveData !== true && !['slow-2g', '2g'].includes(connection.effectiveType ?? '')
}

/**
 * Called once when the chat opens. Every failure is ignored on purpose: this only
 * fills a cache, and voice mode still loads its own assets if none of it arrived.
 */
export function warmVoiceAssets(): void {
  if (started || !worthWarming()) {
    return
  }
  started = true

  const whenIdle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 3000))
  whenIdle(() => {
    // The detector's own code, then the files it will ask the network for.
    void import('@ricky0123/vad-web').catch(() => undefined)

    for (const asset of VOICE_ASSETS) {
      void fetch(`${env.vadAssetsPath}${asset}`, { cache: 'force-cache' })
        // The body has to be read for the browser to keep it.
        .then((response) => response.arrayBuffer())
        .catch(() => undefined)
    }
  })
}
