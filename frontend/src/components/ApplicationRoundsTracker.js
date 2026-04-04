'use client';

const ROUND_STATUS_STYLES = {
  pending: {
    label: 'Pending',
    badgeClass: 'badge-neutral',
    accent: 'var(--text-muted)',
  },
  cleared: {
    label: 'Cleared',
    badgeClass: 'badge-success',
    accent: 'var(--success)',
  },
  not_cleared: {
    label: 'Not Cleared',
    badgeClass: 'badge-error',
    accent: 'var(--error)',
  },
};

function formatTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ApplicationRoundsTracker({
  rounds = [],
  compact = false,
  emptyMessage = 'Recruiter rounds will appear here once they are configured.',
}) {
  if (!rounds.length) {
    return (
      <div style={{
        padding: compact ? 'var(--space-sm)' : 'var(--space-md)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-glass)',
        color: 'var(--text-secondary)',
        fontSize: '0.9rem',
      }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: compact ? 'var(--space-sm)' : 'var(--space-md)' }}>
      {rounds.map((round) => {
        const style = ROUND_STATUS_STYLES[round.status] || ROUND_STATUS_STYLES.pending;
        const evaluatedAt = formatTimestamp(round.evaluatedAt);

        return (
          <div
            key={round.roundId || round.id}
            style={{
              padding: compact ? 'var(--space-sm)' : 'var(--space-md)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-glass)',
              border: `1px solid ${style.accent}22`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-sm)', marginBottom: '8px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700 }}>
                  Round {round.order}: {round.name}
                </div>
                {evaluatedAt && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '4px' }}>
                    Updated {evaluatedAt}
                  </div>
                )}
              </div>
              <span className={`badge ${style.badgeClass}`}>{style.label}</span>
            </div>

            {round.recruiterNote && (
              <div style={{ color: 'var(--text-secondary)', fontSize: compact ? '0.82rem' : '0.88rem', marginBottom: round.recruiterReason ? '8px' : 0 }}>
                {round.recruiterNote}
              </div>
            )}

            {round.recruiterReason && (
              <div style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.14)',
                color: 'var(--text-secondary)',
                fontSize: compact ? '0.82rem' : '0.88rem',
              }}>
                <strong style={{ color: 'var(--text-primary)' }}>Reason:</strong> {round.recruiterReason}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
