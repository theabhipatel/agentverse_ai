import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Readability } from '@mozilla/readability';
import { JSDOM, VirtualConsole } from 'jsdom';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import {
  URL_FETCH_TIMEOUT_MS,
  URL_MAX_BYTES,
  URL_MAX_REDIRECTS,
  type SupportedExtension,
} from './knowledge.constants.js';

/** A failure whose message is safe to show an admin as the reason a document failed. */
export class KnowledgeProcessingError extends Error {}

export async function extractFileText(buffer: Buffer, extension: SupportedExtension): Promise<string> {
  switch (extension) {
    case 'pdf':
      try {
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        const { text } = await extractText(pdf, { mergePages: true });
        return text;
      } catch {
        throw new KnowledgeProcessingError('This PDF could not be read. It may be damaged or password protected.');
      }
    case 'docx':
      try {
        const { value } = await mammoth.extractRawText({ buffer });
        return value;
      } catch {
        throw new KnowledgeProcessingError('This Word document could not be read. Only .docx is supported.');
      }
    case 'txt':
    case 'md':
      return buffer.toString('utf8');
  }
}

// ---------- Links ----------

/** Loopback, private, link local, carrier NAT and multicast ranges. */
function isPrivateAddress(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:')) {
    return isPrivateAddress(lower.slice('::ffff:'.length));
  }
  if (isIP(lower) === 4) {
    const [a = 0, b = 0] = lower.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  return lower === '::' || lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
}

/**
 * An admin supplied link must never reach the server's own network: MinIO, the
 * database or a cloud metadata endpoint all sit one hostname away. Every redirect
 * hop is checked again, because a public page can redirect to a private one.
 */
async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((entry) => entry.address);
  } catch {
    throw new KnowledgeProcessingError('This website could not be found.');
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new KnowledgeProcessingError('This link points to a private address and cannot be fetched.');
  }
}

async function fetchPublicPage(rawUrl: string): Promise<{ response: Response; finalUrl: URL }> {
  let current = new URL(rawUrl);

  for (let hop = 0; hop <= URL_MAX_REDIRECTS; hop += 1) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      throw new KnowledgeProcessingError('Only http and https links are supported.');
    }
    await assertPublicHost(current);

    let response: Response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AgentVerseIntelligenceHub/1.0)',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
        },
      });
    } catch {
      throw new KnowledgeProcessingError('This link could not be reached. Check that the page loads in a browser.');
    }

    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      current = new URL(location, current);
      continue;
    }
    return { response, finalUrl: current };
  }

  throw new KnowledgeProcessingError('This link redirects too many times.');
}

async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return '';
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > URL_MAX_BYTES) {
      await reader.cancel();
      throw new KnowledgeProcessingError('This page is larger than 5 MB.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Fetches a page once and keeps only its readable text: Readability drops the
 * navigation, footer and ads that would otherwise pollute every chunk. Scripts
 * never run, so pages that build their content in the browser come back empty.
 */
export async function fetchUrlText(url: string): Promise<{ text: string; title: string | null }> {
  const { response, finalUrl } = await fetchPublicPage(url);
  if (!response.ok) {
    await response.body?.cancel();
    throw new KnowledgeProcessingError(`The page answered with HTTP ${response.status}.`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isPlainText = contentType.includes('text/plain') || contentType.includes('text/markdown');
  if (!isPlainText && !contentType.includes('html')) {
    await response.body?.cancel();
    throw new KnowledgeProcessingError('This link is not a web page. Download it and upload the file instead.');
  }

  const body = await readLimited(response);
  if (isPlainText) {
    return { text: body, title: null };
  }

  // A silent console: jsdom otherwise reports every stylesheet it cannot parse.
  const dom = new JSDOM(body, { url: finalUrl.href, virtualConsole: new VirtualConsole() });
  try {
    const document = dom.window.document;
    const article = new Readability(document).parse();
    return {
      text: article?.textContent ?? document.body?.textContent ?? '',
      title: article?.title?.trim() || document.title.trim() || null,
    };
  } finally {
    dom.window.close();
  }
}
