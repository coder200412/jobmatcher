// ═══════════════════════════════════════════════════════
// SHARED CONSTANTS
// ═══════════════════════════════════════════════════════

const UserRoles = {
  CANDIDATE: 'candidate',
  RECRUITER: 'recruiter',
  ADMIN: 'admin',
};

const JobStatus = {
  ACTIVE: 'active',
  CLOSED: 'closed',
  DRAFT: 'draft',
};

const WorkType = {
  REMOTE: 'remote',
  HYBRID: 'hybrid',
  ONSITE: 'onsite',
};

const ApplicationStatus = {
  SUBMITTED: 'submitted',
  REVIEWED: 'reviewed',
  SHORTLISTED: 'shortlisted',
  REJECTED: 'rejected',
  HIRED: 'hired',
};

const SkillProficiency = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  EXPERT: 'expert',
};

const NotificationType = {
  NEW_JOB_MATCH: 'new_job_match',
  APPLICATION_UPDATE: 'application_update',
  PROFILE_VIEW: 'profile_view',
  WELCOME: 'welcome',
};

const SKILLS_LIST = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'Ruby', 'PHP',
  'React', 'Angular', 'Vue.js', 'Next.js', 'Node.js', 'Express.js', 'Django', 'Flask', 'Spring Boot',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'GraphQL',
  'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Terraform', 'CI/CD',
  'Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision', 'Data Science',
  'HTML', 'CSS', 'Sass', 'Tailwind CSS', 'REST API', 'Microservices',
  'Git', 'Linux', 'Agile', 'Scrum', 'DevOps', 'System Design',
];

module.exports = {
  UserRoles,
  JobStatus,
  WorkType,
  ApplicationStatus,
  SkillProficiency,
  NotificationType,
  SKILLS_LIST,
};
