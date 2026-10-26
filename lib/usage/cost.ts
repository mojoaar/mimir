export type Price = { input: number | null; output: number | null }

/**
 * Prices are quoted per million tokens, and a micro-dollar is a millionth of a
 * dollar, so the two cancel: cost in micro-dollars is tokens times price.
 * Null means the price for something that was actually used is unknown.
 */
export function costMicros(
  tokens: { prompt: number | null; completion: number | null },
  price: Price,
): number | null {
  const prompt = tokens.prompt ?? 0
  const completion = tokens.completion ?? 0
  if (prompt > 0 && price.input === null) return null
  if (completion > 0 && price.output === null) return null
  return Math.round(prompt * (price.input ?? 0) + completion * (price.output ?? 0))
}

/** A provider that sends no usage still moved text; four characters is a token. */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4)
}

/**
 * Twenty calls in an hour is already unusual here (a batch is a handful), and
 * five times the quiet-week median means something is repeating that should not.
 */
export function isSpike(calls: number, median: number): boolean {
  return calls >= 20 && calls > median * 5
}
