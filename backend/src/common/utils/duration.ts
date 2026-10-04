const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Converts a JWT style duration ("15m", "7d") into milliseconds. */
export function durationToMs(duration: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    throw new Error(`Unsupported duration format: ${duration}`);
  }
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit];
}

const UNIT_NAME: Record<string, string> = {
  s: 'second',
  m: 'minute',
  h: 'hour',
  d: 'day',
};

/** Renders the same duration for a human, so "1h" reads as "1 hour" in an email. */
export function formatDuration(duration: string): string {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    throw new Error(`Unsupported duration format: ${duration}`);
  }
  const [, amount, unit] = match;
  const name = UNIT_NAME[unit];
  return `${amount} ${name}${Number(amount) === 1 ? '' : 's'}`;
}
