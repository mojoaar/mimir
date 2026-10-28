import { ImageResponse } from 'next/og'

export const alt = 'Mimir - long-term memory for your agents'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// The image is rendered outside the CSS cascade, so the brand colours are literals
// copied from styles/tokens/nordlys.css (dark mode), the default theme.
const BACKGROUND = '#0b1020'
const ACCENT = '#6ee0a8'
const TEXT = '#e6ecf5'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: BACKGROUND,
          color: TEXT,
          padding: '72px',
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 6, textTransform: 'uppercase', color: ACCENT }}>
          self-hosted
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 104, fontWeight: 700, letterSpacing: -3 }}>Mimir</div>
          <div style={{ fontSize: 44, lineHeight: 1.25, color: TEXT }}>
            Long-term memory for your agents and projects.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 32, fontSize: 28, color: ACCENT }}>
          <span>MCP</span>
          <span>·</span>
          <span>REST API</span>
          <span>·</span>
          <span>Postgres + pgvector</span>
        </div>
      </div>
    ),
    size,
  )
}
