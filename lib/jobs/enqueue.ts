import { EXTRACT_DEBOUNCE_SECONDS } from './constants'

/**
 * A write and a learning toggle both queue an extraction. The queue's `short`
 * policy collapses them per project, and the handler checks `learning_enabled`
 * again at run time because the flag can change between the send and the job.
 */
export async function enqueueExtraction(projectId: string): Promise<void> {
  try {
    const { sendJob } = await import('./boss')
    await sendJob(
      'extract',
      { projectId },
      { singletonKey: projectId, startAfter: EXTRACT_DEBOUNCE_SECONDS },
    )
  } catch (error) {
    console.error(`could not queue extraction (${(error as Error).message})`)
  }
}

/**
 * A changed embedding model makes every stored vector incomparable, so the job
 * that rebuilds them is a different job from the one that fills gaps. Answers
 * false when the queue is down, because clearing vectors without a rebuild
 * would leave search with nothing to rank.
 */
export async function enqueueEmbeddingRebuild(changed: boolean): Promise<boolean> {
  const { sendJob } = await import('./boss')
  const id = changed ? await sendJob('reembed', { confirm: true }) : await sendJob('backfill', {})
  return id !== null
}
