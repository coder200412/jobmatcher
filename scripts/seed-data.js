require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'jobmatch',
  user: process.env.POSTGRES_USER || 'jobmatch',
  password: process.env.POSTGRES_PASSWORD || 'jobmatch_secret_2024',
});

const CANDIDATES = [
  { email: 'alice@demo.com', firstName: 'Alice', lastName: 'Johnson', headline: 'Senior Full-Stack Developer', location: 'San Francisco, CA', experienceYears: 7, skills: [['React', 'expert'], ['Node.js', 'expert'], ['TypeScript', 'expert'], ['PostgreSQL', 'intermediate'], ['Docker', 'intermediate'], ['AWS', 'intermediate']] },
  { email: 'bob@demo.com', firstName: 'Bob', lastName: 'Smith', headline: 'ML Engineer & Data Scientist', location: 'New York, NY', experienceYears: 5, skills: [['Python', 'expert'], ['Machine Learning', 'expert'], ['Deep Learning', 'intermediate'], ['Data Science', 'expert'], ['PostgreSQL', 'intermediate'], ['Docker', 'beginner']] },
  { email: 'carol@demo.com', firstName: 'Carol', lastName: 'Williams', headline: 'DevOps & Cloud Engineer', location: 'Seattle, WA', experienceYears: 6, skills: [['Docker', 'expert'], ['Kubernetes', 'expert'], ['AWS', 'expert'], ['Terraform', 'expert'], ['Linux', 'expert'], ['CI/CD', 'expert'], ['Python', 'intermediate']] },
  { email: 'david@demo.com', firstName: 'David', lastName: 'Brown', headline: 'Junior Frontend Developer', location: 'Austin, TX', experienceYears: 1, skills: [['JavaScript', 'intermediate'], ['React', 'beginner'], ['HTML', 'intermediate'], ['CSS', 'intermediate'], ['Git', 'beginner']] },
  { email: 'eve@demo.com', firstName: 'Eve', lastName: 'Davis', headline: 'Backend Java Engineer', location: 'Chicago, IL', experienceYears: 8, skills: [['Java', 'expert'], ['Spring Boot', 'expert'], ['PostgreSQL', 'expert'], ['Microservices', 'expert'], ['Docker', 'intermediate'], ['REST API', 'expert']] },
];

const RECRUITERS = [
  { email: 'recruiter1@demo.com', firstName: 'Sarah', lastName: 'Tech', headline: 'Tech Recruiter at Google', location: 'Mountain View, CA' },
  { email: 'recruiter2@demo.com', firstName: 'Mike', lastName: 'Hire', headline: 'Senior Recruiter at Netflix', location: 'Los Gatos, CA' },
];

