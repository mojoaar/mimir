/**
 * Batches are what the server will accept in one call: 100 files and 2 MB.
 * Greedy and order-preserving, so a big repository becomes several requests
 * instead of one rejected one.
 */
export type Batch<T> = { files: T[]; bytes: number }

export function batchFiles<T extends { bytes: number }>(
  files: T[],
  maxFiles = 100,
  maxBytes = 2 * 1024 * 1024,
): Batch<T>[] {
  const batches: Batch<T>[] = []
  let current: Batch<T> = { files: [], bytes: 0 }

  for (const file of files) {
    const wouldOverflow =
      current.files.length > 0 && (current.files.length >= maxFiles || current.bytes + file.bytes > maxBytes)
    if (wouldOverflow) {
      batches.push(current)
      current = { files: [], bytes: 0 }
    }
    current.files.push(file)
    current.bytes += file.bytes
  }

  if (current.files.length > 0) batches.push(current)
  return batches
}
