import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleHelp,
  Clock3,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Plus,
  Save,
  Search,
  Shield,
  Sparkles,
  Trash2,
  UserCircle,
  UserPlus
} from 'lucide-react';
import { api } from './api.js';

const emptyTask = {
  title: '',
  description: '',
  dueDate: '',
  priority: 'Medium',
  assignedTo: ''
};

const statuses = ['All', 'To Do', 'In Progress', 'Done'];
const TOUR_VERSION = '2026-05-05';

function App() {
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', accountRole: 'Admin' });
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('teamTaskUser');
    return stored ? JSON.parse(stored) : null;
  });
  const [activeView, setActiveView] = useState('workspace');
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [tasks, setTasks] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [projectForm, setProjectForm] = useState({ name: '', description: '' });
  const [memberForm, setMemberForm] = useState({ email: '', role: 'Member' });
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [profileForm, setProfileForm] = useState({ name: '', email: '', password: '', accountRole: 'Member' });
  const [profileMessage, setProfileMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [taskSearch, setTaskSearch] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [tourBooted, setTourBooted] = useState(false);

  const selectedProject = projects.find((project) => project._id === selectedProjectId);
  const currentMembership = selectedProject?.members.find((member) => member.user._id === user?.id);
  const isAdmin = currentMembership?.role === 'Admin';
  const projectMembers = useMemo(() => selectedProject?.members || [], [selectedProject]);

  const projectStats = useMemo(() => {
    const byStatus = { 'To Do': 0, 'In Progress': 0, Done: 0 };
    const perUser = {};
    let overdue = 0;

    for (const task of tasks) {
      byStatus[task.status] += 1;
      const assignee = task.assignedTo?.name || 'Unassigned';
      perUser[assignee] = (perUser[assignee] || 0) + 1;
      if (isOverdue(task)) overdue += 1;
    }

    const total = tasks.length;
    const done = byStatus.Done;
    const progress = total ? Math.round((done / total) * 100) : 0;
    return { byStatus, perUser, overdue, total, done, progress };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const query = taskSearch.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesStatus = statusFilter === 'All' || task.status === statusFilter;
      const text = `${task.title} ${task.description} ${task.assignedTo?.name || ''}`.toLowerCase();
      return matchesStatus && (!query || text.includes(query));
    });
  }, [tasks, statusFilter, taskSearch]);

  const tourSteps = useMemo(() => {
    const steps = [
      {
        selector: '[data-tour="brand"]',
        title: 'Your workspace home',
        body: 'This sidebar is the anchor for the whole app. It holds your profile entry point, your projects, and the quickest path back into your daily workflow.'
      },
      {
        selector: '[data-tour="profile-button"]',
        title: 'Profile settings',
        body: 'Use this button to edit your name, email, password, and account type whenever you need to update your personal details.'
      },
      {
        selector: '[data-tour="create-project"]',
        title: 'Create a project',
        body: 'Start here. Give the workspace a name and short brief, then create it. The person who creates a project becomes that project’s admin.'
      },
      {
        selector: '[data-tour="project-list"]',
        title: 'Switch between workspaces',
        body: 'Every project you belong to appears in this list. Select any project card to load its dashboard, tasks, and teammates.'
      }
    ];

    if (selectedProject) {
      steps.push(
        {
          selector: '[data-tour="task-panel"]',
          title: 'Run the task flow',
          body: isAdmin
            ? 'This board is where you create tasks, assign owners, filter work, and move everything from To Do to Done.'
            : 'This board shows the tasks assigned to you. Update each task status here so the whole team sees your latest progress.'
        },
        {
          selector: '[data-tour="people-panel"]',
          title: 'Manage the team',
          body: isAdmin
            ? 'Use the People panel to add teammates, choose whether they are members or admins, and keep responsibility clear.'
            : 'This panel shows who is on the project so you always know who else is involved in the work.'
        }
      );
    } else {
      steps.push({
        selector: '[data-tour="empty-workspace"]',
        title: 'What appears next',
        body: 'After you create a project, this main canvas becomes your task board, team panel, workload summary, and progress view.'
      });
    }

    return steps;
  }, [isAdmin, selectedProject]);

  const hasTaskFilter = taskSearch.trim().length > 0 || statusFilter !== 'All';

  const clearSession = () => {
    localStorage.removeItem('teamTaskToken');
    localStorage.removeItem('teamTaskUser');
    setUser(null);
    setProjects([]);
    setTasks([]);
    setDashboard(null);
    setSelectedProjectId('');
    setMessage('');
    setTourOpen(false);
    setTourStep(0);
    setTourBooted(false);
  };

  const handleDataError = (error) => {
    if (error.status === 401) {
      clearSession();
      return;
    }
    setMessage(error.message);
  };

  const saveSession = (payload) => {
    localStorage.setItem('teamTaskToken', payload.token);
    localStorage.setItem('teamTaskUser', JSON.stringify(payload.user));
    setUser(payload.user);
  };

  const loadProjects = async () => {
    const data = await api('/api/projects');
    setProjects(data);
    setSelectedProjectId((current) => current || data[0]?._id || '');
  };

  const loadDashboard = async () => {
    setDashboard(await api('/api/dashboard'));
  };

  const loadTasks = async (projectId) => {
    if (!projectId) {
      setTasks([]);
      return;
    }
    setTasks(await api(`/api/projects/${projectId}/tasks`));
  };

  useEffect(() => {
    if (!user) return;
    setProfileForm({ name: user.name, email: user.email, password: '', accountRole: user.accountRole || 'Member' });
    Promise.all([loadProjects(), loadDashboard()]).catch(handleDataError);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setTaskSearch('');
    setStatusFilter('All');
    loadTasks(selectedProjectId).catch(handleDataError);
  }, [selectedProjectId, user]);

  useEffect(() => {
    if (!user || activeView !== 'workspace' || tourBooted) return;
    const tourKey = `teamTaskTour:${user.id}`;

    if (localStorage.getItem(tourKey) === TOUR_VERSION) {
      setTourBooted(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setTourStep(0);
      setTourOpen(true);
      setTourBooted(true);
    }, 380);

    return () => window.clearTimeout(timer);
  }, [activeView, tourBooted, user]);

  const closeTour = (remember = true) => {
    if (remember && user) {
      localStorage.setItem(`teamTaskTour:${user.id}`, TOUR_VERSION);
    }
    setTourOpen(false);
    setTourStep(0);
  };

  const openTour = () => {
    setActiveView('workspace');
    setMessage('');
    setTourStep(0);
    setTourOpen(true);
    setTourBooted(true);
  };

  const nextTourStep = () => {
    if (tourStep >= tourSteps.length - 1) {
      closeTour();
      return;
    }
    setTourStep((current) => current + 1);
  };

  const submitAuth = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const payload = authMode === 'login' ? { email: authForm.email, password: authForm.password } : authForm;
      saveSession(await api(endpoint, { method: 'POST', body: JSON.stringify(payload) }));
      setActiveView('workspace');
      setTourBooted(false);
      setTourOpen(false);
      setTourStep(0);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const createProject = async (event) => {
    event.preventDefault();
    setMessage('');
    try {
      const project = await api('/api/projects', { method: 'POST', body: JSON.stringify(projectForm) });
      setProjects((current) => [project, ...current]);
      setSelectedProjectId(project._id);
      setActiveView('workspace');
      setProjectForm({ name: '', description: '' });
      await loadDashboard();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const addMember = async (event) => {
    event.preventDefault();
    setMessage('');
    try {
      const updated = await api(`/api/projects/${selectedProjectId}/members`, {
        method: 'POST',
        body: JSON.stringify(memberForm)
      });
      setProjects((current) => current.map((project) => (project._id === updated._id ? updated : project)));
      setMemberForm({ email: '', role: 'Member' });
    } catch (error) {
      setMessage(error.message);
    }
  };

  const removeMember = async (memberId) => {
    setMessage('');
    try {
      const updated = await api(`/api/projects/${selectedProjectId}/members/${memberId}`, { method: 'DELETE' });
      setProjects((current) => current.map((project) => (project._id === updated._id ? updated : project)));
      await loadTasks(selectedProjectId);
      await loadDashboard();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const createTask = async (event) => {
    event.preventDefault();
    setMessage('');
    try {
      const task = await api(`/api/projects/${selectedProjectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(taskForm)
      });
      setTasks((current) => [...current, task]);
      setTaskForm({ ...emptyTask, assignedTo: taskForm.assignedTo });
      await loadDashboard();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const updateTaskStatus = async (taskId, status) => {
    setMessage('');
    try {
      const updated = await api(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      setTasks((current) => current.map((task) => (task._id === updated._id ? updated : task)));
      await loadDashboard();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const deleteTask = async (taskId) => {
    setMessage('');
    try {
      await api(`/api/tasks/${taskId}`, { method: 'DELETE' });
      setTasks((current) => current.filter((task) => task._id !== taskId));
      await loadDashboard();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const updateProfile = async (event) => {
    event.preventDefault();
    setProfileMessage('');
    setMessage('');
    try {
      const payload = { ...profileForm, password: profileForm.password.trim() };
      const updated = await api('/api/profile', { method: 'PATCH', body: JSON.stringify(payload) });
      localStorage.setItem('teamTaskToken', updated.token);
      localStorage.setItem('teamTaskUser', JSON.stringify(updated.user));
      setUser(updated.user);
      setProfileForm({ name: updated.user.name, email: updated.user.email, password: '', accountRole: updated.user.accountRole });
      setProfileMessage('Profile updated successfully.');
    } catch (error) {
      setProfileMessage(error.message);
    }
  };

  const logout = () => {
    clearSession();
  };

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="auth-copy">
            <span className="mark">
              <ListChecks size={28} />
            </span>
            <p className="eyebrow">Team Task Manager</p>
            <h1>Plan the week with calm, sharp focus.</h1>
            <p className="muted">A polished workspace for project ownership, task clarity, and clean team handoffs.</p>

            <div className="auth-preview" aria-hidden="true">
              <div className="preview-line">
                <span className="preview-dot done" />
                <strong>Release checklist</strong>
                <small>78%</small>
              </div>
              <div className="preview-bars">
                <span />
                <span />
                <span />
              </div>
              <div className="preview-task">
                <CheckCircle2 size={18} />
                <span>Deploy Railway build</span>
              </div>
            </div>
          </div>

          <form onSubmit={submitAuth} className="auth-card">
            <div className="segmented" role="tablist" aria-label="Authentication mode">
              <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>
                Login
              </button>
              <button type="button" className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')}>
                Signup
              </button>
            </div>

            {authMode === 'signup' && (
              <>
                <label>
                  Name
                  <input value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} required />
                </label>
                <label>
                  Account type
                  <div className="choice-grid" role="radiogroup" aria-label="Account type">
                    <button
                      type="button"
                      className={authForm.accountRole === 'Admin' ? 'selected' : ''}
                      onClick={() => setAuthForm({ ...authForm, accountRole: 'Admin' })}
                    >
                      Admin
                    </button>
                    <button
                      type="button"
                      className={authForm.accountRole === 'Member' ? 'selected' : ''}
                      onClick={() => setAuthForm({ ...authForm, accountRole: 'Member' })}
                    >
                      User
                    </button>
                  </div>
                </label>
              </>
            )}

            <label>
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                minLength="6"
                required
              />
            </label>
            {message && <p className="alert">{message}</p>}
            <button className="primary wide" disabled={loading}>
              {loading ? 'Please wait...' : authMode === 'login' ? 'Enter workspace' : 'Create account'}
              <ChevronRight size={18} />
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand" data-tour="brand">
          <span className="brand-icon">
            <ListChecks size={24} />
          </span>
          <div>
            <strong>Team Tasks</strong>
            <span>{user.name} - {user.accountRole === 'Admin' ? 'Admin' : 'User'}</span>
          </div>
        </div>

        <button
          className={`sidebar-action ${activeView === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveView('profile')}
          data-tour="profile-button"
        >
          <UserCircle size={17} /> Profile settings
        </button>

        <button type="button" className="ghost wide tour-trigger" onClick={openTour}>
          <CircleHelp size={16} /> View walkthrough
        </button>

        <form onSubmit={createProject} className="create-project" data-tour="create-project">
          <div className="mini-title">
            <Sparkles size={16} />
            <span>New project</span>
          </div>
          <input
            placeholder="Project name"
            value={projectForm.name}
            onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })}
            required
          />
          <textarea
            placeholder="Short description"
            value={projectForm.description}
            onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })}
          />
          <button className="primary wide">
            <Plus size={16} /> Create project
          </button>
        </form>

        <nav className="project-list" aria-label="Projects" data-tour="project-list">
          {projects.map((project) => (
            <button
              key={project._id}
              className={selectedProjectId === project._id ? 'selected' : ''}
              onClick={() => {
                setSelectedProjectId(project._id);
                setActiveView('workspace');
              }}
            >
              <span>{project.name}</span>
              <small>{project.members.length} members</small>
            </button>
          ))}
          {!projects.length && <p className="quiet">No projects yet.</p>}
        </nav>

        <button className="ghost logout" onClick={logout}>
          <LogOut size={16} /> Logout
        </button>
      </aside>

      <section className="workspace">
        {activeView === 'profile' ? (
          <ProfilePage
            user={user}
            profileForm={profileForm}
            setProfileForm={setProfileForm}
            profileMessage={profileMessage}
            updateProfile={updateProfile}
          />
        ) : (
          <>
            <header className="topbar">
              <div>
                <p className="eyebrow">{isAdmin ? 'Admin workspace' : 'Member workspace'}</p>
                <h1>{selectedProject?.name || 'Create your first project'}</h1>
                <p className="muted">{selectedProject?.description || 'Your dashboard will come alive once a project is created.'}</p>
              </div>
              {currentMembership && (
                <span className="role-pill">
                  <Shield size={16} /> {currentMembership.role}
                </span>
              )}
            </header>

            {message && <p className="alert">{message}</p>}

            <section className="command-band">
              <div className="progress-block">
                <div>
                  <span>Project progress</span>
                  <strong>{projectStats.progress}%</strong>
                </div>
                <div className="progress-track" aria-label="Project progress">
                  <span style={{ width: `${projectStats.progress}%` }} />
                </div>
              </div>
              <Stat icon={<LayoutDashboard />} label="Projects" value={dashboard?.projectCount || 0} />
              <Stat icon={<ListChecks />} label="Tasks" value={dashboard?.totalTasks || 0} />
              <Stat icon={<CheckCircle2 />} label="Done" value={dashboard?.byStatus?.Done || 0} />
              <Stat icon={<AlertTriangle />} label="Overdue" value={dashboard?.overdue || 0} danger />
            </section>

            {selectedProject ? (
              <div className="content-grid">
                <section className="panel task-panel" data-tour="task-panel">
                  <div className="panel-title">
                    <div>
                      <p className="eyebrow">Task board</p>
                      <h2>{filteredTasks.length} visible tasks</h2>
                    </div>
                    <div className="status-stack">
                      <MiniStatus label="To Do" value={projectStats.byStatus['To Do']} />
                      <MiniStatus label="Doing" value={projectStats.byStatus['In Progress']} />
                      <MiniStatus label="Done" value={projectStats.byStatus.Done} />
                    </div>
                  </div>

                  <div className="toolbar">
                    <label className="search-box">
                      <Search size={17} />
                      <input
                        placeholder="Search tasks"
                        value={taskSearch}
                        onChange={(event) => setTaskSearch(event.target.value)}
                      />
                    </label>
                    <div className="filter-tabs" aria-label="Task status filter">
                      {statuses.map((status) => (
                        <button
                          key={status}
                          className={statusFilter === status ? 'active' : ''}
                          onClick={() => setStatusFilter(status)}
                          type="button"
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>

                  {isAdmin && (
                    <form onSubmit={createTask} className="task-form">
                      <input
                        placeholder="Task title"
                        value={taskForm.title}
                        onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })}
                        required
                      />
                      <input
                        type="date"
                        value={taskForm.dueDate}
                        onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })}
                        required
                      />
                      <select value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value })}>
                        <option>Low</option>
                        <option>Medium</option>
                        <option>High</option>
                      </select>
                      <select
                        value={taskForm.assignedTo}
                        onChange={(event) => setTaskForm({ ...taskForm, assignedTo: event.target.value })}
                        required
                      >
                        <option value="">Assign to</option>
                        {projectMembers.map((member) => (
                          <option key={member.user._id} value={member.user._id}>
                            {member.user.name}
                          </option>
                        ))}
                      </select>
                      <textarea
                        placeholder="Description"
                        value={taskForm.description}
                        onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })}
                      />
                      <button className="primary">
                        <Plus size={16} /> Create task
                      </button>
                    </form>
                  )}

                  <div className="task-list">
                    {filteredTasks.map((task) => (
                      <article className={`task-row ${task.status === 'Done' ? 'completed' : ''}`} key={task._id}>
                        <div className="status-rail">
                          {task.status === 'Done' ? <CheckCircle2 size={20} /> : task.status === 'In Progress' ? <Clock3 size={20} /> : <Circle size={20} />}
                        </div>
                        <div className="task-main">
                          <div className="task-heading">
                            <strong>{task.title}</strong>
                            <span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span>
                            {isOverdue(task) && <span className="overdue-pill">Overdue</span>}
                          </div>
                          <p>{task.description || 'No description'}</p>
                          <div className="task-meta">
                            <span className="avatar">{initials(task.assignedTo?.name)}</span>
                            <span>{task.assignedTo?.name}</span>
                            <span className="dot" />
                            <CalendarClock size={15} />
                            <span>{formatDate(task.dueDate)}</span>
                          </div>
                        </div>
                        <div className="task-actions">
                          <select value={task.status} onChange={(event) => updateTaskStatus(task._id, event.target.value)}>
                            <option>To Do</option>
                            <option>In Progress</option>
                            <option>Done</option>
                          </select>
                          {isAdmin && (
                            <button className="text-button danger" title="Delete task" onClick={() => deleteTask(task._id)}>
                              <Trash2 size={15} /> Delete task
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                    {!filteredTasks.length && (
                      <div className="empty-state">
                        <ListChecks size={32} />
                        <strong>{hasTaskFilter ? 'No matching tasks' : 'No tasks yet'}</strong>
                        <span>
                          {hasTaskFilter
                            ? 'Clear the search or choose another status.'
                            : isAdmin
                              ? 'Create the first task and assign it to a teammate.'
                              : 'Assigned tasks will appear here.'}
                        </span>
                      </div>
                    )}
                  </div>
                </section>

                <aside className="side-stack">
                  <section className="panel" data-tour="people-panel">
                    <div className="panel-title">
                      <div>
                        <p className="eyebrow">People</p>
                        <h2>{projectMembers.length} members</h2>
                      </div>
                    </div>

                    {isAdmin && (
                      <form onSubmit={addMember} className="member-form">
                        <input
                          type="email"
                          placeholder="User email"
                          value={memberForm.email}
                          onChange={(event) => setMemberForm({ ...memberForm, email: event.target.value })}
                          required
                        />
                        <select value={memberForm.role} onChange={(event) => setMemberForm({ ...memberForm, role: event.target.value })}>
                          <option>Member</option>
                          <option>Admin</option>
                        </select>
                        <button className="text-button add-member" title="Add member">
                          <UserPlus size={16} /> Add teammate
                        </button>
                      </form>
                    )}

                    <div className="member-list">
                      {projectMembers.map((member) => (
                        <article key={member.user._id} className="member-row">
                          <span className="avatar large">{initials(member.user.name)}</span>
                          <div>
                            <strong>{member.user.name}</strong>
                            <span>{member.user.email}</span>
                          </div>
                          <div className="row-actions">
                            <small>{member.role}</small>
                            {isAdmin && member.user._id !== selectedProject.createdBy && (
                              <button className="text-button danger" title="Remove member" onClick={() => removeMember(member.user._id)}>
                                <Trash2 size={15} /> Remove teammate
                              </button>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="panel">
                    <div className="panel-title">
                      <div>
                        <p className="eyebrow">Workload</p>
                        <h2>Tasks per user</h2>
                      </div>
                    </div>
                    <div className="workload-list">
                      {Object.entries(projectStats.perUser).map(([name, count]) => (
                        <div key={name} className="workload-row">
                          <span>{name}</span>
                          <div className="workload-track">
                            <span style={{ width: `${Math.max(12, (count / Math.max(1, projectStats.total)) * 100)}%` }} />
                          </div>
                          <strong>{count}</strong>
                        </div>
                      ))}
                      {!Object.keys(projectStats.perUser).length && <p className="quiet">No assigned work yet.</p>}
                    </div>
                  </section>
                </aside>
              </div>
            ) : (
              <section className="empty-dashboard" data-tour="empty-workspace">
                <ListChecks size={42} />
                <h2>Create a project to begin</h2>
                <p>Use the sidebar form to create the first workspace.</p>
              </section>
            )}
          </>
        )}
      </section>

      {tourOpen && (
        <GuidedTour
          steps={tourSteps}
          stepIndex={tourStep}
          onBack={() => setTourStep((current) => Math.max(0, current - 1))}
          onClose={() => closeTour()}
          onNext={nextTourStep}
        />
      )}
    </main>
  );
}

function ProfilePage({ user, profileForm, setProfileForm, profileMessage, updateProfile }) {
  return (
    <section className="profile-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Profile settings</p>
          <h1>{user.name}</h1>
          <p className="muted">Update your account details and workspace identity.</p>
        </div>
        <span className="role-pill">
          <UserCircle size={16} /> {user.accountRole === 'Admin' ? 'Admin account' : 'User account'}
        </span>
      </header>

      <form className="panel profile-card" onSubmit={updateProfile}>
        <div className="profile-avatar">{initials(profileForm.name)}</div>
        <label>
          Name
          <input value={profileForm.name} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} required />
        </label>
        <label>
          Email
          <input
            type="email"
            value={profileForm.email}
            onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })}
            required
          />
        </label>
        <label>
          Account type
          <select value={profileForm.accountRole} onChange={(event) => setProfileForm({ ...profileForm, accountRole: event.target.value })}>
            <option value="Admin">Admin</option>
            <option value="Member">User</option>
          </select>
        </label>
        <label>
          New password
          <input
            type="password"
            minLength="6"
            placeholder="Leave blank to keep current password"
            value={profileForm.password}
            onChange={(event) => setProfileForm({ ...profileForm, password: event.target.value })}
          />
        </label>
        {profileMessage && <p className={profileMessage.includes('success') ? 'success' : 'alert'}>{profileMessage}</p>}
        <button className="primary profile-submit">
          <Save size={16} /> Save profile changes
        </button>
      </form>
    </section>
  );
}

