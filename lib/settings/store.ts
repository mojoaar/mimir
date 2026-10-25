import { audit } from '../audit'
import { withAdmin, withService } from '../db/tx'

export class InvalidSetting extends Error {
  readonly code = 'invalid_params'

  constructor(message: string) {
    super(message)
    this.name = 'InvalidSetting'
  }
}

export async function readSetting<T>(key: string): Promise<T | null> {
  const { rows } = await withService((tx) =>
    tx.query<{ value: T }>('select value from settings where key = $1', [key]),
  )
  return rows[0]?.value ?? null
}

export async function writeSetting(
  key: string,
  value: unknown,
  updatedBy: string | null,
): Promise<void> {
  await withAdmin((tx) =>
    tx.query(
      `insert into settings (key, value, updated_by) values ($1, $2, $3)
       on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by`,
      [key, JSON.stringify(value), updatedBy],
    ),
  )
  await audit({
    actorType: updatedBy ? 'user' : 'system',
    actorId: updatedBy,
    action: 'settings.update',
    targetType: 'setting',
    targetId: key,
  })
}

export async function deleteSetting(key: string, updatedBy: string | null = null): Promise<void> {
  await withAdmin((tx) => tx.query('delete from settings where key = $1', [key]))
  await audit({
    actorType: updatedBy ? 'user' : 'system',
    actorId: updatedBy,
    action: 'settings.delete',
    targetType: 'setting',
    targetId: key,
  })
}
