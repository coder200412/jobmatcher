-- Create separate schemas for each service (database-per-service pattern within single instance)
CREATE SCHEMA IF NOT EXISTS user_service;
CREATE SCHEMA IF NOT EXISTS job_service;
CREATE SCHEMA IF NOT EXISTS notification_service;
CREATE SCHEMA IF NOT EXISTS analytics_service;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ═══════════════════════════════════════════════════════
-- USER SERVICE TABLES
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_service.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(20) DEFAULT 'candidate' CHECK (role IN ('candidate', 'recruiter', 'admin')),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    headline VARCHAR(255),
    bio TEXT,
    location VARCHAR(255),
    experience_years INTEGER DEFAULT 0,
    avatar_url VARCHAR(500),
    resume_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS user_service.users
ALTER COLUMN password_hash DROP NOT NULL,
ADD COLUMN IF NOT EXISTS education_school VARCHAR(255),
ADD COLUMN IF NOT EXISTS current_company VARCHAR(255),
ADD COLUMN IF NOT EXISTS company_history JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS career_goal VARCHAR(255),
ADD COLUMN IF NOT EXISTS preferred_roles JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS interest_tags JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS resume_text TEXT,
ADD COLUMN IF NOT EXISTS resume_keywords JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS last_resume_analysis_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS verified_recruiter BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS google_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'local';

CREATE TABLE IF NOT EXISTS user_service.verification_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    code VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(20) DEFAULT 'candidate' CHECK (role IN ('candidate', 'recruiter', 'admin')),
    google_id VARCHAR(255),
    auth_provider VARCHAR(20) DEFAULT 'local',
    avatar_url VARCHAR(500),
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS user_service.verification_codes
ALTER COLUMN code TYPE VARCHAR(255),
ALTER COLUMN password_hash DROP NOT NULL,
ADD COLUMN IF NOT EXISTS google_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'local',
ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);

CREATE TABLE IF NOT EXISTS user_service.user_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_service.users(id) ON DELETE CASCADE,
    skill_name VARCHAR(100) NOT NULL,
    proficiency VARCHAR(20) DEFAULT 'intermediate' CHECK (proficiency IN ('beginner', 'intermediate', 'expert')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON user_service.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON user_service.users(role);
CREATE INDEX IF NOT EXISTS idx_users_education_school ON user_service.users(education_school);
CREATE INDEX IF NOT EXISTS idx_users_current_company ON user_service.users(current_company);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON user_service.users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON user_service.verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires_at ON user_service.verification_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_skills_user_id ON user_service.user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill ON user_service.user_skills(skill_name);

-- ═══════════════════════════════════════════════════════
-- JOB SERVICE TABLES
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS job_service.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recruiter_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    company VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    location VARCHAR(255),
    work_type VARCHAR(20) DEFAULT 'onsite' CHECK (work_type IN ('remote', 'hybrid', 'onsite')),
    salary_min INTEGER,
    salary_max INTEGER,
    currency VARCHAR(3) DEFAULT 'USD',
    experience_min INTEGER DEFAULT 0,
    experience_max INTEGER,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'draft')),
    views_count INTEGER DEFAULT 0,
    applications_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS job_service.jobs
ADD COLUMN IF NOT EXISTS priority_score INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS job_service.job_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES job_service.jobs(id) ON DELETE CASCADE,
    skill_name VARCHAR(100) NOT NULL,
    is_required BOOLEAN DEFAULT true,
    UNIQUE(job_id, skill_name)
);

CREATE TABLE IF NOT EXISTS job_service.applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES job_service.jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    status VARCHAR(20) DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed', 'shortlisted', 'rejected', 'hired')),
    cover_letter TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(job_id, user_id)
);

