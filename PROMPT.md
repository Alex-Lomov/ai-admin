# AI Admin — Build Brief

Central authentication and user management hub for Snap Supplements AI projects.

## Stack
- Node.js, CommonJS
- Express + express-session
- bcrypt for password hashing
- pg (Postgres) connected to Supabase
- Vanilla HTML/CSS/JS frontend (no framework)
- Port: 4243

## Database
DATABASE_URL=postgresql://postgres:sQ7Cq0MHcSgUcIVy@db.wjipyjidqlelqcamhhlu.supabase.co:5432/postgres

## DB Schema (scripts/setup-db.js — CREATE IF NOT EXISTS)

```sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  slack_username TEXT,
  is_active BOOLEAN DEFAULT true,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_projects (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, project_id)
);
```

After creating tables, seed one default admin user:
- email: admin@snapsupplements.com
- password: Admin1234! (bcrypt hashed)
- name: Admin
- is_admin: true

## Project Structure
```
/
├── package.json
├── .env.example
├── scripts/
│   ├── db.js          (shared pg pool, same pattern as other projects)
│   └── setup-db.js    (create tables + seed admin)
└── web/
    ├── server.js      (Express app, port 4243)
    └── public/
        ├── login.html
        ├── dashboard.html
        └── admin.html
```

## Routes (server.js)

### Auth
- GET  /              → redirect to /dashboard if logged in, else /login
- GET  /login         → serve login.html
- POST /login         → authenticate (email+password, bcrypt compare), set session, redirect to /dashboard
- POST /logout        → destroy session, redirect /login

### User Dashboard (requires login)
- GET  /dashboard     → serve dashboard.html
- GET  /api/me        → return { id, name, email, slack_username, is_admin }
- GET  /api/my-projects → return projects assigned to current user [{ id, name, subdomain, url }]
  - url = `https://${subdomain}.snapsupplements.org`

### Admin (requires is_admin=true)
- GET  /admin         → serve admin.html
- GET  /api/admin/users           → list all users
- POST /api/admin/users           → create user { email, password, name, slack_username, is_admin }
- POST /api/admin/users/:id/disable   → toggle is_active
- POST /api/admin/users/:id/reset-password → set new password { password }
- GET  /api/admin/projects        → list all projects
- POST /api/admin/projects        → create project { name, subdomain }
- GET  /api/admin/users/:id/projects  → get projects assigned to user
- POST /api/admin/users/:id/projects  → assign project { project_id }
- DELETE /api/admin/users/:id/projects/:project_id → remove assignment

## Frontend

### login.html
- Clean centered card, dark theme
- Email + password fields
- "Sign in" button
- Error message on failed login
- Branding: "Snap AI" top of card

### dashboard.html
- Top nav: "Snap AI" logo left, user name + logout right
- Grid of project cards (name + link to URL)
- If no projects assigned: friendly empty state "No projects assigned yet"
- Fetch /api/me and /api/my-projects on load

### admin.html
- Same nav as dashboard + "Admin" badge
- Tabs: Users | Projects
- **Users tab:**
  - Table: Name, Email, Slack, Role, Status, Actions
  - Actions: Disable/Enable toggle, Reset Password (modal with new password input)
  - "Add User" button → modal with form (name, email, password, slack_username, is_admin checkbox)
- **Projects tab:**
  - Table: Name, Subdomain, URL
  - "Add Project" button → modal (name, subdomain)
  - Each user row in Users tab should have a "Manage Access" button → inline or modal showing checkboxes for all projects

## Style
- Dark theme (#0f0f0f background, #1a1a1a cards, #ffffff text)
- Accent: #6366f1 (indigo)
- Clean, minimal, professional
- No external CSS frameworks — pure CSS

## Rules
- CommonJS throughout
- Graceful error handling on all routes
- Middleware: requireAuth (session check), requireAdmin (is_admin check)
- Passwords never returned in API responses
- Console.log key actions

## .env.example
```
DATABASE_URL=postgresql://postgres:PASSWORD@db.HOST.supabase.co:5432/postgres
SESSION_SECRET=change-me
PORT=4243
```

When ALL files are complete and setup-db.js verified working, run:
openclaw system event --text "Done: AI Admin built — auth, user management, project assignment, admin UI" --mode now
