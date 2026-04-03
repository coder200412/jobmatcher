'use client';

const EVENT_STYLES = {
  submitted: { icon: '1', accent: 'var(--info)' },
  reviewed: { icon: '2', accent: 'var(--warning)' },
  shortlisted: { icon: '3', accent: 'var(--primary)' },
  rejected: { icon: '!', accent: 'var(--error)' },
  hired: { icon: '*', accent: 'var(--success)' },
  note: { icon: 'i', accent: 'var(--text-accent)' },
};

function formatTimestamp(value) {
  if (!value) return 'Just now';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ApplicationTimeline({
  timeline = [],
  compact = false,
  emptyMessage = 'Timeline updates will appear here.',
}) {
  if (!timeline.length) {
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
      {timeline.map((event, index) => {
        const style = EVENT_STYLES[event.eventType] || EVENT_STYLES.note;

        return (
          <div
            key={event.id || `${event.eventType}-${index}`}
            style={{
              display: 'grid',
              gridTemplateColumns: compact ? '32px 1fr' : '40px 1fr',
              gap: compact ? 'var(--space-sm)' : 'var(--space-md)',
              alignItems: 'start',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: compact ? '28px' : '34px',
                height: compact ? '28px' : '34px',
                borderRadius: '999px',
                background: `${style.accent}22`,
                color: style.accent,
                fontWeight: 700,
                display: 'grid',
                placeItems: 'center',
                border: `1px solid ${style.accent}55`,
                fontSize: compact ? '0.8rem' : '0.9rem',
              }}>
                {style.icon}
              </div>
              {index < timeline.length - 1 && (
                <div style={{
                  width: '2px',
                  minHeight: compact ? '26px' : '34px',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.25), rgba(255,255,255,0.04))',
                  borderRadius: '999px',
                }} />
              )}
            </div>

            <div style={{
              padding: compact ? 'var(--space-sm)' : 'var(--space-md)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-glass)',
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 'var(--space-sm)',
                marginBottom: '6px',
              }}>
                <div style={{ fontWeight: 600, fontSize: compact ? '0.92rem' : '0.98rem' }}>
                  {event.title}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                  {formatTimestamp(event.createdAt)}
                </div>
              </div>

              {event.description && (
                <div style={{
                  color: 'var(--text-secondary)',
                  fontSize: compact ? '0.83rem' : '0.9rem',
                  lineHeight: 1.5,
                }}>
                  {event.description}
                </div>
              )}

              {event.actorRole && (
                <div style={{
                  marginTop: '8px',
                  color: 'var(--text-muted)',
                  fontSize: '0.74rem',
                  textTransform: 'capitalize',
                  letterSpacing: '0.04em',
                }}>
                  {event.actorRole === 'candidate' ? 'Candidate action' : `${event.actorRole} update`}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
