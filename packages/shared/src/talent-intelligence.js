const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'will', 'your', 'you',
  'our', 'are', 'have', 'has', 'into', 'their', 'about', 'while', 'where',
  'using', 'build', 'work', 'role', 'team', 'teams', 'years', 'experience',
  'skills', 'ability', 'strong', 'plus', 'must', 'want', 'need', 'join',
  'job', 'position', 'candidate', 'candidates', 'company', 'across', 'help',
  'products', 'platform', 'systems', 'system',
]);

const SKILL_ALIASES = {
  'node.js': 'nodejs',
  node: 'nodejs',
  'react.js': 'react',
  js: 'javascript',
  ts: 'typescript',
  postgres: 'postgresql',
  postgresql: 'postgresql',
  aws: 'aws',
  gcp: 'gcp',
  kafka: 'kafka',
  docker: 'docker',
  kubernetes: 'kubernetes',
  k8s: 'kubernetes',
  redis: 'redis',
  sql: 'sql',
  nosql: 'nosql',
  'system design': 'system-design',
  microservices: 'microservices',
  api: 'apis',
  apis: 'apis',
  restful: 'rest-apis',
  'rest api': 'rest-apis',
  'rest apis': 'rest-apis',
  leadership: 'leadership',
  communication: 'communication',
  python: 'python',
  java: 'java',
  javascript: 'javascript',
  typescript: 'typescript',
  react: 'react',
  nextjs: 'nextjs',
  'next.js': 'nextjs',
  express: 'express',
  mongodb: 'mongodb',
};

const SKILL_LIBRARY = {
  'system-design': {
    displayName: 'System Design',
    roadmap: [
      'Study scalability basics: caching, queues, load balancing, and database sharding.',
      'Practice designing one end-to-end product system each week and document trade-offs.',
      'Review API design, failure handling, and observability patterns with real examples.',
    ],
    atsKeywords: ['system design', 'distributed systems', 'scalability'],
  },
  kafka: {
    displayName: 'Kafka',
    roadmap: [
      'Learn event streaming basics: topics, partitions, producers, consumers, and offsets.',
      'Build a simple producer-consumer demo with retries, dead-letter handling, and idempotency.',
      'Practice designing event-driven workflows and understand ordering, replay, and backpressure.',
    ],
    atsKeywords: ['apache kafka', 'event streaming', 'consumer groups'],
  },
  nodejs: {
    displayName: 'Node.js',
    roadmap: [
      'Strengthen async JavaScript fundamentals, streams, and common backend patterns.',
      'Build REST APIs with validation, auth, and database access using Express or Fastify.',
      'Add background jobs, observability, and performance profiling to a sample service.',
    ],
    atsKeywords: ['node.js', 'express', 'backend api'],
  },
  react: {
    displayName: 'React',
    roadmap: [
      'Master component composition, state management, and async UI patterns.',
      'Build reusable UI sections with accessibility and responsive behavior in mind.',
      'Practice optimizing data-fetching flows, forms, and loading/error states.',
    ],
    atsKeywords: ['react', 'frontend', 'component architecture'],
  },
  nextjs: {
    displayName: 'Next.js',
    roadmap: [
      'Learn the app router, server/client component boundaries, and data fetching.',
      'Build an SEO-friendly app with auth, routing, and deployment-ready environment handling.',
      'Practice caching, route handlers, and rendering strategies for production use.',
    ],
    atsKeywords: ['next.js', 'app router', 'server components'],
  },
  typescript: {
    displayName: 'TypeScript',
    roadmap: [
      'Review types, unions, generics, and narrowing with hands-on exercises.',
      'Type one real API/data layer end to end to remove any and improve confidence.',
      'Adopt schema validation plus inferred types for safer contracts.',
    ],
    atsKeywords: ['typescript', 'type safety', 'interfaces'],
  },
  docker: {
    displayName: 'Docker',
    roadmap: [
      'Containerize one application with environment config and multi-stage builds.',
      'Practice local orchestration with compose and service-to-service networking.',
      'Learn image optimization, health checks, and deployment-friendly patterns.',
    ],
    atsKeywords: ['docker', 'containers', 'containerization'],
  },
  kubernetes: {
    displayName: 'Kubernetes',
    roadmap: [
      'Learn pods, deployments, services, config maps, and secrets.',
      'Deploy a sample app and trace rollout, scaling, and restart behavior.',
      'Study observability, ingress, and autoscaling basics for real systems.',
    ],
    atsKeywords: ['kubernetes', 'k8s', 'orchestration'],
  },
  postgresql: {
    displayName: 'PostgreSQL',
    roadmap: [
      'Review joins, indexing, query plans, and transaction fundamentals.',
      'Model one feature with constraints, migrations, and performance-minded queries.',
      'Practice tuning slow queries and reading execution plans.',
    ],
    atsKeywords: ['postgresql', 'sql', 'query optimization'],
  },
};

