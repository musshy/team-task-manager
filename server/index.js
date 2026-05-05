import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import initSqlJs from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'development-only-secret';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const dbFile = path.resolve(process.cwd(), process.env.SQLITE_FILE || 'data/team_task_manager.sqlite');

fs.mkdirSync(path.dirname(dbFile), { recursive: true });

app.use(cors({ origin: process.env.CLIENT_URL || true, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

const SQL = await initSqlJs({
  locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm')
});

const database = fs.existsSync(dbFile) ? new SQL.Database(fs.readFileSync(dbFile)) : new SQL.Database();

const normalizeParams = (params) => (params.length === 1 && Array.isArray(params[0]) ? params[0] : params);

const persistDatabase = () => fs.writeFileSync(dbFile, Buffer.from(database.export()));

const db = {
  exec(sql) {
    database.exec(sql);
    persistDatabase();
  },
  run(sql, ...params) {
    database.run(sql, normalizeParams(params));
    const result = database.exec('SELECT last_insert_rowid() AS lastID, changes() AS changes')[0];
    if (!/^\s*BEGIN\b/i.test(sql)) persistDatabase();
    return {
      lastID: result?.values?.[0]?.[0] || 0,
      changes: result?.values?.[0]?.[1] || 0
    };
  },
  all(sql, ...params) {
    const stmt = database.prepare(sql);
    const rows = [];
    try {
      stmt.bind(normalizeParams(params));
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  },
  get(sql, ...params) {
    return this.all(sql, ...params)[0];
  }
};

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS project_members (
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Admin', 'Member')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    due_date TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High')),
    status TEXT NOT NULL CHECK (status IN ('To Do', 'In Progress', 'Done')),
    assigned_to INTEGER NOT NULL,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const signToken = (user) =>
  jwt.sign({ id: String(user.id), name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

const publicUser = (user) => ({ id: String(user.id), _id: String(user.id), name: user.name, email: user.email });

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const rowToProject = async (projectRow) => {
  const members = await db.all(
    `SELECT u.id, u.name, u.email, pm.role
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = ?
     ORDER BY pm.role, u.name`,
    projectRow.id
  );

  return {
    _id: String(projectRow.id),
    id: String(projectRow.id),
    name: projectRow.name,
    description: projectRow.description,
    createdBy: String(projectRow.created_by),
    createdAt: projectRow.created_at,
    updatedAt: projectRow.updated_at,
    members: members.map((member) => ({
      role: member.role,
      user: publicUser(member)
    }))
  };
};

const rowToTask = (taskRow) => ({
  _id: String(taskRow.id),
  id: String(taskRow.id),
  project: taskRow.project_name
    ? { _id: String(taskRow.project_id), id: String(taskRow.project_id), name: taskRow.project_name }
    : String(taskRow.project_id),
  title: taskRow.title,
  description: taskRow.description,
  dueDate: taskRow.due_date,
  priority: taskRow.priority,
  status: taskRow.status,
  assignedTo: {
    _id: String(taskRow.assigned_to),
    id: String(taskRow.assigned_to),
    name: taskRow.assignee_name,
    email: taskRow.assignee_email
  },
  createdBy: taskRow.creator_name
    ? {
        _id: String(taskRow.created_by),
        id: String(taskRow.created_by),
        name: taskRow.creator_name,
        email: taskRow.creator_email
      }
    : String(taskRow.created_by),
  createdAt: taskRow.created_at,
  updatedAt: taskRow.updated_at
});

const getTaskById = async (taskId) =>
  db.get(
    `SELECT t.*, au.name AS assignee_name, au.email AS assignee_email,
            cu.name AS creator_name, cu.email AS creator_email
     FROM tasks t
     JOIN users au ON au.id = t.assigned_to
     JOIN users cu ON cu.id = t.created_by
     WHERE t.id = ?`,
    taskId
  );

const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required.' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await db.get('SELECT id, name, email FROM users WHERE id = ?', payload.id);
    if (!user) return res.status(401).json({ message: 'User no longer exists.' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
});

const getProjectForUser = async (projectId, userId) => {
  const project = await db.get('SELECT * FROM projects WHERE id = ?', projectId);
  if (!project) return null;
  const membership = await db.get(
    'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
    projectId,
    userId
  );
  if (!membership) return null;
  return { project, membership };
};

const requireProjectAdmin = async (projectId, userId) => {
  const result = await getProjectForUser(projectId, userId);
  if (!result) {
    const error = new Error('Project not found.');
    error.status = 404;
    throw error;
  }
  if (result.membership.role !== 'Admin') {
    const error = new Error('Only project admins can perform this action.');
    error.status = 403;
    throw error;
  }
  return result.project;
};

const ensureProjectMember = async (projectId, userId) => {
  const member = await db.get('SELECT user_id FROM project_members WHERE project_id = ? AND user_id = ?', projectId, userId);
  return Boolean(member);
};

app.get('/api/health', (req, res) => res.json({ ok: true, database: 'sqlite' }));

app.post('/api/auth/signup', asyncHandler(async (req, res) => {
  const { name, password } = req.body;
  const email = normalizeEmail(req.body.email);
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required.' });
  if (String(password).length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' });

  const existing = await db.get('SELECT id FROM users WHERE email = ?', email);
  if (existing) return res.status(409).json({ message: 'Email is already registered.' });

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await db.run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', name.trim(), email, passwordHash);
  const user = await db.get('SELECT id, name, email FROM users WHERE id = ?', result.lastID);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE email = ?', normalizeEmail(req.body.email));
  if (!user || !(await bcrypt.compare(req.body.password || '', user.password_hash))) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}));

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

app.get('/api/users', requireAuth, asyncHandler(async (req, res) => {
  const users = await db.all('SELECT id, name, email FROM users ORDER BY name');
  res.json(users.map(publicUser));
}));

app.get('/api/projects', requireAuth, asyncHandler(async (req, res) => {
  const rows = await db.all(
    `SELECT p.*
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = ?
     ORDER BY p.updated_at DESC`,
    req.user.id
  );
  res.json(await Promise.all(rows.map(rowToProject)));
}));

app.post('/api/projects', requireAuth, asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();
  if (name.length < 2) return res.status(400).json({ message: 'Project name must be at least 2 characters.' });

  const result = await db.run(
    'INSERT INTO projects (name, description, created_by, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
    name,
    description,
    req.user.id
  );
  await db.run('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)', result.lastID, req.user.id, 'Admin');
  res.status(201).json(await rowToProject(await db.get('SELECT * FROM projects WHERE id = ?', result.lastID)));
}));

app.get('/api/projects/:projectId', requireAuth, asyncHandler(async (req, res) => {
  const result = await getProjectForUser(req.params.projectId, req.user.id);
  if (!result) return res.status(404).json({ message: 'Project not found.' });
  res.json(await rowToProject(result.project));
}));

app.post('/api/projects/:projectId/members', requireAuth, asyncHandler(async (req, res) => {
  const role = req.body.role || 'Member';
  const project = await requireProjectAdmin(req.params.projectId, req.user.id);
  const user = await db.get('SELECT id, name, email FROM users WHERE email = ?', normalizeEmail(req.body.email));
  if (!user) return res.status(404).json({ message: 'No user found with that email.' });
  if (!['Admin', 'Member'].includes(role)) return res.status(400).json({ message: 'Invalid role.' });
  if (await ensureProjectMember(project.id, user.id)) return res.status(409).json({ message: 'User is already a project member.' });

  await db.run('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)', project.id, user.id, role);
  await db.run('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', project.id);
  res.status(201).json(await rowToProject(await db.get('SELECT * FROM projects WHERE id = ?', project.id)));
}));

app.delete('/api/projects/:projectId/members/:userId', requireAuth, asyncHandler(async (req, res) => {
  const project = await requireProjectAdmin(req.params.projectId, req.user.id);
  if (String(project.created_by) === String(req.params.userId)) {
    return res.status(400).json({ message: 'The project creator cannot be removed.' });
  }

  await db.run('DELETE FROM tasks WHERE project_id = ? AND assigned_to = ?', project.id, req.params.userId);
  await db.run('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', project.id, req.params.userId);
  await db.run('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', project.id);
  res.json(await rowToProject(await db.get('SELECT * FROM projects WHERE id = ?', project.id)));
}));

app.get('/api/projects/:projectId/tasks', requireAuth, asyncHandler(async (req, res) => {
  const result = await getProjectForUser(req.params.projectId, req.user.id);
  if (!result) return res.status(404).json({ message: 'Project not found.' });

  const memberClause = result.membership.role === 'Admin' ? '' : 'AND t.assigned_to = ?';
  const params = result.membership.role === 'Admin' ? [req.params.projectId] : [req.params.projectId, req.user.id];
  const rows = await db.all(
    `SELECT t.*, au.name AS assignee_name, au.email AS assignee_email,
            cu.name AS creator_name, cu.email AS creator_email
     FROM tasks t
     JOIN users au ON au.id = t.assigned_to
     JOIN users cu ON cu.id = t.created_by
     WHERE t.project_id = ? ${memberClause}
     ORDER BY t.due_date ASC`,
    params
  );
  res.json(rows.map(rowToTask));
}));

app.post('/api/projects/:projectId/tasks', requireAuth, asyncHandler(async (req, res) => {
  const project = await requireProjectAdmin(req.params.projectId, req.user.id);
  const title = String(req.body.title || '').trim();
  const assignedTo = req.body.assignedTo;
  const dueDate = req.body.dueDate;
  const priority = req.body.priority || 'Medium';

  if (title.length < 2) return res.status(400).json({ message: 'Task title must be at least 2 characters.' });
  if (!dueDate) return res.status(400).json({ message: 'Due date is required.' });
  if (!['Low', 'Medium', 'High'].includes(priority)) return res.status(400).json({ message: 'Invalid priority.' });
  if (!(await ensureProjectMember(project.id, assignedTo))) {
    return res.status(400).json({ message: 'Task can only be assigned to a project member.' });
  }

  const result = await db.run(
    `INSERT INTO tasks (project_id, title, description, due_date, priority, status, assigned_to, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, 'To Do', ?, ?, CURRENT_TIMESTAMP)`,
    project.id,
    title,
    String(req.body.description || '').trim(),
    dueDate,
    priority,
    assignedTo,
    req.user.id
  );
  await db.run('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', project.id);
  res.status(201).json(rowToTask(await getTaskById(result.lastID)));
}));

app.patch('/api/tasks/:taskId', requireAuth, asyncHandler(async (req, res) => {
  const task = await db.get('SELECT * FROM tasks WHERE id = ?', req.params.taskId);
  if (!task) return res.status(404).json({ message: 'Task not found.' });
  const result = await getProjectForUser(task.project_id, req.user.id);
  if (!result) return res.status(404).json({ message: 'Task not found.' });

  const isAdmin = result.membership.role === 'Admin';
  const isAssignee = String(task.assigned_to) === String(req.user.id);
  if (!isAdmin && !isAssignee) return res.status(403).json({ message: 'You can only update assigned tasks.' });

  if (!isAdmin) {
    if (!['To Do', 'In Progress', 'Done'].includes(req.body.status)) {
      return res.status(400).json({ message: 'Invalid status.' });
    }
    await db.run('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', req.body.status, task.id);
    return res.json(rowToTask(await getTaskById(task.id)));
  }

  const next = {
    title: req.body.title ?? task.title,
    description: req.body.description ?? task.description,
    dueDate: req.body.dueDate ?? task.due_date,
    priority: req.body.priority ?? task.priority,
    status: req.body.status ?? task.status,
    assignedTo: req.body.assignedTo ?? task.assigned_to
  };

  if (!['Low', 'Medium', 'High'].includes(next.priority)) return res.status(400).json({ message: 'Invalid priority.' });
  if (!['To Do', 'In Progress', 'Done'].includes(next.status)) return res.status(400).json({ message: 'Invalid status.' });
  if (!(await ensureProjectMember(task.project_id, next.assignedTo))) {
    return res.status(400).json({ message: 'Task can only be assigned to a project member.' });
  }

  await db.run(
    `UPDATE tasks
     SET title = ?, description = ?, due_date = ?, priority = ?, status = ?, assigned_to = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    next.title,
    next.description,
    next.dueDate,
    next.priority,
    next.status,
    next.assignedTo,
    task.id
  );
  res.json(rowToTask(await getTaskById(task.id)));
}));

app.delete('/api/tasks/:taskId', requireAuth, asyncHandler(async (req, res) => {
  const task = await db.get('SELECT * FROM tasks WHERE id = ?', req.params.taskId);
  if (!task) return res.status(404).json({ message: 'Task not found.' });
  await requireProjectAdmin(task.project_id, req.user.id);
  await db.run('DELETE FROM tasks WHERE id = ?', task.id);
  res.status(204).end();
}));

app.get('/api/dashboard', requireAuth, asyncHandler(async (req, res) => {
  const projects = await db.all(
    `SELECT p.*, pm.role
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = ?`,
    req.user.id
  );
  const projectIds = projects.map((project) => project.id);
  if (!projectIds.length) {
    return res.json({ totalTasks: 0, byStatus: { 'To Do': 0, 'In Progress': 0, Done: 0 }, perUser: {}, overdue: 0, projectCount: 0 });
  }

  const placeholders = projectIds.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT t.*, au.name AS assignee_name, au.email AS assignee_email, p.name AS project_name
     FROM tasks t
     JOIN users au ON au.id = t.assigned_to
     JOIN projects p ON p.id = t.project_id
     WHERE t.project_id IN (${placeholders})`,
    projectIds
  );

  const adminProjects = new Set(projects.filter((project) => project.role === 'Admin').map((project) => String(project.id)));
  const visibleTasks = rows.filter(
    (task) => adminProjects.has(String(task.project_id)) || String(task.assigned_to) === String(req.user.id)
  );
  const byStatus = { 'To Do': 0, 'In Progress': 0, Done: 0 };
  const perUser = {};
  const today = new Date();
  let overdue = 0;

  for (const task of visibleTasks) {
    byStatus[task.status] += 1;
    perUser[task.assignee_name] = (perUser[task.assignee_name] || 0) + 1;
    if (task.status !== 'Done' && new Date(task.due_date) < today) overdue += 1;
  }

  res.json({ totalTasks: visibleTasks.length, byStatus, perUser, overdue, projectCount: projects.length });
}));

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ message: err.message || 'Something went wrong.' });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT} with SQLite database ${dbFile}`));
