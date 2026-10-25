export type FusedHit = { id: string; score: number }

/**
 * Reciprocal Rank Fusion. Each list contributes 1/(k + rank), rank starting at
 * 1, so agreement between arms beats a single confident arm. Used instead of
 * score normalisation because cosine distance and ts_rank_cd are not on
 * comparable scales and never will be.
 */
export function rrfFuse(lists: readonly (readonly string[])[], k = 60): FusedHit[] {
  const scores = new Map<string, number>()

  for (const list of lists) {
    const seen = new Set<string>()
    list.forEach((id, index) => {
      if (seen.has(id)) return
      seen.add(id)
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1))
    })
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
}
