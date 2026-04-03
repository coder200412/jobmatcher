import { Suspense } from 'react';
import JobsPageClient from './JobsPageClient';

function JobsFallback() {
  return (
    <div className="container section" id="jobs-page">
      <div className="section-header" style={{ flexDirection: 'column', textAlign: 'center' }}>
        <div className="skeleton" style={{ height: '2.5rem', width: '18rem', margin: '0 auto var(--space-sm)' }} />
        <div className="skeleton" style={{ height: '1rem', width: '10rem', margin: '0 auto var(--space-lg)' }} />
      </div>
      <div className="grid grid-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton skeleton-card" />
        ))}
      </div>
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={<JobsFallback />}>
      <JobsPageClient />
    </Suspense>
  );
}
