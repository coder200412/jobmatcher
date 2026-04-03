'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useState } from 'react';

const FEATURES = [
  { icon: '🔍', title: 'Smart Search', desc: 'Full-text search across millions of jobs with filters for salary, experience, location, and skills.' },
  { icon: '🎯', title: 'AI Matching', desc: 'Intelligent TF-IDF recommendation engine matches you to jobs based on skills, experience, and preferences.' },
  { icon: '⚡', title: 'Real-Time Events', desc: 'Apache Kafka-powered event system delivers instant notifications on applications and new matches.' },
  { icon: '📊', title: 'Analytics', desc: 'Track click-through rates, application conversions, and hiring pipeline metrics in real time.' },
  { icon: '🔐', title: 'Secure Auth', desc: 'JWT-based authentication with role-based access control for candidates and recruiters.' },
  { icon: '🚀', title: 'Scalable', desc: 'Microservices architecture with Redis caching, rate limiting, and distributed processing.' },
];

const STATS = [
  { value: '10K+', label: 'Active Jobs' },
  { value: '50K+', label: 'Candidates' },
  { value: '95%', label: 'Match Accuracy' },
  { value: '<200ms', label: 'Search Speed' },
];

export default function Home() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    window.location.href = `/jobs?q=${encodeURIComponent(searchQuery)}`;
  };

  return (
    <>
      {/* Hero Section */}
      <section className="hero container" id="hero">
        <h1 className="animate-fade-in">
          Find Your <span className="gradient-text">Perfect Match</span><br />
          in Tech Careers
        </h1>
        <p className="animate-fade-in delay-1">
          AI-powered job matching engine connecting top talent with leading tech companies.
          Built with event-driven architecture for real-time, intelligent recommendations.
        </p>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="animate-fade-in delay-2">
          <div className="search-container" id="hero-search">
            <span style={{ fontSize: '1.2rem' }}>🔍</span>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Search jobs... React, Python, DevOps, Remote..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              id="hero-search-input"
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-primary" id="hero-search-btn">
              Search Jobs
            </button>
          </div>
        </form>

        {/* Quick filters */}
        <div className="flex flex-wrap justify-center gap-sm animate-fade-in delay-3" style={{ marginTop: 'var(--space-lg)' }}>
          {['React', 'Python', 'DevOps', 'Remote', 'Machine Learning'].map(tag => (
            <Link key={tag} href={`/jobs?q=${encodeURIComponent(tag)}`} className="filter-chip">
              {tag}
            </Link>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="container" style={{ paddingBottom: 'var(--space-3xl)' }}>
        <div className="grid grid-4 animate-fade-in delay-4" id="stats-grid">
          {STATS.map((stat, i) => (
            <div key={i} className="stat-card" style={{ textAlign: 'center' }}>
              <div className="stat-card-value">{stat.value}</div>
              <div className="stat-card-label">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="section container" id="features">
        <div className="section-header" style={{ justifyContent: 'center', textAlign: 'center', flexDirection: 'column' }}>
          <h2>Why <span className="gradient-text">Joblume</span>?</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-sm)', maxWidth: '600px' }}>
            Enterprise-grade architecture powering intelligent job recommendations at scale.
          </p>
        </div>

        <div className="grid grid-3">
          {FEATURES.map((feature, i) => (
            <div key={i} className="glass-card animate-slide-up" style={{ animationDelay: `${i * 0.1}s`, opacity: 0 }}>
              <div style={{ fontSize: '2rem', marginBottom: 'var(--space-md)' }}>{feature.icon}</div>
              <h4 style={{ marginBottom: 'var(--space-sm)' }}>{feature.title}</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Architecture Section */}
      <section className="section container">
        <div className="glass-card" style={{ textAlign: 'center', padding: 'var(--space-3xl) var(--space-xl)', animation: 'pulse-glow 4s infinite' }}>
          <h2 style={{ marginBottom: 'var(--space-md)' }}>
            Built with <span className="gradient-text">Production-Grade</span> Architecture
          </h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '700px', margin: '0 auto var(--space-xl)' }}>
            Event-driven microservices backed by Apache Kafka, Elasticsearch for full-text search,
            Redis for caching, and PostgreSQL for persistence. All orchestrated with Docker.
          </p>
          <div className="flex flex-wrap justify-center gap-md">
            {['Node.js', 'Kafka', 'Elasticsearch', 'Redis', 'PostgreSQL', 'Next.js', 'Docker'].map(tech => (
              <span key={tech} className="skill-tag" style={{ fontSize: '0.9rem', padding: '8px 18px' }}>
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section container" style={{ textAlign: 'center', paddingBottom: 'var(--space-3xl)' }}>
        <h2 style={{ marginBottom: 'var(--space-md)' }}>Ready to Find Your Match?</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-xl)' }}>
          Join thousands of tech professionals finding their dream jobs.
        </p>
        <div className="flex justify-center gap-md">
          {user ? (
            <Link href={user.role === 'recruiter' ? '/recruiter' : '/dashboard'} className="btn btn-primary btn-lg">
              Go to Dashboard →
            </Link>
          ) : (
            <>
              <Link href="/auth/register" className="btn btn-primary btn-lg" id="cta-register">
                Get Started Free →
              </Link>
              <Link href="/auth/login" className="btn btn-secondary btn-lg" id="cta-login">
                Sign In
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-default)',
        padding: 'var(--space-xl) 0',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '0.85rem',
      }}>
        <div className="container">
          <p>⚡ Joblume — Scalable Event-Driven Job Matching System</p>
          <p style={{ marginTop: 'var(--space-xs)' }}>
            Built with Node.js · Kafka · Elasticsearch · Redis · PostgreSQL · Next.js
          </p>
        </div>
      </footer>
    </>
  );
}
