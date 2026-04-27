const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const pool = require('../scripts/db');

const app = express();
const PORT = process.env.PORT || 4243;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'snap-ai-admin-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    domain: '.snapsupplements.org'
  }
}));

// Middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  next();
}

// Auth routes
app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    req.session.userId = user.id;
    req.session.isAdmin = user.is_admin;
    console.log(`User logged in: ${user.email}`);
    res.json({ success: true, redirect: '/dashboard' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/logout', (req, res) => {
  const userId = req.session.userId;
  req.session.destroy(() => {
    console.log(`User logged out: ${userId}`);
    res.json({ success: true, redirect: '/login' });
  });
});

// Dashboard routes
app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, slack_username, is_admin FROM users WHERE id = $1',
      [req.session.userId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/my-projects', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.subdomain FROM projects p
       JOIN user_projects up ON p.id = up.project_id
       WHERE up.user_id = $1 ORDER BY p.name`,
      [req.session.userId]
    );
    const projects = result.rows.map(p => ({
      ...p,
      url: `https://${p.subdomain}.snapsupplements.org`
    }));
    res.json(projects);
  } catch (err) {
    console.error('Error fetching projects:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin routes
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, slack_username, is_active, is_admin, created_at FROM users ORDER BY id'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { email, password, name, slack_username, is_admin } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, slack_username, is_admin)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, slack_username, is_active, is_admin, created_at`,
      [email, hash, name, slack_username || null, is_admin || false]
    );
    console.log(`User created: ${email}`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating user:', err);
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/users/:id/disable', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE users SET is_active = NOT is_active WHERE id = $1 RETURNING id, is_active',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    console.log(`User ${req.params.id} active status toggled to ${result.rows[0].is_active}`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error toggling user:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/users/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id',
      [hash, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    console.log(`Password reset for user ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error resetting password:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/projects', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM projects ORDER BY name');
    const projects = result.rows.map(p => ({
      ...p,
      url: `https://${p.subdomain}.snapsupplements.org`
    }));
    res.json(projects);
  } catch (err) {
    console.error('Error fetching projects:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/projects', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, subdomain } = req.body;
    const result = await pool.query(
      'INSERT INTO projects (name, subdomain) VALUES ($1, $2) RETURNING *',
      [name, subdomain]
    );
    console.log(`Project created: ${name} (${subdomain})`);
    res.json({ ...result.rows[0], url: `https://${subdomain}.snapsupplements.org` });
  } catch (err) {
    console.error('Error creating project:', err);
    if (err.code === '23505') return res.status(400).json({ error: 'Subdomain already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/users/:id/projects', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.subdomain FROM projects p
       JOIN user_projects up ON p.id = up.project_id
       WHERE up.user_id = $1 ORDER BY p.name`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching user projects:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/users/:id/projects', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { project_id } = req.body;
    await pool.query(
      'INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, project_id]
    );
    console.log(`Project ${project_id} assigned to user ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error assigning project:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/users/:id/projects/:project_id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM user_projects WHERE user_id = $1 AND project_id = $2',
      [req.params.id, req.params.project_id]
    );
    console.log(`Project ${req.params.project_id} removed from user ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing project assignment:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`AI Admin running on http://localhost:${PORT}`);
});
