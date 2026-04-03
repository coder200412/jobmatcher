# ⚡ JobMatch — Scalable Event-Driven Job Matching System

A production-grade job matching platform inspired by LinkedIn/Indeed, built with event-driven microservices architecture.

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────────────────────────┐
│  Next.js (3006) │────▶│      API Gateway (3000)              │
└─────────────────┘     └────────┬──────┬──────┬──────┬───────┘
                                 │      │      │      │
     ┌──────────────────────────────────────────────────────┐
     │                    Apache Kafka                       │
     └──────────────────────────────────────────────────────┘
         │         │           │           │          │
  ┌──────┴──┐ ┌────┴───┐ ┌────┴────┐ ┌────┴───┐ ┌───┴──────┐
  │  User   │ │  Job   │ │ Reco    │ │ Notif  │ │Analytics │
  │ Service │ │Service │ │ Service │ │Service │ │ Service  │
  │ (3001)  │ │(3002)  │ │ (3003)  │ │(3004)  │ │ (3005)   │
  └────┬────┘ └───┬────┘ └───┬────┘ └────────┘ └──────────┘
       │          │           │
  ┌────┴──────────┴──────┐  ┌┴──────┐  ┌──────────────┐
  │     PostgreSQL       │  │ Redis │  │Elasticsearch │
  └──────────────────────┘  └───────┘  └──────────────┘
```

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 14, React, Vanilla CSS |
| API Gateway | Express.js, http-proxy-middleware |
| Microservices | Node.js, Express.js |
| Event Bus | Apache Kafka |
| Database | PostgreSQL 16 |
| Search | Elasticsearch 8.12 |
| Cache | Redis 7 |
| Auth | JWT (access + refresh tokens) |
| Containers | Docker Compose |

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker Desktop

### 1. Start Infrastructure
```bash
docker compose up -d
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Initialize Database Schema
```bash
npm run db:init
```

### 4. Seed Database
```bash
npm run seed
```

### 5. Start All Services
```bash
npm run dev:all
```

### 6. Access the App
- **Frontend**: http://localhost:3006
- **API Gateway**: http://localhost:3000
- **Kafka UI**: http://localhost:8080

## Email Verification Setup

The registration flow now creates a pending account, sends a verification code, and only creates the real user after the code is confirmed.

- For generic SMTP, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and optionally `SMTP_FROM`.
- For Gmail, set either `GMAIL_USER` + `GMAIL_APP_PASSWORD`, or `GMAIL_USER` + `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GMAIL_REFRESH_TOKEN`.
- If no mail transport is configured, the verification code is logged in the `user-service` console so local development can still continue.

### Demo Accounts (password: `password123`)
| Role | Email |
|------|-------|
| Candidate | alice@demo.com |
| Candidate | bob@demo.com |
| Recruiter | recruiter1@demo.com |
| Recruiter | recruiter2@demo.com |

## 🧩 Services

| Service | Port | Description |
|---------|------|-------------|
| API Gateway | 3000 | Reverse proxy, rate limiting, CORS |
| User Service | 3001 | Auth, profiles, skills |
| Job Service | 3002 | CRUD, search, applications |
| Recommendation | 3003 | TF-IDF matching, scoring |
| Notification | 3004 | Email mock, in-app notifications |
| Analytics | 3005 | Event tracking, metrics, CTR |
| Frontend | 3006 | Next.js web application |

## 🔥 Key Features

- **Full-text search** with Elasticsearch (fuzziness, highlighting)
- **TF-IDF job matching** with multi-factor scoring
- **Event-driven architecture** with Apache Kafka
- **Redis caching** for recommendations and search results
- **Rate limiting** (sliding window, Redis-backed)
- **JWT authentication** with refresh tokens
- **Role-based access** (candidate / recruiter / admin)
- **Real-time notifications** via Kafka consumers
- **Analytics pipeline** (CTR, views, conversions)
- **Premium dark UI** with glassmorphism and micro-animations