const JOBS = [
  { title: 'Senior React Developer', company: 'Google', description: 'We are looking for a Senior React Developer to join our Cloud Platform team. You will build next-generation web applications used by millions of developers worldwide. The ideal candidate has deep experience with React, TypeScript, and modern frontend tooling. You will work closely with UX designers, product managers, and backend engineers to deliver exceptional user experiences.\n\nResponsibilities:\n- Build and maintain complex React applications\n- Write clean, typed code with TypeScript\n- Collaborate with cross-functional teams\n- Mentor junior developers\n- Contribute to our design system', location: 'Mountain View, CA', workType: 'hybrid', salaryMin: 180000, salaryMax: 250000, experienceMin: 5, experienceMax: 10, skills: [['React', true], ['TypeScript', true], ['Node.js', false], ['CSS', true], ['Git', true]] },
  { title: 'Machine Learning Engineer', company: 'Netflix', description: 'Join Netflix\'s recommendation team to build ML models that power personalized content recommendations for 200M+ subscribers. You will design, train, and deploy production ML systems at scale.\n\nResponsibilities:\n- Design and implement ML models for recommendation systems\n- Work with large-scale data pipelines\n- A/B test model performance\n- Collaborate with product and engineering teams\n- Stay current with latest ML research', location: 'Los Gatos, CA', workType: 'hybrid', salaryMin: 200000, salaryMax: 300000, experienceMin: 3, experienceMax: 8, skills: [['Python', true], ['Machine Learning', true], ['Deep Learning', true], ['Data Science', false]] },
  { title: 'DevOps Engineer', company: 'Amazon', description: 'Amazon Web Services is hiring a DevOps Engineer to help build and maintain our cloud infrastructure. You will work on CI/CD pipelines, container orchestration, and infrastructure as code.\n\nResponsibilities:\n- Design and maintain CI/CD pipelines\n- Manage Kubernetes clusters\n- Implement infrastructure as code with Terraform\n- Monitor and optimize system performance\n- Respond to production incidents', location: 'Seattle, WA', workType: 'onsite', salaryMin: 160000, salaryMax: 220000, experienceMin: 4, experienceMax: 10, skills: [['Docker', true], ['Kubernetes', true], ['AWS', true], ['Terraform', true], ['CI/CD', true], ['Linux', true]] },
  { title: 'Junior Full-Stack Developer', company: 'Stripe', description: 'Stripe is looking for a Junior Full-Stack Developer to join our payments team. This is a great opportunity for someone starting their career in tech. You will learn from experienced engineers and contribute to products used by millions of businesses.\n\nResponsibilities:\n- Develop features for our payment platform\n- Write tests and documentation\n- Participate in code reviews\n- Learn and grow with mentorship from senior engineers', location: 'San Francisco, CA', workType: 'remote', salaryMin: 100000, salaryMax: 140000, experienceMin: 0, experienceMax: 2, skills: [['JavaScript', true], ['React', false], ['HTML', true], ['CSS', true], ['Git', true]] },
  { title: 'Senior Backend Engineer (Java)', company: 'Microsoft', description: 'Microsoft Azure team is hiring a Senior Backend Engineer specializing in Java. You will build distributed systems powering our cloud services.\n\nResponsibilities:\n- Design and implement microservices using Spring Boot\n- Build scalable distributed systems\n- Optimize database performance\n- Design REST APIs\n- Lead technical design discussions', location: 'Redmond, WA', workType: 'hybrid', salaryMin: 175000, salaryMax: 240000, experienceMin: 6, experienceMax: 12, skills: [['Java', true], ['Spring Boot', true], ['Microservices', true], ['PostgreSQL', true], ['Docker', false], ['REST API', true]] },
  { title: 'Full-Stack TypeScript Developer', company: 'Vercel', description: 'Vercel is looking for a Full-Stack TypeScript Developer to work on Next.js and related developer tools. You will help shape the future of web development.\n\nResponsibilities:\n- Build features for Next.js and Vercel platform\n- Contribute to open-source projects\n- Write documentation and blog posts\n- Engage with the developer community', location: 'Remote', workType: 'remote', salaryMin: 150000, salaryMax: 210000, experienceMin: 3, experienceMax: 8, skills: [['TypeScript', true], ['React', true], ['Node.js', true], ['Next.js', true], ['CSS', false]] },
  { title: 'Data Scientist', company: 'Meta', description: 'Meta is hiring a Data Scientist to work on our ads ranking team. You will analyze large datasets, build predictive models, and drive product decisions with data.\n\nResponsibilities:\n- Analyze large-scale datasets\n- Build predictive models\n- Run A/B experiments\n- Present findings to stakeholders\n- Collaborate with engineers to deploy models', location: 'Menlo Park, CA', workType: 'hybrid', salaryMin: 170000, salaryMax: 250000, experienceMin: 3, experienceMax: 7, skills: [['Python', true], ['Data Science', true], ['Machine Learning', true], ['PostgreSQL', false], ['NLP', false]] },
  { title: 'Cloud Platform Engineer', company: 'Snowflake', description: 'Snowflake is looking for a Cloud Platform Engineer to help scale our data platform. You will work on infrastructure automation, monitoring, and reliability.\n\nResponsibilities:\n- Build and maintain cloud infrastructure\n- Implement monitoring and alerting\n- Automate operational tasks\n- Optimize resource utilization\n- Participate in on-call rotation', location: 'San Mateo, CA', workType: 'hybrid', salaryMin: 165000, salaryMax: 230000, experienceMin: 4, experienceMax: 9, skills: [['AWS', true], ['Docker', true], ['Kubernetes', true], ['Terraform', false], ['Linux', true], ['Python', false]] },
];

