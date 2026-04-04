function stripTrailingSlash(value) {
  return (value || '').replace(/\/+$/, '');
}

function normalizeApiBase(value) {
  const trimmed = stripTrailingSlash(value);

  if (!trimmed) {
    return '/api';
  }

  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

const API_BASE = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL);

const AUTH_PATHS_WITHOUT_REFRESH = [
  '/auth/login',
  '/auth/register',
  '/auth/google',
  '/auth/verify-email',
  '/auth/resend-code',
  '/auth/refresh',
];

class ApiClient {
  constructor() {
    this.baseUrl = API_BASE;
  }

  getToken() {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('accessToken');
  }

  setTokens(accessToken, refreshToken) {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  clearTokens() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  }

  shouldAttemptRefresh(path, options = {}) {
    if (options.skipAuthRefresh) return false;
    if (!this.getToken()) return false;
    return !AUTH_PATHS_WITHOUT_REFRESH.some((authPath) => path.startsWith(authPath));
  }

  async parseResponse(response) {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      return response.json();
    }

    const text = await response.text();
    return text ? { error: text } : {};
  }

  async request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Try to refresh token on 401
      if (response.status === 401 && !options._retried && this.shouldAttemptRefresh(path, options)) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          return this.request(path, { ...options, _retried: true });
        }
        this.clearTokens();
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
        throw new Error('Session expired');
      }

      const data = await this.parseResponse(response);

      if (!response.ok) {
        throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (err) {
      if (err.message === 'Session expired') throw err;
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Unable to connect to server. Please check if services are running.');
      }
      throw err;
    }
  }

  async refreshToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      this.setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    }
  }

  // Auth
  async register(data) {
    const result = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    // If email verification is required, don't set tokens yet
    if (result.requiresVerification) {
      return result;
    }
    this.setTokens(result.accessToken, result.refreshToken);
    localStorage.setItem('user', JSON.stringify(result.user));
    return result;
  }

  async verifyEmail(email, token) {
    const result = await this.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, token }),
    });
    this.setTokens(result.accessToken, result.refreshToken);
    localStorage.setItem('user', JSON.stringify(result.user));
    return result;
  }

  async resendCode(email) {
    return this.request('/auth/resend-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async login(data) {
    const result = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setTokens(result.accessToken, result.refreshToken);
    localStorage.setItem('user', JSON.stringify(result.user));
    return result;
  }

  async googleAuth(data) {
    const result = await this.request('/auth/google', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setTokens(result.accessToken, result.refreshToken);
    localStorage.setItem('user', JSON.stringify(result.user));
    return result;
  }

  async googleRegister(data) {
    return this.request('/auth/google/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  logout() {
    this.clearTokens();
  }

  // Users
  getProfile() { return this.request('/users/me'); }
  updateProfile(data) { return this.request('/users/me', { method: 'PUT', body: JSON.stringify(data) }); }
  updateSkills(skills) { return this.request('/users/me/skills', { method: 'PUT', body: JSON.stringify({ skills }) }); }
  analyzeResume(data) { return this.request('/users/me/resume-analysis', { method: 'POST', body: JSON.stringify(data) }); }
  getCareerTrajectory() { return this.request('/users/me/career-trajectory'); }
  getUser(id) { return this.request(`/users/${id}`); }

  // Jobs
  searchJobs(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/jobs?${qs}`);
  }
  getJob(id) { return this.request(`/jobs/${id}`); }
  reportJob(id, data) { return this.request(`/jobs/${id}/report`, { method: 'POST', body: JSON.stringify(data) }); }
  createJob(data) { return this.request('/jobs', { method: 'POST', body: JSON.stringify(data) }); }
  updateJob(id, data) { return this.request(`/jobs/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  deleteJob(id) { return this.request(`/jobs/${id}`, { method: 'DELETE' }); }
  getMyJobs() { return this.request('/jobs/recruiter/mine'); }

  // Applications
  applyToJob(jobId, data = {}) { return this.request(`/jobs/${jobId}/apply`, { method: 'POST', body: JSON.stringify(data) }); }
  getMyApplications() { return this.request('/applications/me'); }
  getJobApplications(jobId) { return this.request(`/jobs/${jobId}/applications`); }
  updateApplicationStatus(appId, status, note = '') {
    return this.request(`/applications/${appId}/status`, { method: 'PUT', body: JSON.stringify({ status, note }) });
  }

  // Recommendations
  getJobRecommendations(limit = 20) { return this.request(`/recommendations/jobs?limit=${limit}`); }
  getJobMatchAnalysis(jobId) { return this.request(`/recommendations/jobs/${jobId}/analysis`); }
  getCandidateRecommendations(jobId, limit = 20) { return this.request(`/recommendations/candidates/${jobId}?limit=${limit}`); }
  submitRecommendationFeedback(jobId, action) { return this.request('/recommendations/feedback', { method: 'POST', body: JSON.stringify({ jobId, action }) }); }
  getReferralMatches(jobId, limit = 5) { return this.request(`/recommendations/referrals/${jobId}?limit=${limit}`); }
  getCareerInsights() { return this.request('/recommendations/career-path'); }
  getRecommendationExperimentSummary() { return this.request('/recommendations/experiments/summary'); }

  // Notifications
  getNotifications(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/notifications?${qs}`);
  }
  markNotificationRead(id) { return this.request(`/notifications/${id}/read`, { method: 'PUT' }); }
  markAllNotificationsRead() { return this.request('/notifications/read-all', { method: 'PUT' }); }

  // Analytics
  getPlatformOverview() { return this.request('/analytics/platform-overview', { skipAuthRefresh: true }); }
  getJobAnalytics(jobId) { return this.request(`/analytics/jobs/${jobId}`); }
  getRecruiterDashboard() { return this.request('/analytics/recruiter/dashboard'); }
  getRecruiterTrustScore(recruiterId) { return this.request(`/analytics/recruiters/${recruiterId}/trust-score`, { skipAuthRefresh: true }); }
  getTrends(days = 30) { return this.request(`/analytics/trends?days=${days}`); }
}

const api = new ApiClient();
export default api;