const TRAJECTORY_RULES = [
  { pattern: /(frontend|ui|react|next)/i, roles: ['Senior Frontend Engineer', 'Product Engineer', 'Engineering Lead'] },
  { pattern: /(backend|api|platform|node|java|python)/i, roles: ['Senior Backend Engineer', 'Platform Engineer', 'Engineering Lead'] },
  { pattern: /(data|ml|analytics|ai)/i, roles: ['Machine Learning Engineer', 'Applied AI Engineer', 'Data Platform Engineer'] },
  { pattern: /(full stack|fullstack)/i, roles: ['Senior Full Stack Engineer', 'Staff Product Engineer', 'Technical Lead'] },
];

const SALARY_PROGRESSION = {
  Junior: { low: 6, high: 12 },
  'Mid-level': { low: 12, high: 22 },
  Senior: { low: 22, high: 38 },
  'Lead / Manager': { low: 32, high: 55 },
  'Principal / Staff': { low: 45, high: 75 },
};

function cleanSkillLabel(value) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function canonicalizeSkill(value) {
  if (!value) return null;

  const normalized = String(value)
    .toLowerCase()
    .replace(/[^\w\s.+#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return SKILL_ALIASES[normalized] || normalized.replace(/[.+]/g, '').replace(/\s+/g, '-');
}

function normalizeSkillEntries(skills = []) {
  const deduped = new Map();

  for (const rawSkill of skills) {
    const entry = typeof rawSkill === 'string'
      ? { skillName: rawSkill, isRequired: true }
      : {
          skillName: rawSkill?.skillName || rawSkill?.skill_name || '',
          isRequired: rawSkill?.isRequired ?? rawSkill?.is_required ?? true,
        };

    const key = canonicalizeSkill(entry.skillName);
    if (!key) continue;

    const existing = deduped.get(key);
    deduped.set(key, {
      key,
      displayName: SKILL_LIBRARY[key]?.displayName || cleanSkillLabel(entry.skillName),
      isRequired: existing ? existing.isRequired || entry.isRequired : entry.isRequired,
    });
  }

  return Array.from(deduped.values());
}

function buildLearningPath(skills = [], limit = 3) {
  return normalizeSkillEntries(skills)
    .slice(0, limit)
    .map((skill) => {
      const libraryEntry = SKILL_LIBRARY[skill.key];

      return {
        skill: skill.displayName,
        focusArea: libraryEntry?.displayName || skill.displayName,
        roadmap: libraryEntry?.roadmap || [
          `Learn the core concepts behind ${skill.displayName} and how it is used in real projects.`,
          `Build one small project or feature that proves hands-on ability with ${skill.displayName}.`,
          `Add measurable evidence of ${skill.displayName} to your profile, resume, or portfolio.`,
        ],
        atsKeywords: libraryEntry?.atsKeywords || [skill.displayName.toLowerCase()],
      };
    });
}

function pickTopKeywords(description = '', skills = []) {
  const explicitSkills = normalizeSkillEntries(skills).map((skill) => skill.displayName);
  const keywords = [];
  const counts = new Map();

  for (const word of description.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) || []) {
    if (STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  const derivedWords = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word]) => cleanSkillLabel(word));

  for (const keyword of [...explicitSkills, ...derivedWords]) {
    if (!keyword || keywords.includes(keyword)) continue;
    keywords.push(keyword);
  }

  return keywords.slice(0, 8);
}