async function seed() {
  const client = await pool.connect();
  
  try {
    console.log('🌱 Seeding database...\n');
    
    const passwordHash = await bcrypt.hash('password123', 12);
    const userIds = {};

    // Seed candidates
    for (const c of CANDIDATES) {
      const result = await client.query(
        `INSERT INTO user_service.users (email, password_hash, role, first_name, last_name, headline, location, experience_years)
         VALUES ($1, $2, 'candidate', $3, $4, $5, $6, $7)
         ON CONFLICT (email) DO UPDATE SET first_name = $3
         RETURNING id`,
        [c.email, passwordHash, c.firstName, c.lastName, c.headline, c.location, c.experienceYears]
      );
      userIds[c.email] = result.rows[0].id;
      
      for (const [skill, prof] of c.skills) {
        await client.query(
          `INSERT INTO user_service.user_skills (user_id, skill_name, proficiency)
           VALUES ($1, $2, $3) ON CONFLICT (user_id, skill_name) DO NOTHING`,
          [userIds[c.email], skill, prof]
        );
      }
      console.log(`  ✅ Candidate: ${c.firstName} ${c.lastName} (${c.email})`);
    }

    // Seed recruiters
    for (const r of RECRUITERS) {
      const result = await client.query(
        `INSERT INTO user_service.users (email, password_hash, role, first_name, last_name, headline, location)
         VALUES ($1, $2, 'recruiter', $3, $4, $5, $6)
         ON CONFLICT (email) DO UPDATE SET first_name = $3
         RETURNING id`,
        [r.email, passwordHash, r.firstName, r.lastName, r.headline, r.location]
      );
      userIds[r.email] = result.rows[0].id;
      console.log(`  ✅ Recruiter: ${r.firstName} ${r.lastName} (${r.email})`);
    }

    // Seed jobs
    const recruiterEmails = ['recruiter1@demo.com', 'recruiter2@demo.com'];
    for (let i = 0; i < JOBS.length; i++) {
      const j = JOBS[i];
      const recruiterId = userIds[recruiterEmails[i % recruiterEmails.length]];
      
      const result = await client.query(
        `INSERT INTO job_service.jobs (recruiter_id, title, company, description, location, work_type, salary_min, salary_max, experience_min, experience_max, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
         RETURNING id`,
        [recruiterId, j.title, j.company, j.description, j.location, j.workType, j.salaryMin, j.salaryMax, j.experienceMin, j.experienceMax]
      );
      
      for (const [skill, required] of j.skills) {
        await client.query(
          `INSERT INTO job_service.job_skills (job_id, skill_name, is_required)
           VALUES ($1, $2, $3) ON CONFLICT (job_id, skill_name) DO NOTHING`,
          [result.rows[0].id, skill, required]
        );
      }
      console.log(`  ✅ Job: ${j.title} at ${j.company}`);
    }

    console.log('\n🎉 Seeding complete!');
    console.log('\n📋 Login credentials (all users): password123');
    console.log('   Candidates: alice@demo.com, bob@demo.com, carol@demo.com, david@demo.com, eve@demo.com');
    console.log('   Recruiters: recruiter1@demo.com, recruiter2@demo.com');
  } catch (err) {
    console.error('❌ Seeding failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
