import { requireAdmin } from '@/lib/auth/admin'
import { translator, type Translate } from '@/lib/i18n/request'
import { listUsers, type AdminUser, type UserStatus } from '@/lib/users/service'
import { InviteForm } from './invite-form'
import { ResetForm } from './reset-form'
import { UserForm } from './user-form'
import {
  deleteUserAction,
  disableUserAction,
  enableUserAction,
  resetMfaAction,
  setRoleAction,
  verifyUserAction,
} from './actions'

export const instant = false

const secondary =
  'rounded border border-[var(--border)] px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

const STATUSES: (UserStatus | 'all')[] = ['all', 'pending', 'active', 'disabled']

const STATUS_KEY: Record<string, string> = {
  all: 'app.admin.users.statusAll',
  pending: 'app.admin.users.statusPending',
  active: 'app.admin.users.statusActive',
  disabled: 'app.admin.users.statusDisabled',
}

function statusLabel(value: string, t: Translate): string {
  const key = STATUS_KEY[value]
  return key ? t(key) : value
}

function when(value: Date | null, t: Translate): string {
  return value ? new Date(value).toLocaleDateString() : t('app.admin.users.never')
}

function Row({ user, t }: { user: AdminUser; t: Translate }) {
  return (
    <li className="space-y-2 rounded border border-[var(--border)] bg-[var(--bg-raised)] p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{user.email}</span>
        <span className="text-[var(--text-muted)]">{user.name}</span>
        {user.role === 'admin' && (
          <span className="rounded bg-[var(--accent)] px-2 py-0.5 text-xs text-[var(--accent-fg)]">
            {t('app.admin.users.roleAdmin')}
          </span>
        )}
        <span
          className={
            user.status === 'disabled' ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'
          }
        >
          {statusLabel(user.status, t)}
        </span>
      </div>

      <div className="text-[var(--text-muted)]">
        {t(user.mfaEnabled ? 'app.admin.users.mfaOn' : 'app.admin.users.mfaOff')} ·{' '}
        {t('app.admin.users.lastLogin', { when: when(user.lastLoginAt, t) })} ·{' '}
        {t(user.projectCount === 1 ? 'app.admin.users.projectOne' : 'app.admin.users.projectMany', {
          count: user.projectCount,
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {user.status === 'pending' && (
          <form action={verifyUserAction.bind(null, {})}>
            <input type="hidden" name="id" value={user.id} />
            <button type="submit" className={secondary}>
              {t('app.admin.users.verify')}
            </button>
          </form>
        )}

        {user.status === 'active' && (
          <form action={disableUserAction.bind(null, {})}>
            <input type="hidden" name="id" value={user.id} />
            <button type="submit" className={secondary}>
              {t('app.admin.users.disable')}
            </button>
          </form>
        )}

        {user.status === 'disabled' && (
          <form action={enableUserAction.bind(null, {})}>
            <input type="hidden" name="id" value={user.id} />
            <button type="submit" className={secondary}>
              {t('app.admin.users.enable')}
            </button>
          </form>
        )}

        <form action={setRoleAction.bind(null, {})} className="flex items-center gap-1">
          <input type="hidden" name="id" value={user.id} />
          <select
            name="role"
            defaultValue={user.role}
            className={secondary}
            aria-label={t('app.admin.users.roleLabel')}
          >
            <option value="user">{t('app.admin.users.roleUser')}</option>
            <option value="admin">{t('app.admin.users.roleAdmin')}</option>
          </select>
          <button type="submit" className={secondary}>
            {t('app.admin.users.setRole')}
          </button>
        </form>

        {user.hasPassword ? (
          <ResetForm
            userId={user.id}
            email={user.email}
            labels={{ submit: t('app.admin.users.sendReset'), pending: t('app.admin.users.sending') }}
          />
        ) : (
          <InviteForm
            userId={user.id}
            email={user.email}
            labels={{
              submit: t('app.admin.users.resendInvite'),
              pending: t('app.admin.users.sending'),
            }}
          />
        )}

        {user.mfaEnabled && (
          <form action={resetMfaAction.bind(null, {})}>
            <input type="hidden" name="id" value={user.id} />
            <button type="submit" className={secondary}>
              {t('app.admin.users.resetMfa')}
            </button>
          </form>
        )}

        <form action={deleteUserAction.bind(null, {})} className="flex items-center gap-1">
          <input type="hidden" name="id" value={user.id} />
          <input type="hidden" name="email" value={user.email} />
          <input
            name="confirmEmail"
            placeholder={t('app.admin.users.confirmPlaceholder')}
            aria-label={t('app.admin.users.confirmLabel', { email: user.email })}
            className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
          />
          <button type="submit" className="text-xs text-[var(--danger)] underline">
            {t('app.admin.users.delete')}
          </button>
        </form>
      </div>
    </li>
  )
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; status?: string; notice?: string; error?: string }>
}) {
  await requireAdmin()
  const t = await translator()
  const params = await searchParams
  const status = STATUSES.includes(params.status as UserStatus) ? (params.status as UserStatus) : 'all'
  const { rows, total } = await listUsers({
    query: params.query?.trim() || undefined,
    status: status === 'all' ? undefined : status,
  })

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('app.admin.users.title')}</h1>
        <p className="text-sm text-[var(--text-muted)]">{t('app.admin.users.intro')}</p>
      </section>

      {params.notice && <p className="text-sm text-[var(--accent)]">{params.notice}</p>}
      {params.error && <p className="text-sm text-[var(--danger)]">{params.error}</p>}

      <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-[var(--text-muted)]">{t('app.admin.users.search')}</span>
          <input
            name="query"
            defaultValue={params.query ?? ''}
            placeholder={t('app.admin.users.searchPlaceholder')}
            className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[var(--text-muted)]">{t('app.admin.users.status')}</span>
          <select
            name="status"
            defaultValue={status}
            className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
          >
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {statusLabel(value, t)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={secondary}>
          {t('app.admin.users.filter')}
        </button>
        <span className="text-[var(--text-muted)]">
          {t(total === 1 ? 'app.admin.users.countOne' : 'app.admin.users.countMany', { count: total })}
        </span>
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">{t('app.admin.users.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((user) => (
            <Row key={user.id} user={user} t={t} />
          ))}
        </ul>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t('app.admin.users.createTitle')}</h2>
        <p className="text-sm text-[var(--text-muted)]">{t('app.admin.users.createHint')}</p>
        <UserForm
          labels={{
            email: t('app.admin.users.email'),
            name: t('app.admin.users.name'),
            role: t('app.admin.users.roleLabel'),
            roleUser: t('app.admin.users.roleUser'),
            roleAdmin: t('app.admin.users.roleAdmin'),
            password: t('app.admin.users.passwordOptional'),
            submit: t('app.admin.users.create'),
            pending: t('app.admin.users.creating'),
            emailOff: t('app.admin.users.emailOff'),
          }}
        />
      </section>
    </main>
  )
}