function Stat({ icon, label, value, danger }) {
  return (
    <article className={`stat ${danger ? 'danger-stat' : ''}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function MiniStatus({ label, value }) {
  return (
    <span>
      <strong>{value}</strong>
      {label}
    </span>
  );
}

function GuidedTour({ steps, stepIndex, onBack, onClose, onNext }) {
  const step = steps[stepIndex];
  const [targetRect, setTargetRect] = useState(null);

  useEffect(() => {
    if (!step) return undefined;

    const updatePosition = () => {
      const target = document.querySelector(step.selector);
      if (!target) {
        setTargetRect(null);
        return;
      }

      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });

      window.requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        setTargetRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height
        });
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [step]);

  if (!step) return null;

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label="Application walkthrough">
      <button type="button" className="tour-backdrop" aria-label="Close walkthrough" onClick={onClose} />
      {targetRect && <div className="tour-highlight" style={getTourHighlightStyle(targetRect)} aria-hidden="true" />}
      <section className="tour-card" style={getTourCardStyle(targetRect)}>
        <span className="tour-step">
          Step {stepIndex + 1} of {steps.length}
        </span>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-controls">
          <button type="button" className="ghost" onClick={onClose}>
            Skip walkthrough
          </button>
          <div className="tour-actions">
            <button type="button" className="ghost" onClick={onBack} disabled={stepIndex === 0}>
              Back
            </button>
            <button type="button" className="primary" onClick={onNext}>
              {stepIndex === steps.length - 1 ? 'Finish walkthrough' : 'Next step'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(task) {
  if (!task?.dueDate || task.status === 'Done') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(task.dueDate) < today;
}

function getTourCardStyle(targetRect) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const cardWidth = Math.min(360, viewportWidth - 32);
  const estimatedHeight = 270;
  const gutter = 16;

  if (!targetRect) {
    return {
      width: cardWidth,
      top: Math.max(gutter, (viewportHeight - estimatedHeight) / 2),
      left: Math.max(gutter, (viewportWidth - cardWidth) / 2)
    };
  }

  let left = targetRect.left + targetRect.width + 18;
  let top = targetRect.top;

  if (viewportWidth < 1100 || left + cardWidth > viewportWidth - gutter) {
    left = clamp(targetRect.left, gutter, viewportWidth - cardWidth - gutter);
    top = targetRect.top + targetRect.height + 18;
  }

  if (top + estimatedHeight > viewportHeight - gutter) {
    top = Math.max(gutter, targetRect.top - estimatedHeight - 18);
  }

  return {
    width: cardWidth,
    top: clamp(top, gutter, viewportHeight - estimatedHeight - gutter),
    left: clamp(left, gutter, viewportWidth - cardWidth - gutter)
  };
}

function getTourHighlightStyle(targetRect) {
  return {
    top: Math.max(8, targetRect.top - 10),
    left: Math.max(8, targetRect.left - 10),
    width: targetRect.width + 20,
    height: targetRect.height + 20
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default App;
