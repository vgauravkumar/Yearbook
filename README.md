# Yearbook

Yearbook is a full-stack web application for managing student profiles, batches, memories, and superlatives.

## Services Used (AWS)

- Frontend hosting: **AWS Amplify Hosting**
- Backend API hosting: **AWS App Runner**
- Database: **Amazon DynamoDB**
- File/media storage: **Amazon S3**
- Auth for backend to AWS services: **IAM Role (App Runner instance role)**
- Runtime/application logs: **Amazon CloudWatch Logs**

## Architecture Overview

- The React frontend (Amplify) calls the Node.js API (App Runner).
- The backend reads/writes app data in DynamoDB.
- The backend creates pre-signed S3 URLs.
- The frontend uploads media directly to S3 using pre-signed URLs.
- The backend returns signed read URLs for secure media access.

## Repository Structure

- `/frontend`: React + Vite + TypeScript client
- `/backend`: Node.js + Express API

## Security Model

- Backend is deployed with a public HTTPS App Runner endpoint.
- CORS allows only the configured frontend origin (`FRONTEND_URL`) for browser JS calls.
- Backend uses JWT for authenticated routes.
- Backend runs with IAM role-based access in production (no static AWS keys in app config).
- Least-privilege IAM policy should allow only required S3 prefixes and DynamoDB table actions.

Important: CORS is a browser policy, not a firewall. Public endpoints can still be called by tools like curl/Postman unless protected by auth/rate limits.

## Backend Configuration

Create `/backend/.env`:

```env
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

JWT_SECRET=your-secret
JWT_EXPIRE=7d

AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket
DYNAMODB_TABLE=your-table

S3_PRESIGNED_UPLOAD_EXPIRES_SEC=120
S3_SIGNED_READ_EXPIRES_SEC=900

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

AUTH_RATE_LIMIT_WINDOW_MS=60000
AUTH_LOGIN_MAX_REQUESTS=10
AUTH_REGISTER_MAX_REQUESTS=5
AUTH_VERIFY_MAX_REQUESTS=10

EMAIL_HOST=your-email-host
EMAIL_PORT=587
EMAIL_USER=your-email-user
EMAIL_PASS=your-email-pass
```

### Credentials (Local vs Production)

- Local development: use AWS CLI profile credentials/assume-role (AWS SDK default credential chain).
- App Runner production: attach an instance role with least-privilege permissions.

## Frontend Configuration

Create `/frontend/.env`:

```env
VITE_API_URL=http://localhost:3000
```

For production (Amplify), set environment variable:

- `VITE_API_URL=https://<your-app-runner-default-domain>`

## Run Locally

### Backend

```bash
cd backend
npm install
AWS_PROFILE=yearbook-dev npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Deployment

## 1) Deploy Backend to App Runner

- Source type: GitHub repository
- Source directory: `backend`
- Runtime: Node.js
- Build command: `npm ci`
- Start command: `npm start`
- Port: `3000`
- Size: `0.25 vCPU`, `0.5 GB` (lowest baseline)
- Auto deploy: **Off** (manual deploy flow)
- Health check: HTTP `/health`
- Instance role: attach your App Runner runtime IAM role

Set App Runner environment variables from backend `.env` equivalents.

## 2) Deploy Frontend to Amplify Hosting

- Source type: GitHub repository
- App root: `frontend`
- Build command: `npm ci && npm run build`
- Artifact directory: `dist`
- Auto deploy: optional (off if you want manual-only deploys)
- Environment variable: `VITE_API_URL=https://<app-runner-domain>`

### SPA Rewrite Rule

Use this rewrite for client-side routing:

```json
[
  {
    "source": "/<*>",
    "target": "/index.html",
    "status": "200"
  }
]
```

## 3) Final Wiring

- Update backend `FRONTEND_URL` to your Amplify default domain.
- Redeploy App Runner.
- Validate:
  - `GET /health`
  - Register/Login flow
  - Media upload and read flow

## API Basics

- Health: `GET /health`
- Base API path: `/api/v1`
- Auth routes: `/api/v1/auth/*`

## Cost Notes (High Level)

- App Runner has always-on baseline memory cost plus active compute when handling traffic.
- Amplify costs depend on build minutes, hosting storage, and data transfer.
- CloudWatch Logs can add cost if log volume/retention is high.

## Operational Tips

- Keep App Runner max instances capped to avoid runaway cost.
- Keep auth-specific rate limits enabled for login/register/verification.
- Add CAPTCHA/OTP hardening on public auth endpoints.
- Set AWS Budgets alerts for monthly guardrails.
