# Team Task Manager

A full-stack team task management web app for collaborative project work. Users can sign up, create projects, manage members, assign tasks, update task status, and review team progress from a focused dashboard.

## Features

- JWT authentication with hashed passwords
- Project creation with creator assigned as `Admin`
- Project member management by admins
- Task creation with due date, priority, assignee and status
- Role-based access control
- Dashboard with total tasks, tasks by status, tasks per user and overdue tasks
- React frontend connected to an Express REST API

## Tech Stack

- Frontend: React, Vite, CSS
- Backend: Node.js, Express
- Database: SQLite
- Auth: JWT and bcrypt
- Deployment target: Railway

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create an `.env` file using `.env.example`:

```bash
PORT=5000
JWT_SECRET=replace-with-a-long-random-secret
CLIENT_URL=http://localhost:5173
SQLITE_FILE=./data/team_task_manager.sqlite
```

3. Run the app in development:

```bash
npm run dev
```

The frontend runs on `http://localhost:5173` and the backend runs on `http://localhost:5000`.

## Railway Deployment

1. Push this repository to GitHub.
2. Create a Railway project from the GitHub repository.
3. Add a Railway Volume to the web service and mount it at `/app/data`.
4. Add these environment variables in Railway:

```bash
JWT_SECRET=your-long-production-secret
NODE_ENV=production
SQLITE_FILE=./data/team_task_manager.sqlite
```

5. Railway should use:

```bash
npm install
npm run build
npm start
```

In production, Express serves the React build from `client/dist`. The Railway Volume keeps the SQLite database file persistent across deploys.

## Demo Flow

1. Sign up as the first user.
2. Create a project.
3. Sign up as a second user in another browser or after logout.
4. Log back in as the admin and add the second user's email to the project.
5. Create and assign tasks.
6. Log in as the member and update only assigned task statuses.
7. Show dashboard totals, status counts, user task counts and overdue count.

## Main API Routes

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/projects`
- `POST /api/projects`
- `POST /api/projects/:projectId/members`
- `DELETE /api/projects/:projectId/members/:userId`
- `GET /api/projects/:projectId/tasks`
- `POST /api/projects/:projectId/tasks`
- `PATCH /api/tasks/:taskId`
- `DELETE /api/tasks/:taskId`
- `GET /api/dashboard`
