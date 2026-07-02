import type { SiteStatus } from '../../types'

const STATUS_STYLES: Record<SiteStatus, { bg: string; color: string; dot: string }> = {
  Active:      { bg: '#dcfce7', color: '#15803d', dot: '#16A34A' },
  Warning:     { bg: '#fef9c3', color: '#92400e', dot: '#D97706' },
  Blacklisted: { bg: '#fee2e2', color: '#991b1b', dot: '#DC2626' },
  Parked:      { bg: '#f1f5f9', color: '#475569', dot: '#94A3B8' },
  Suspended:   { bg: '#ffedd5', color: '#9a3412', dot: '#EA580C' },
  Unreachable: { bg: '#fee2e2', color: '#b91c1c', dot: '#DC2626' },
  Unknown:     { bg: '#f1f5f9', color: '#6B7280', dot: '#9CA3AF' },
}

export function StatusBadge({ status }: { status: SiteStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES['Unknown']
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 6,
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 600,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0, display: 'inline-block' }} />
      {status}
    </span>
  )
}
