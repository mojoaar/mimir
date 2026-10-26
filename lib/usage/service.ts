import { cache } from 'react'
import { withAdmin } from '@/lib/db/tx'
import { isSpike } from './cost'

export type Kind = 'llm' | 'embedding'

export type Spend = {
  llmMicros: number
  embeddingMicros: number
  calls: number
  /** Calls whose provider had no price: counted, but not in the totals. */
  unpriced: number
}

export type DaySpend = { day: string; micros: number }
export type HourCalls = { hour: string; calls: number }
export type ModelSpend = { preset: string; model: string; kind: Kind; calls: number; micros: number }
export type PersonSpend = { email: string; calls: number; micros: number }
export type Failure = {
  at: string
  preset: string
  model: string
  purpose: string
  status: number | null
  email: string | null
}
export type Spike = { calls: number; median: number; hourStart: string }

function amount(value: string | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value)
}

/** This month, split the only way that matters for a bill. */
export async function spend(): Promise<Spend> {
  const { rows } = await withAdmin((tx) =>
    tx.query<{
      calls: number
      llm: string
      embedding: string
      unpriced: string
    }>(
      `select count(*)::int as calls,
              coalesce(sum(cost_micros) filter (where kind = 'llm'), 0)::text as llm,
              coalesce(sum(cost_micros) filter (where kind = 'embedding'), 0)::text as embedding,
              count(*) filter (where cost_micros is null)::text as unpriced
         from provider_calls
        where at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'`,
    ),
  )
  const row = rows[0]
  return {
    calls: row?.calls ?? 0,
    llmMicros: amount(row?.llm),
    embeddingMicros: amount(row?.embedding),
    unpriced: Number(row?.unpriced ?? 0),
  }
}

/** One entry per day, including the quiet ones, so the bars keep their scale. */
export async function daily(days = 30): Promise<DaySpend[]> {
  const { rows } = await withAdmin((tx) =>
    tx.query<{ day: string; micros: string }>(
      `select to_char(date_trunc('day', at at time zone 'utc'), 'YYYY-MM-DD') as day,
              coalesce(sum(cost_micros), 0)::text as micros
         from provider_calls
        where at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
                   - ($1::int - 1) * interval '1 day'
        group by 1
        order by 1`,
      [days],
    ),
  )
  const found = new Map(rows.map((row) => [row.day, amount(row.micros)]))
  const today = new Date()
  const out: DaySpend[] = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i))
    const key = date.toISOString().slice(0, 10)
    out.push({ day: key, micros: found.get(key) ?? 0 })
  }
  return out
}

/** The last twenty-four hours, in UTC, for the "is it looping" question. */
export async function hourly(): Promise<HourCalls[]> {
  const { rows } = await withAdmin((tx) =>
    tx.query<{ hour: string; calls: number }>(
      // Format in SQL: a naive timestamp comes back through the server's zone.
      `select to_char(date_trunc('hour', at at time zone 'utc'), 'YYYY-MM-DD"T"HH24') as hour,
              count(*)::int as calls
         from provider_calls
        where at >= date_trunc('hour', now() at time zone 'utc') at time zone 'utc'
                   - interval '23 hours'
        group by 1
        order by 1`,
    ),
  )
  const found = new Map(rows.map((row) => [row.hour, row.calls]))
  const out: HourCalls[] = []
  const start = Date.now() - 23 * 60 * 60 * 1000
  for (let i = 0; i < 24; i += 1) {
    const key = new Date(start + i * 60 * 60 * 1000).toISOString().slice(0, 13)
    out.push({ hour: `${key}:00`, calls: found.get(key) ?? 0 })
  }
  return out
}

export async function breakdown(): Promise<ModelSpend[]> {
  const { rows } = await withAdmin((tx) =>
    tx.query<{ preset: string; model: string; kind: Kind; calls: number; micros: string }>(
      `select preset, model, kind, count(*)::int as calls, coalesce(sum(cost_micros), 0)::text as micros
         from provider_calls
        where at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
        group by preset, model, kind
        order by coalesce(sum(cost_micros), 0) desc, count(*) desc
        limit 20`,
    ),
  )
  return rows.map((row) => ({ ...row, micros: amount(row.micros) }))
}

