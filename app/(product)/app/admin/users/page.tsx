import { requireAdmin } from '@/lib/auth/admin'
import { listUsers, type AdminUser, type UserStatus } from '@/lib/users/service'
import { InviteForm } from './invite-form'
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

function label(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function when(value: Date | null): string {
  return value ? new Date(value).toLocaleDateString() : 'never'
}

function Row({ user }: { user: AdminUser }) {
  return (
    <li className="space-y-2 rounded border border-[var(--border)] bg-[var(--bg-raised)] p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{user.email}</span>
        <span className="text-[var(--text-muted)]">{user.name}</span>
        {user.role === 'admin' && (
          <span className="rounded bg-[var(--accent)] px-2 py-0.5 text-xs text-[var(--accent-fg)]">
            admin
          </span>
        )}
        <span
          className={
            user.status === 'active'
              ? 'text-[var(--text-muted)]'
              : user.status === 'pending'
                ? 'text-[var(--text-muted)]'
                : 'text-[var(--danger)]'
          }
        >
          {label(user.status)}
        </span>
      </div>

      <div className="text-[var(--text-muted)]">
        MFA {user.mfaEnabled ? 'on' : 'off'} · last login {when(user.lastLoginAt)} ·{' '}
        {user.projectCount} {user.projectCount === 1 ? 'project' : 'projects'}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {user.status === 'pending' && (
          <>
            <form action={verifyUserAction.bind(null, {})}>
              <input type="hidden" name="id" value={user.id} />
              <button type="submit" className={secondary}>
                Verify
              </button>
            </form>
            <InviteForm userId={user.id} email={user.email} />
          </>
        )}

        {user.status === 'active' && (
          <form action={disableUserAction.bind(null, {})}>
            <input type="hidden" name="id" value={user.id} />
            <button type="submit" className={secondary}>
              Disable
            </button>
          </form>
        )}

        {user.status === 'disabled' && (
          <form action={enableUserAction.bind(null, {})}>
            <input type="hidden" name="id" value={user.id} />
            <button type="submit" className={secondary}>
              Enable
            </button>
          </form>
        )}

        <form action={setRoleAction.bind(null, {})} className="flex items-center gap-1">
          <input type="hidden" name="id" value={user.id} />
          <select name="role" defaultValue={user.role} className={secondary} aria-label="Role">
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit" className={secondary}>
            Set role
          </button>
        </form>

        {user.mfaEnabled && (
          <form action={resetMfaAction.bind(null, {})}>
            <input type="hidden" name="id" value={user.id} />
            <button type="submit" className={secondary}>
              Reset MFA
            </button>
          </form>
        )}

        <form action={deleteUserAction.bind(null, {})} className="flex items-center gap-1">
          <input type="hidden" name="id" value={user.id} />
          <input type="hidden" name="email" value={user.email} />
          <input
            name="confirmEmail"
            placeholder="type email to delete"
            aria-label={`Type ${user.email} to delete`}
            className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
          />
          <button type="submit" className="text-xs text-[var(--danger)] underline">
            Delete
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
  const params = await searchParams
  const status = STATUSES.includes(params.status as UserStatus) ? (params.status as UserStatus) : 'all'
  const { rows, total } = await listUsers({
    query: params.query?.trim() || undefined,
    status: status === 'all' ? undefined : status,
  })

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-[var(--text-muted)]">
          New accounts start pending until an admin verifies them. Disabling an account ends its
          sessions and API keys immediately.
        </p>
      </section>

      {params.notice && <p className="text-sm text-[var(--accent)]">{params.notice}</p>}
      {params.error && <p className="text-sm text-[var(--danger)]">{params.error}</p>}

      <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-[var(--text-muted)]">Search</span>
          <input
            name="query"
            defaultValue={params.query ?? ''}
            placeholder="email or name"
            className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[var(--text-muted)]">Status</span>
          <select
            name="status"
            defaultValue={status}
            className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
          >
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={secondary}>
          Filter
        </button>
        <span className="text-[var(--text-muted)]">
          {total} {total === 1 ? 'user' : 'users'}
        </span>
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No users match that filter.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((user) => (
            <Row key={user.id} user={user} />
          ))}
        </ul>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Create user</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Leave the password empty to create an invite link instead.
        </p>
        <UserForm />
      </section>
    </main>
  )
}
