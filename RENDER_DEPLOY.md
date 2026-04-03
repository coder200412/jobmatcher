# Render Deployment

Deploy each service as a separate Render web service.

## Required services

- Frontend
- API Gateway
- User Service
- Job Service
- Recommendation Service
- Notification Service
- Analytics Service
- PostgreSQL

Redis is optional. Kafka is optional and should stay disabled unless you deploy it separately.

## Common backend environment variables

Set these on every backend service:

```env
DATABASE_URL=<your-render-postgres-connection-string>
KAFKA_ENABLED=false
KAFKA_BROKERS=
JWT_SECRET=<same-shared-secret>
JWT_REFRESH_SECRET=<same-shared-refresh-secret>
```

## API Gateway

Start command:

```bash
npm run start:gateway
```

Environment variables:

```env
FRONTEND_URL=https://your-frontend.onrender.com
PUBLIC_FRONTEND_URL=https://your-frontend.onrender.com
USER_SERVICE_URL=https://your-user-service.onrender.com
JOB_SERVICE_URL=https://your-job-service.onrender.com
RECOMMENDATION_SERVICE_URL=https://your-recommendation-service.onrender.com
NOTIFICATION_SERVICE_URL=https://your-notification-service.onrender.com
ANALYTICS_SERVICE_URL=https://your-analytics-service.onrender.com
REDIS_URL=<optional-render-redis-url>
```

## Frontend

Build command:

```bash
npm install && npm run build:frontend
```

Start command:

```bash
npm run start:frontend
```

Environment variables:

```env
NEXT_PUBLIC_API_URL=https://your-api-gateway.onrender.com
PUBLIC_API_URL=https://your-api-gateway.onrender.com
PUBLIC_FRONTEND_URL=https://your-frontend.onrender.com
FRONTEND_URL=https://your-frontend.onrender.com
```

`NEXT_PUBLIC_API_URL` can be set either with or without `/api`. The frontend normalizes both forms.

## User Service

Start command:

```bash
npm run start:users
```

Environment variables:

```env
PUBLIC_API_URL=https://your-api-gateway.onrender.com
PUBLIC_FRONTEND_URL=https://your-frontend.onrender.com
FRONTEND_URL=https://your-frontend.onrender.com
GMAIL_USER=<your-sender-email>
GMAIL_APP_PASSWORD=<your-app-password>
```

## Job Service

Start command:

```bash
npm run start:jobs
```

`ELASTICSEARCH_URL` is optional. The service falls back to PostgreSQL if it is not provided.

## Recommendation Service

Start command:

```bash
npm run start:recommendations
```

`REDIS_URL` is optional. The service works without it.

## Notification Service

Start command:

```bash
npm run start:notifications
```

## Analytics Service

Start command:

```bash
npm run start:analytics
```
