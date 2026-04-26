const pool = require('./db');
const bcrypt = require('bcrypt');

async function setup() {
  const client = await pool.connect();
  try {
    await client.query(`
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
    `);
    console.log('Created users table');

    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        subdomain TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('Created projects table');

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_projects (
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, project_id)
      );
    `);
    console.log('Created user_projects table');

    const existing = await client.query('SELECT id FROM users WHERE email = $1', ['admin@snapsupplements.com']);
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash('Admin1234!', 10);
      await client.query(
        'INSERT INTO users (email, password_hash, name, is_admin) VALUES ($1, $2, $3, $4)',
        ['admin@snapsupplements.com', hash, 'Admin', true]
      );
      console.log('Seeded default admin user');
    } else {
      console.log('Admin user already exists');
    }

    console.log('Database setup complete');
  } finally {
    client.release();
    await pool.end();
  }
}

setup().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
