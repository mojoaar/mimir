import { getEmailSettings } from '@/lib/settings/email-settings';
import { getPublicUrl } from '@/lib/settings/site';

export type SendResult = { ok: true } | { ok: false; reason: string };

export type EmailInput = { to: string; subject: string; text: string };

export type SendDeps = { fetch?: typeof globalThis.fetch; timeoutMs?: number };

const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Sends one plain-text email through Resend. Email is optional in Mimir, so
 * every failure - including "not configured" - is a value, never an exception:
 * the caller decides whether to show the user a copyable link instead.
 */
export async function sendEmail(input: EmailInput, deps: SendDeps = {}): Promise<SendResult> {
  const settings = await getEmailSettings();
  if (!settings) {
    return { ok: false, reason: 'email is not configured' };
  }

  const doFetch = deps.fetch ?? globalThis.fetch;

  try {
    const response = await doFetch(RESEND_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${settings.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: settings.from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
      signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      // The provider body can echo the key, so only the status is reported.
      return { ok: false, reason: `email provider responded ${response.status}` };
    }

    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'email request failed';
    return { ok: false, reason };
  }
}

export async function absoluteLink(path: string): Promise<string> {
  const base = await getPublicUrl();
  return `${base}/${path.replace(/^\/+/, '')}`;
}
