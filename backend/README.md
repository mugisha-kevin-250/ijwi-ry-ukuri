# StudentNews Backend

A production-oriented backend for a public news platform with reader, writer, editor, and admin roles. The API supports article moderation, valid readership tracking, weekly writer rewards, and payout approval workflows.

## Features

- User authentication with JWT and bcrypt
- Role-based access control for READER, WRITER, EDITOR, ADMIN
- Public article discovery, search, categories, and writer profile APIs
- Writer application and article management workflow
- Editor moderation and publishing approvals
- Anti-fraud valid view tracking using session, IP hash, and reading duration heuristics
- Weekly reward calculation and earnings payout flow
- MongoDB-backed models with indexes
- Swagger UI documentation at /api-docs

## Installation

1. Clone the project and enter the backend folder.
2. Install dependencies:
   npm install
3. Create a .env file using .env.example.
4. Start the dev server:
   npm run dev

## MongoDB Configuration

Set MONGODB_URI to either:
- a MongoDB Atlas URI, or
- an empty value to use an in-memory MongoDB for local development.

## Environment Variables

See .env.example for required values.

## Running Development Server

npm run dev

## Running Production Server

npm start

## API Documentation

Visit http://localhost:5000/api-docs

## Testing

npm test

## Core Workflow

1. Reader registers and reads public articles without authentication.
2. User applies to become a writer.
3. Writer creates and submits articles.
4. Editor approves or rejects articles.
5. Article is published publicly.
6. Valid views are tracked per article.
7. Weekly statistics generate WriterEarning entries.
8. Admin approves payout requests when above the configured minimum.

## Postman Examples

### Register
POST /api/auth/register
{
  "fullName": "Jane Reader",
  "username": "janereader",
  "email": "jane@example.com",
  "password": "Password123!"
}

### Login
POST /api/auth/login
{
  "email": "jane@example.com",
  "password": "Password123!"
}

### Create Article
POST /api/writers/articles
Authorization: Bearer <token>
{
  "title": "Rwanda Launches New Startup Initiative",
  "summary": "A summary",
  "content": "Full article content",
  "category": "<category-id>",
  "tags": ["rwanda", "startup"]
}

### Submit Article
POST /api/writers/articles/<articleId>/submit
Authorization: Bearer <token>

### Approve Article
PUT /api/editor/articles/<articleId>/approve
Authorization: Bearer <editor-token>

### Publish Article
PUT /api/editor/articles/<articleId>/publish
Authorization: Bearer <editor-token>

### Read Public Article
GET /api/articles/<slug>

### Record Article View
POST /api/articles/<articleId>/view
{
  "anonymousSessionId": "session-123",
  "readingDurationMs": 45000
}

### View Earnings
GET /api/writers/me/earnings
Authorization: Bearer <writer-token>

### Approve Payout
PUT /api/admin/payouts/<payoutId>/approve
Authorization: Bearer <admin-token>

## Important Notes

- No raw passwords are returned in responses.
- Duplicate refreshes are prevented by the valid-view service.
- Reward calculation uses PlatformSetting values instead of hard-coded numbers.
- The system is designed to be extended to real email notifications and payout orchestration.