export async function people(): Promise<PersonSpend[]> {
  const { rows } = await withAdmin((tx) =>
    tx.query<{ email: string | null; calls: number; micros: string }>(
      `select u.email, count(*)::int as calls, coalesce(sum(c.cost_micros), 0)::text as micros
         from provider_calls c
         left join users u on u.id = c.user_id
        where c.at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
        group by u.email
        order by coalesce(sum(c.cost_micros), 0) desc, count(*) desc
        limit 20`,
    ),
  )
  return rows.map((row) => ({
    email: row.email ?? 'system',
    calls: row.calls,
    micros: amount(row.micros),
  }))
}

export async function failures(limit = 10): Promise<Failure[]> {
  const { rows } = await withAdmin((tx) =>
    tx.query<{
      at: Date
      preset: string
      model: string
      purpose: string
      status: number | null
      email: string | null
    }>(
      `select c.at, c.preset, c.model, c.purpose, c.status, u.email
         from provider_calls c
         left join users u on u.id = c.user_id
        where not c.ok
        order by c.at desc
        limit $1`,
      [limit],
    ),
  )
  return rows.map((row) => ({ ...row, at: row.at.toISOString() }))
}

/**
 * The current hour when it is unusual. Cached per request: the admin row and
 * the header pill ask the same question on the same page load.
 */
export const spike = cache(async (): Promise<Spike | null> => {
  const { rows } = await withAdmin((tx) =>
    tx.query<{ calls: number; median: string; hour_start: string }>(
      `with buckets as (
         select date_trunc('hour', at at time zone 'utc') as hour, count(*)::int as calls
           from provider_calls
          where at >= now() - interval '7 days'
          group by 1
       ),
       current_hour as (
         select date_trunc('hour', now() at time zone 'utc') as hour
       ),
       recent as (
         select count(*)::int as calls
           from provider_calls, current_hour
          where at >= current_hour.hour at time zone 'utc'
       ),
       median as (
         select coalesce(percentile_cont(0.5) within group (order by calls), 0) as median
           from buckets, current_hour
          where buckets.hour < current_hour.hour - interval '1 hour'
       )
       select recent.calls,
              ceil(median.median)::text as median,
              to_char(current_hour.hour, 'YYYY-MM-DD"T"HH24:00:00') || 'Z' as hour_start
         from recent, median, current_hour`,
    ),
  )
  const row = rows[0]
  if (!row) return null
  const median = Number(row.median)
  if (!isSpike(row.calls, median)) return null
  return { calls: row.calls, median, hourStart: row.hour_start }
})

/** A spike dismissed at or after its hour stays quiet until a new hour spikes. */
export async function dismissed(userId: string, hourStart: string): Promise<boolean> {
  const { rows } = await withAdmin((tx) =>
    tx.query('select 1 from usage_dismissals where user_id = $1 and dismissed_at >= $2', [
      userId,
      hourStart,
    ]),
  )
  return rows.length > 0
}

export async function dismiss(userId: string): Promise<void> {
  // Only "when" is stored: a dismissal always lands after the current hour
  // began, so it covers that spike and any older one. A new hour is newer.
  await withAdmin((tx) =>
    tx.query(
      `insert into usage_dismissals (user_id, dismissed_at) values ($1, now())
       on conflict (user_id) do update set dismissed_at = now()`,
      [userId],
    ),
  )
}

/**
 * Deletes call history older than the window. Only the meter is pruned; the
 * audit log holds the trail and ages itself out on its own schedule.
 */
export async function pruneUsage(days: number): Promise<number> {
  const { rowCount } = await withAdmin((tx) =>
    tx.query(`delete from provider_calls where at < now() - ($1 || ' days')::interval`, [days]),
  )
  return rowCount ?? 0
}
