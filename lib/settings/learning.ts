import { readSetting, writeSetting } from './store'

const KEY = 'learning_default'

/**
 * Whether a project created from now on starts with learning on. Copied into
 * the row at creation, so turning this on never changes an existing project.
 */
export async function getLearningDefault(): Promise<boolean> {
  return (await readSetting<boolean>(KEY)) === true
}

export async function setLearningDefault(value: boolean, updatedBy: string): Promise<void> {
  await writeSetting(KEY, value === true, updatedBy)
}