CREATE TABLE IF NOT EXISTS job_service.application_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES job_service.applications(id) ON DELETE CASCADE,
    job_id UUID NOT NULL,
    candidate_id UUID NOT NULL,
    actor_id UUID,
    actor_role VARCHAR(20) DEFAULT 'system' CHECK (actor_role IN ('candidate', 'recruiter', 'admin', 'system')),
    event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('submitted', 'reviewed', 'shortlisted', 'rejected', 'hired', 'note')),
    title VARCHAR(120) NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_service.job_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES job_service.jobs(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL,
    reason VARCHAR(50) NOT NULL CHECK (reason IN ('spam', 'fake_company', 'misleading_description', 'offensive_content', 'other')),
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(job_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_recruiter ON job_service.jobs(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON job_service.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_work_type ON job_service.jobs(work_type);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON job_service.jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_priority_score ON job_service.jobs(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_job_skills_job_id ON job_service.job_skills(job_id);
CREATE INDEX IF NOT EXISTS idx_job_skills_skill ON job_service.job_skills(skill_name);
CREATE INDEX IF NOT EXISTS idx_applications_job ON job_service.applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_user ON job_service.applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON job_service.applications(status);
CREATE INDEX IF NOT EXISTS idx_application_timeline_app_created ON job_service.application_timeline_events(application_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_application_timeline_job_created ON job_service.application_timeline_events(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_timeline_candidate_created ON job_service.application_timeline_events(candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_reports_job_id ON job_service.job_reports(job_id);
CREATE INDEX IF NOT EXISTS idx_job_reports_reporter_id ON job_service.job_reports(reporter_id);

-- ═══════════════════════════════════════════════════════
-- NOTIFICATION SERVICE TABLES
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_service.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_service.notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL,
    email_new_jobs BOOLEAN DEFAULT true,
    email_application_updates BOOLEAN DEFAULT true,
    push_new_jobs BOOLEAN DEFAULT true,
    push_application_updates BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS notification_service.notification_preferences
ADD COLUMN IF NOT EXISTS min_match_score INTEGER DEFAULT 70,
ADD COLUMN IF NOT EXISTS only_high_priority BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notification_service.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notification_service.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notification_service.notifications(created_at DESC);

-- ═══════════════════════════════════════════════════════
-- ANALYTICS SERVICE TABLES
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS analytics_service.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    user_id UUID,
    data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics_service.job_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID UNIQUE NOT NULL,
    views_count INTEGER DEFAULT 0,
    unique_views_count INTEGER DEFAULT 0,
    applications_count INTEGER DEFAULT 0,
    click_through_rate DECIMAL(5,4) DEFAULT 0,
    avg_time_to_apply_hours DECIMAL(10,2),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics_service.daily_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stat_date DATE NOT NULL,
    total_jobs_posted INTEGER DEFAULT 0,
    total_applications INTEGER DEFAULT 0,
    total_users_registered INTEGER DEFAULT 0,
    active_users INTEGER DEFAULT 0,
    avg_ctr DECIMAL(5,4) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(stat_date)
);

CREATE TABLE IF NOT EXISTS analytics_service.user_preference_signals (
    user_id UUID NOT NULL,
    signal_type VARCHAR(50) NOT NULL CHECK (signal_type IN ('skill', 'company', 'location', 'work_type', 'title_keyword')),
    signal_value VARCHAR(255) NOT NULL,
    score DECIMAL(10,2) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY(user_id, signal_type, signal_value)
);

CREATE TABLE IF NOT EXISTS analytics_service.experiment_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    experiment_key VARCHAR(100) NOT NULL,
    variant VARCHAR(50) NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, experiment_key)
);

CREATE TABLE IF NOT EXISTS analytics_service.experiment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_key VARCHAR(100) NOT NULL,
    variant VARCHAR(50) NOT NULL,
    metric_key VARCHAR(100) NOT NULL,
    metric_value DECIMAL(10,2) DEFAULT 1,
    user_id UUID,
    entity_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_type ON analytics_service.events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_entity ON analytics_service.events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_events_user ON analytics_service.events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON analytics_service.events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_metrics_job ON analytics_service.job_metrics(job_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON analytics_service.daily_stats(stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_user_preference_signals_user ON analytics_service.user_preference_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_experiment_assignments_key ON analytics_service.experiment_assignments(experiment_key, variant);
CREATE INDEX IF NOT EXISTS idx_experiment_events_key ON analytics_service.experiment_events(experiment_key, variant, metric_key);
