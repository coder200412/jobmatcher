'use client';

function Metric({ label, value }) {
  return (
    <div style={{
      padding: 'var(--space-sm)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-glass)',
    }}>
      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: '1rem' }}>{value}</div>
    </div>
  );
}

export default function RecruiterTrustCard({
  trust,
  title = 'Recruiter Trust Score',
  compact = false,
}) {
  if (!trust) return null;

  const hasScore = trust.trustScore !== null && trust.trustScore !== undefined;

  return (
    <div className="glass-card" style={{ padding: compact ? 'var(--space-lg)' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-lg)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
            {title}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '8px' }}>
            <div style={{ fontSize: compact ? '2rem' : '2.6rem', fontWeight: 800, lineHeight: 1 }}>
              {hasScore ? trust.trustScore : 'New'}
            </div>
            {hasScore && (
              <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                / 100
              </div>
            )}
          </div>
          <div style={{ color: 'var(--text-accent)', fontWeight: 600, marginBottom: '8px' }}>
            {trust.trustLevel}
          </div>
          <div style={{ color: 'var(--text-secondary)', maxWidth: compact ? '100%' : '480px', lineHeight: 1.6 }}>
            {trust.summary}
          </div>
        </div>

        <div style={{
          minWidth: compact ? '220px' : '280px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 'var(--space-sm)',
        }}>
          <Metric label="Response Rate" value={`${trust.responseRate ?? 0}%`} />
          <Metric label="Feedback Rate" value={`${trust.feedbackRate ?? 0}%`} />
          <Metric label="Avg First Reply" value={trust.avgFirstResponseHours ? `${trust.avgFirstResponseHours}h` : 'n/a'} />
          <Metric label="Ghost Rate" value={`${trust.ghostRate ?? 0}%`} />
          <Metric label="Shortlist Rate" value={`${trust.shortlistRate ?? 0}%`} />
          <Metric label="Samples" value={trust.totalApplications ?? 0} />
        </div>
      </div>
    </div>
  );
}
