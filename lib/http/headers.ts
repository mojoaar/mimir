/**
 * The headers a self-hosted install can hold to without knowing its domain.
 * There is no script-src: Next injects inline bootstrap scripts, and a wrong
 * policy breaks the app rather than protecting it. Framing and referrers are
 * the parts that need no knowledge of the app.
 */
export function securityHeaders(): { key: string; value: string }[] {
  return [
    {
      key: 'Content-Security-Policy',
      value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    // No includeSubDomains: a homelab domain is usually shared with other
    // services, and this app must not pin them for a year.
    { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  ]
}
