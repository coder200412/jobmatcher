const { Client } = require('@elastic/elasticsearch');

const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
});

let isConnected = false;

const JOBS_INDEX = 'jobs';

async function initElasticsearch() {
  try {
    await esClient.ping();
    isConnected = true;

    // Create jobs index with mappings
    const exists = await esClient.indices.exists({ index: JOBS_INDEX });
    if (!exists) {
      await esClient.indices.create({
        index: JOBS_INDEX,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            analysis: {
              analyzer: {
                job_analyzer: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'stop', 'snowball'],
                },
              },
            },
          },
          mappings: {
            properties: {
              title: { type: 'text', analyzer: 'job_analyzer' },
              company: { type: 'text', analyzer: 'job_analyzer' },
              description: { type: 'text', analyzer: 'job_analyzer' },
              location: { type: 'text', analyzer: 'job_analyzer', fields: { keyword: { type: 'keyword' } } },
              skills: { type: 'keyword' },
              work_type: { type: 'keyword' },
              salary_min: { type: 'integer' },
              salary_max: { type: 'integer' },
              experience_min: { type: 'integer' },
              experience_max: { type: 'integer' },
              status: { type: 'keyword' },
              recruiter_id: { type: 'keyword' },
              views_count: { type: 'integer' },
              applications_count: { type: 'integer' },
              created_at: { type: 'date' },
              updated_at: { type: 'date' },
            },
          },
        },
      });
      console.log('✅ Elasticsearch jobs index created');
    }
  } catch (err) {
    console.warn('⚠️  Elasticsearch not available, search will fallback to PostgreSQL:', err.message);
    isConnected = false;
  }
}

/**
 * Index a job document in Elasticsearch
 */
async function indexJob(job) {
  if (!isConnected) return;
  try {
    await esClient.index({
      index: JOBS_INDEX,
      id: job.id,
      body: {
        title: job.title,
        company: job.company,
        description: job.description,
        location: job.location,
        skills: job.skills || [],
        work_type: job.work_type,
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        experience_min: job.experience_min,
        experience_max: job.experience_max,
        status: job.status,
        recruiter_id: job.recruiter_id,
        views_count: job.views_count || 0,
        applications_count: job.applications_count || 0,
        created_at: job.created_at,
        updated_at: job.updated_at || new Date().toISOString(),
      },
    });
    await esClient.indices.refresh({ index: JOBS_INDEX });
  } catch (err) {
    console.error('[ES] Failed to index job:', err.message);
  }
}

/**
 * Search jobs using Elasticsearch full-text search with filters
 */
async function searchJobs({ q, location, workType, salaryMin, salaryMax, experienceMin, experienceMax, skills, page = 1, limit = 20 }) {
  if (!isConnected) return null; // Fallback to PG

  const must = [];
  const filter = [];

  // Full-text search
  if (q) {
    must.push({
      multi_match: {
        query: q,
        fields: ['title^3', 'description^1', 'company^2', 'skills^2'],
        type: 'best_fields',
        fuzziness: 'AUTO',
      },
    });
  }

  // Location filter
  if (location) {
    must.push({ match: { location: { query: location, fuzziness: 'AUTO' } } });
  }

  // Work type filter
  if (workType) {
    filter.push({ term: { work_type: workType } });
  }

  // Salary range
  if (salaryMin) {
    filter.push({ range: { salary_max: { gte: parseInt(salaryMin) } } });
  }
  if (salaryMax) {
    filter.push({ range: { salary_min: { lte: parseInt(salaryMax) } } });
  }

  // Experience range
  if (experienceMin !== undefined) {
    filter.push({ range: { experience_max: { gte: parseInt(experienceMin) } } });
  }
  if (experienceMax !== undefined) {
    filter.push({ range: { experience_min: { lte: parseInt(experienceMax) } } });
  }

  // Skills filter
  if (skills && skills.length > 0) {
    filter.push({ terms: { skills: Array.isArray(skills) ? skills : [skills] } });
  }

  // Always filter for active jobs
  filter.push({ term: { status: 'active' } });

  try {
    const result = await esClient.search({
      index: JOBS_INDEX,
      body: {
        from: (page - 1) * limit,
        size: limit,
        query: {
          bool: {
            must: must.length > 0 ? must : [{ match_all: {} }],
            filter,
          },
        },
        sort: [
          { _score: 'desc' },
          { created_at: 'desc' },
        ],
        highlight: {
          fields: {
            title: {},
            description: { fragment_size: 150, number_of_fragments: 2 },
          },
        },
      },
    });

    return {
      jobs: result.hits.hits.map(hit => ({
        id: hit._id,
        score: hit._score,
        highlight: hit.highlight,
        ...hit._source,
      })),
      total: typeof result.hits.total === 'object' ? result.hits.total.value : result.hits.total,
      page,
      limit,
    };
  } catch (err) {
    console.error('[ES] Search failed:', err.message);
    return null;
  }
}

/**
 * Remove a job from the index
 */
async function removeJob(jobId) {
  if (!isConnected) return;
  try {
    await esClient.delete({ index: JOBS_INDEX, id: jobId });
  } catch (err) {
    console.error('[ES] Failed to remove job:', err.message);
  }
}

module.exports = { esClient, initElasticsearch, indexJob, searchJobs, removeJob, isConnected: () => isConnected };
