import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getBoss: vi.fn(),
  getBackupSettings: vi.fn(),
}))

vi.mock('./boss', () => ({ getBoss: mocks.getBoss, registerWorker: vi.fn() }))
vi.mock('@/lib/settings/backup-settings', () => ({
  getBackupSettings: mocks.getBackupSettings,
}))

describe('scheduleBackups', () => {
  beforeEach(() => {
    mocks.getBoss.mockReset()
    mocks.getBackupSettings.mockReset()
  })

  it('schedules the nightly run when backups are enabled', async () => {
    const schedule = vi.fn().mockResolvedValue(undefined)
    mocks.getBoss.mockReturnValue({ schedule, unschedule: vi.fn() })
    mocks.getBackupSettings.mockResolvedValue({
      enabled: true,
      schedule: '0 3 * * *',
      retention: 14,
      target: 's3',
    })

    const { scheduleBackups } = await import('./backup')
    await scheduleBackups()

    expect(schedule).toHaveBeenCalledTimes(1)
    expect(schedule).toHaveBeenCalledWith('backup', '0 3 * * *', {})
  })

  it('removes the schedule when backups are disabled', async () => {
    const unschedule = vi.fn().mockResolvedValue(undefined)
    mocks.getBoss.mockReturnValue({ schedule: vi.fn(), unschedule })
    mocks.getBackupSettings.mockResolvedValue({
      enabled: false,
      schedule: '0 3 * * *',
      retention: 14,
      target: null,
    })

    const { scheduleBackups } = await import('./backup')
    await scheduleBackups()

    expect(unschedule).toHaveBeenCalledWith('backup')
  })

  it('does nothing when the queue is not running', async () => {
    const error = Object.assign(new Error('jobs_not_started'), { code: 'jobs_not_started' })
    mocks.getBoss.mockImplementation(() => {
      throw error
    })
    mocks.getBackupSettings.mockResolvedValue({
      enabled: true,
      schedule: '0 3 * * *',
      retention: 14,
      target: 's3',
    })

    const { scheduleBackups } = await import('./backup')
    await expect(scheduleBackups()).resolves.toBeUndefined()
  })
})
