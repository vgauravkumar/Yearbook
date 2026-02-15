# Yearbook

Yearbook is a full-stack web application for managing profiles, memories, batches, and superlatives.

## Project Structure

- `backend/`: Node.js + Express API
- `frontend/`: React + Vite client

## Tech Stack

- Frontend: React, TypeScript, Vite
- Backend: Node.js, Express
- Database: **AWS DynamoDB**
- File Storage: **AWS S3**
- Media Access: **Pre-signed URLs** (upload and signed read URLs)

## Storage and Media Handling

The app uses Amazon S3 for media assets (profile images and memory files).

- Backend generates **pre-signed upload URLs** for clients.
- Clients upload files directly to S3 using the returned URL.
- Stored object keys are saved with app records in DynamoDB.
- Backend returns **signed read URLs** for secure media access.

## Backend Setup

1. Move to backend:

```bash
cd backend
```

2. Install dependencies:

```bash
npm install
```

3. Create `.env` with required values:

```env
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
JWT_SECRET=your-secret
JWT_EXPIRE=7d

AWS_REGION=your-region
AWS_S3_BUCKET=your-s3-bucket
DYNAMODB_TABLE=your-dynamodb-table

S3_PRESIGNED_UPLOAD_EXPIRES_SEC=120
S3_SIGNED_READ_EXPIRES_SEC=900

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

EMAIL_HOST=your-email-host
EMAIL_PORT=587
EMAIL_USER=your-email-user
EMAIL_PASS=your-email-pass
```

The backend uses the AWS SDK default credential chain.
- Local development: run with an AWS profile that can access your S3 bucket and DynamoDB table (for example `AWS_PROFILE=yearbook-dev npm run dev`).
- App Runner production: attach an instance role with least-privilege permissions for S3 and DynamoDB.

4. Start backend:

```bash
npm run dev
```

## Frontend Setup

1. Move to frontend:

```bash
cd frontend
```

2. Install dependencies:

```bash
npm install
```

3. Create `.env`:

```env
VITE_API_URL=http://localhost:3000
```

4. Start frontend:

```bash
npm run dev
```

## API and Health

- Health endpoint: `GET /health`
- API base path: `/api/v1`

## Notes

- Ensure your S3 bucket CORS allows uploads from the frontend origin.
- Keep AWS credentials and JWT secrets private.