function hasPhrase(text, phrase) {
  const normalizedText = String(text || '').toLowerCase();
  const normalizedPhrase = String(phrase || '').toLowerCase().trim();
  if (!normalizedPhrase) return false;

  const pattern = normalizedPhrase
    .split(/\s+/)
    .map((part) => escapeRegExp(part))
    .join('\\s+');

  return new RegExp(`(^|[^a-z0-9+#.-])${pattern}([^a-z0-9+#.-]|$)`, 'i').test(normalizedText);
}

function classifyDescriptionLine(line) {
  const normalized = line.toLowerCase();
  if (/(responsib|you will|what you('ll| will) do|day[- ]to[- ]day|build|own|lead)/.test(normalized)) {
    return 'responsibilities';
  }
  if (/(requirement|qualification|must have|should have|experience with|looking for|need to|ideal candidate)/.test(normalized)) {
    return 'requirements';
  }
  if (/(benefit|perks|why join|offer|compensation|salary|remote|flexible|culture)/.test(normalized)) {
    return 'benefits';
  }
  return null;
}

function sentenceCase(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return '';
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

function extractDescriptionSections(description = '') {
  const sections = {
    responsibilities: [],
    requirements: [],
    benefits: [],
  };

  const lines = description
    .split(/\r?\n/)
    .map((line) => line.replace(/^[•\-*]+\s*/, '').trim())
    .filter(Boolean);

  for (const line of lines) {
    const bucket = classifyDescriptionLine(line);
    if (!bucket) continue;
    if (!sections[bucket].includes(line)) {
      sections[bucket].push(sentenceCase(line));
    }
  }

  const sentences = description
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (sections.responsibilities.length === 0) {
    sections.responsibilities = sentences.slice(0, 3).map(sentenceCase);
  }
  if (sections.requirements.length === 0) {
    sections.requirements = sentences.filter((sentence) => /experience|knowledge|skill|familiar|ability|proficient/i.test(sentence)).slice(0, 3).map(sentenceCase);
  }
  if (sections.benefits.length === 0) {
    sections.benefits = sentences.filter((sentence) => /remote|benefit|culture|growth|salary|flexible|support/i.test(sentence)).slice(0, 2).map(sentenceCase);
  }

  return {
    responsibilities: sections.responsibilities.slice(0, 4),
    requirements: sections.requirements.slice(0, 4),
    benefits: sections.benefits.slice(0, 3),
  };
}

function inferSeniority({ title = '', experienceMin = 0, experienceMax = null, description = '' }) {
  const combined = `${title} ${description}`.toLowerCase();
  if (/principal|staff/.test(combined)) return 'Principal / Staff';
  if (/lead|manager/.test(combined)) return 'Lead / Manager';
  if (/senior/.test(combined) || experienceMin >= 5) return 'Senior';
  if (/junior|associate|entry/.test(combined) || experienceMax <= 2) return 'Junior';
  return 'Mid-level';
}

function buildCareerTrajectory(title = '') {
  const match = TRAJECTORY_RULES.find((rule) => rule.pattern.test(title));
  return match ? match.roles : ['Senior Specialist', 'Tech Lead', 'Domain Expert'];
}

function estimateSalaryBand(roleLevel) {
  return SALARY_PROGRESSION[roleLevel] || SALARY_PROGRESSION['Mid-level'];
}

function analyzeJobContent({ title = '', description = '', skills = [], experienceMin = 0, experienceMax = null }) {
  return {
    seniority: inferSeniority({ title, description, experienceMin, experienceMax }),
    keywords: pickTopKeywords(description, skills),
    sections: extractDescriptionSections(description),
    nextRoleTrajectory: buildCareerTrajectory(title),
  };
}

function inferResumeExperienceYears(resumeText = '') {
  const matches = Array.from(String(resumeText || '').matchAll(/(\d{1,2})\+?\s+years?/gi));
  if (matches.length === 0) return null;
  return Math.max(...matches.map((match) => Number(match[1] || 0)).filter(Boolean));
}

function extractResumeSignals(resumeText = '', referenceSkills = [], profileSkills = []) {
  const normalizedText = String(resumeText || '').replace(/\s+/g, ' ').trim();
  const signalSkills = normalizeSkillEntries([
    ...referenceSkills,
    ...profileSkills,
    ...Object.keys(SKILL_ALIASES).map((alias) => ({ skillName: alias, isRequired: false })),
    ...Object.keys(SKILL_LIBRARY).map((key) => ({ skillName: SKILL_LIBRARY[key].displayName, isRequired: false })),
  ]);

  const detectedSkills = signalSkills.filter((skill) => {
    const aliasVariants = Object.entries(SKILL_ALIASES)
      .filter(([, canonical]) => canonical === skill.key)
      .map(([alias]) => alias);

    return [skill.displayName, ...aliasVariants].some((label) => hasPhrase(normalizedText, label));
  });

  const sentences = normalizedText.split(/(?<=[.!?])\s+/).filter(Boolean);
  const achievements = sentences
    .filter((sentence) => /\d+%|\d+\+|improv|reduc|increas|launched|scaled|built|led/i.test(sentence))
    .slice(0, 4);

  return {
    keywords: pickTopKeywords(normalizedText, detectedSkills),
    detectedSkills,
    achievements,
    inferredExperienceYears: inferResumeExperienceYears(normalizedText),
  };
}

function buildAtsTips({ resumeSignals, gapAnalysis, jobInsights }) {
  const tips = [];

  if (gapAnalysis.missingRequiredSkills.length > 0) {
    tips.push(`Add evidence for missing required skills like ${gapAnalysis.missingRequiredSkills.slice(0, 2).join(', ')} if you have relevant experience.`);
  }
  if (resumeSignals.achievements.length === 0) {
    tips.push('Add outcome-driven bullets with metrics such as latency reduced, revenue improved, or scale handled.');
  }
  if (resumeSignals.keywords.length < 6) {
    tips.push('Use more explicit job keywords in your headline, summary, and recent experience bullets.');
  }
  if ((jobInsights.keywords || []).length > 0) {
    const missingKeywords = jobInsights.keywords.filter((keyword) => !resumeSignals.keywords.includes(keyword)).slice(0, 3);
    if (missingKeywords.length > 0) {
      tips.push(`Consider adding ATS-friendly keywords like ${missingKeywords.join(', ')} where they truthfully match your experience.`);
    }
  }

  return tips.slice(0, 4);
}

function analyzeResumeAgainstJob({
  resumeText = '',
  jobTitle = '',
  jobDescription = '',
  jobSkills = [],
  userSkills = [],
  experienceMin = 0,
  experienceMax = null,
}) {
  const resumeSignals = extractResumeSignals(resumeText, jobSkills, userSkills);
  const jobInsights = analyzeJobContent({
    title: jobTitle,
    description: jobDescription,
    skills: jobSkills,
    experienceMin,
    experienceMax,
  });
  const gapAnalysis = analyzeSkillGap(resumeSignals.detectedSkills, jobSkills);

  const keywordSet = new Set(resumeSignals.keywords.map((keyword) => keyword.toLowerCase()));
  const jobKeywordMatches = (jobInsights.keywords || []).filter((keyword) => keywordSet.has(String(keyword).toLowerCase()));
  const keywordCoverage = jobInsights.keywords?.length
    ? jobKeywordMatches.length / jobInsights.keywords.length
    : 0.5;
  const achievementsScore = resumeSignals.achievements.length > 0 ? Math.min(1, 0.45 + (resumeSignals.achievements.length * 0.15)) : 0.25;
  const inferredExperienceYears = resumeSignals.inferredExperienceYears;
  const experienceCoverage = inferredExperienceYears == null
    ? 0.6
    : (inferredExperienceYears >= Number(experienceMin || 0) ? 1 : Math.max(0.35, inferredExperienceYears / Math.max(Number(experienceMin || 1), 1)));

  const skillScore = gapAnalysis.totalCoveragePercent / 100;
  const totalScore = Math.round(((skillScore * 0.55) + (keywordCoverage * 0.2) + (achievementsScore * 0.1) + (experienceCoverage * 0.15)) * 100);
  const summary = gapAnalysis.missingRequiredSkills.length === 0
    ? `Strong alignment for ${jobTitle}; your resume covers the core required skills.`
    : `You are close, but you still need clearer evidence for ${gapAnalysis.missingRequiredSkills.slice(0, 2).join(', ')}.`;
  const strengths = [
    gapAnalysis.matchedSkills.length > 0 ? `Matched skills: ${gapAnalysis.matchedSkills.slice(0, 3).join(', ')}` : null,
    resumeSignals.achievements.length > 0 ? 'Resume includes measurable achievement statements.' : null,
    inferredExperienceYears != null && inferredExperienceYears >= Number(experienceMin || 0)
      ? `Experience signals meet the role baseline (${inferredExperienceYears}+ years found).`
      : null,
  ].filter(Boolean);
  const improvementPriorities = [
    ...gapAnalysis.missingRequiredSkills.map((skill) => `Add proof of ${skill} through projects, bullets, or certifications.`),
    ...(resumeSignals.achievements.length === 0 ? ['Add quantified impact bullets to improve ATS and recruiter confidence.'] : []),
    ...((jobInsights.keywords || []).filter((keyword) => !jobKeywordMatches.includes(keyword)).slice(0, 2).map((keyword) =>
      `Use the exact keyword "${keyword}" where it truthfully matches your experience.`
    )),
  ].slice(0, 4);

  return {
    matchPercent: totalScore,
    summary,
    matchedKeywords: jobKeywordMatches,
    missingKeywords: (jobInsights.keywords || []).filter((keyword) => !jobKeywordMatches.includes(keyword)),
    matchedSkills: gapAnalysis.matchedSkills,
    missingRequiredSkills: gapAnalysis.missingRequiredSkills,
    missingOptionalSkills: gapAnalysis.missingOptionalSkills,
    missingSkills: [...gapAnalysis.missingRequiredSkills, ...gapAnalysis.missingOptionalSkills],
    requiredCoveragePercent: gapAnalysis.requiredCoveragePercent,
    scoreBreakdown: {
      skills: Math.round(skillScore * 100),
      keywords: Math.round(keywordCoverage * 100),
      achievements: Math.round(achievementsScore * 100),
      experience: Math.round(experienceCoverage * 100),
    },
    experienceSignal: {
      inferredYears: inferredExperienceYears,
      requiredMinimum: experienceMin,
      fit: inferredExperienceYears == null ? 'unclear' : (inferredExperienceYears >= Number(experienceMin || 0) ? 'meets' : 'below'),
    },
    strengths,
    improvementPriorities,
    atsOptimizationTips: buildAtsTips({ resumeSignals, gapAnalysis, jobInsights }),
    extractedKeywords: resumeSignals.keywords,
    extractedAchievements: resumeSignals.achievements,
    learningPath: buildLearningPath(gapAnalysis.missingRequiredSkills.length > 0 ? gapAnalysis.missingRequiredSkills : gapAnalysis.missingOptionalSkills),
  };
}

function predictCareerTrajectory({ headline = '', currentSkills = [], experienceYears = 0, targetRoles = [], careerGoal = '' }) {
  const anchor = `${headline} ${careerGoal} ${targetRoles.join(' ')}`.trim();
  const currentLevel = inferSeniority({
    title: anchor,
    experienceMin: experienceYears,
    experienceMax: experienceYears,
  });
  const nextRoles = Array.from(new Set([
    ...buildCareerTrajectory(anchor),
    ...targetRoles,
  ])).slice(0, 4);
  const salaryBand = estimateSalaryBand(currentLevel);

  return {
    currentLevel,
    nextRoles,
    suggestedSkillsToUnlock: buildLearningPath(currentSkills.slice(0, 3)).map((item) => item.skill),
    salaryProgressionLpa: {
      currentLevel,
      estimatedLow: salaryBand.low,
      estimatedHigh: salaryBand.high,
      currency: 'LPA',
    },
    guidance: nextRoles.length > 0
      ? `Your profile is trending toward ${nextRoles[0]}. Strengthen one leadership or architecture signal to move faster.`
      : 'Add a clearer target role and a few more skills to unlock a stronger trajectory forecast.',
  };
}

function buildReferralReason({ currentCompany, educationSchool, targetCompany }) {
  if (currentCompany && targetCompany && currentCompany.toLowerCase() === targetCompany.toLowerCase()) {
    return `Already works at ${targetCompany}.`;
  }
  if (educationSchool) {
    return `Shares the ${educationSchool} alumni network.`;
  }
  return 'Potentially relevant professional overlap.';
}

function analyzeSkillGap(userSkills = [], jobSkills = []) {
  const normalizedUserSkills = normalizeSkillEntries(userSkills);
  const normalizedJobSkills = normalizeSkillEntries(jobSkills);
  const userKeys = new Set(normalizedUserSkills.map((skill) => skill.key));

  const matchedSkills = [];
  const missingRequiredSkills = [];
  const missingOptionalSkills = [];

  for (const skill of normalizedJobSkills) {
    if (userKeys.has(skill.key)) {
      matchedSkills.push(skill.displayName);
    } else if (skill.isRequired) {
      missingRequiredSkills.push(skill.displayName);
    } else {
      missingOptionalSkills.push(skill.displayName);
    }
  }

  const requiredSkills = normalizedJobSkills.filter((skill) => skill.isRequired);
  const requiredCoveragePercent = requiredSkills.length === 0
    ? 100
    : Math.round((matchedSkills.filter((matched) =>
      requiredSkills.some((skill) => skill.displayName === matched)
    ).length / requiredSkills.length) * 100);

  const totalCoveragePercent = normalizedJobSkills.length === 0
    ? 100
    : Math.round((matchedSkills.length / normalizedJobSkills.length) * 100);

  return {
    matchedSkills,
    missingRequiredSkills,
    missingOptionalSkills,
    requiredCoveragePercent,
    totalCoveragePercent,
  };
}

function buildPrioritySignal({ matchPercent = 0, recencyScore = 0, missingRequiredCount = 0 }) {
  if (matchPercent >= 82 && recencyScore >= 0.85 && missingRequiredCount <= 1) {
    return {
      level: 'urgent',
      label: 'High match - apply within 24 hours',
      reason: 'You are a strong fit and the role is still fresh in the market.',
    };
  }

  if (matchPercent >= 68 && missingRequiredCount <= 2) {
    return {
      level: 'strong',
      label: 'Strong fit - worth a focused application',
      reason: 'You cover most of the core requirements with only a small skill gap.',
    };
  }

  return {
    level: 'grow',
    label: 'Growth match - apply after tightening your profile',
    reason: 'This role is reachable, but filling a few gaps will improve your odds.',
  };
}

module.exports = {
  normalizeSkillEntries,
  buildLearningPath,
  analyzeJobContent,
  analyzeSkillGap,
  buildPrioritySignal,
  analyzeResumeAgainstJob,
  predictCareerTrajectory,
  buildReferralReason,
};
