import { withAdmin } from '@/lib/db/tx'
import { resolveExtractionProvider } from '@/lib/providers/resolve'

export type LearningReadiness = { learning: boolean; provider: boolean }

/**
 * Extraction needs two things: learning is on for the project, and a language
 * provider resolves for its owner. Asking first is the difference between a job
 * that writes memories and one that returns zero without saying why.
 */
export async function learningReadiness(projectId: string): Promise<LearningReadiness> {
  const { rows } = await withAdmin((client) =>
    client.query<{ learning_enabled: boolean }>('select learning_enabled from projects where id = $1', [projectId]),
  )
  // No provider lookup when learning is off: the answer is already no, and the
  // lookup reads the owner's secret.
  if (rows[0]?.learning_enabled !== true) return { learning: false, provider: false }

  return { learning: true, provider: (await resolveExtractionProvider(projectId)) !== null }
}
