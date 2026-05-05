import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
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
import { api, clearStoredSession, readStoredToken, storeSession } from './api.js';

const emptyTask = {
  title: '',
  description: '',
  dueDate: '',
  priority: 'Medium',
  assignedTo: ''
};

const statuses = ['All', 'To Do', 'In Progress', 'Done'];
const TOUR_VERSION = '2026-05-05';
const PRODUCT_NAME = 'Project Task Manager';
const accountRoleOptions = [
  { value: 'Admin', label: 'Admin' },
  { value: 'Member', label: 'User' },
  { value: 'Both', label: 'Admin + User' }
];

function App() {
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', accountRole: 'Admin' });
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeView, setActiveView] = useState('workspace');
  const [projects, setProjects] = useState([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
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
  const [projectMessage, setProjectMessage] = useState('');
  const [memberMessage, setMemberMessage] = useState('');
  const [taskMessage, setTaskMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [workspaceMode, setWorkspaceMode] = useState('All');
  const [projectComposerOpen, setProjectComposerOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [tourBooted, setTourBooted] = useState(false);

  const availableWorkspaceModes = useMemo(() => {
    const roles = new Set(projects.map((project) => getProjectRole(project, user?.id)).filter(Boolean));
    const modes = [];

    if (roles.size > 1 || user?.accountRole === 'Both') {
      modes.push({ value: 'All', label: 'All work' });
    }
    if (roles.has('Admin') || user?.accountRole === 'Admin' || user?.accountRole === 'Both') {
      modes.push({ value: 'Admin', label: 'Admin' });
    }
    if (roles.has('Member') || user?.accountRole === 'Member' || user?.accountRole === 'Both') {
      modes.push({ value: 'Member', label: 'User' });
    }

    return modes.length ? modes : [{ value: 'All', label: 'All work' }];
  }, [projects, user]);

  const filteredProjects = useMemo(() => {
    if (workspaceMode === 'All') return projects;
    return projects.filter((project) => getProjectRole(project, user?.id) === workspaceMode);
  }, [projects, user, workspaceMode]);

  const selectedProject = filteredProjects.find((project) => project._id === selectedProjectId) || null;
  const currentMembership = selectedProject?.members.find((member) => member.user._id === user?.id);
  const isAdmin = currentMembership?.role === 'Admin';
  const projectMembers = useMemo(() => selectedProject?.members || [], [selectedProject]);
  const canSwitchWorkspaceMode = availableWorkspaceModes.length > 1;
  const isBusy = (key) => busyAction === key;
  const hasVisibleProjects = filteredProjects.length > 0;
  const showProjectComposer = projectComposerOpen || (projectsLoaded && !hasVisibleProjects);
  const workspaceHeading = selectedProject
    ? isAdmin
      ? 'Admin workspace'
      : 'Member workspace'
    : workspaceMode === 'Admin'
      ? 'Admin workspace'
      : workspaceMode === 'Member'
        ? 'User workspace'
        : 'Shared workspace';

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
          selector: '[data-tour="profile-chip"]',
          title: 'Profile settings',
          body: 'Use this button to edit your name, email, password, and account type whenever you need to update your personal details.'
        },
      ...(canSwitchWorkspaceMode
        ? [
            {
              selector: '[data-tour="workspace-switch"]',
              title: 'Switch your context',
              body: 'One login can move between admin and user contexts. Use this control to focus on admin projects, user projects, or everything together. Inside one project you only hold one role at a time, so you cannot add yourself as both roles in the same workspace.'
            }
          ]
        : []),
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
  }, [canSwitchWorkspaceMode, isAdmin, selectedProject]);

  const hasTaskFilter = taskSearch.trim().length > 0 || statusFilter !== 'All';

  const clearSession = () => {
    clearStoredSession();
    setUser(null);
    setProjects([]);
    setProjectsLoaded(false);
    setTasks([]);
    setDashboard(null);
    setSelectedProjectId('');
    setMessage('');
    setProjectMessage('');
    setMemberMessage('');
    setTaskMessage('');
    setBusyAction('');
    setWorkspaceMode('All');
    setProjectComposerOpen(false);
    setTourOpen(false);
    setTourStep(0);
    setTourBooted(false);
    setAuthReady(true);
  };

  const handleDataError = (error) => {
    if (error.status === 401) {
      clearSession();
      return;
    }
    setMessage(error.message);
  };

  const saveSession = (payload) => {
    storeSession(payload);
    setUser(payload.user);
  };

  const updateAuthField = (field, value) => {
    setMessage('');
    setAuthForm((current) => ({ ...current, [field]: value }));
  };

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      const token = readStoredToken();
      if (!token) {
        if (!cancelled) setAuthReady(true);
        return;
      }

      try {
        const data = await api('/api/auth/me');
        if (cancelled) return;
        saveSession({ token, user: data.user });
      } catch (error) {
        clearStoredSession();
        if (!cancelled) {
          setUser(null);
          setMessage(error.status === 401 ? '' : error.message);
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    };

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadProjects = async () => {
    const data = await api('/api/projects');
    setProjects(data);
    setProjectsLoaded(true);
    setSelectedProjectId((current) => current || data[0]?._id || '');
  };

  const loadDashboard = async (mode = workspaceMode) => {
    setDashboard(await api(`/api/dashboard?mode=${encodeURIComponent(mode)}`));
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
    const storedWorkspaceMode = localStorage.getItem(`teamTaskWorkspaceMode:${user.id}`);
    setWorkspaceMode(isWorkspaceMode(storedWorkspaceMode) ? storedWorkspaceMode : defaultWorkspaceMode(user.accountRole));
    loadProjects().catch(handleDataError);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    localStorage.setItem(`teamTaskWorkspaceMode:${user.id}`, workspaceMode);
  }, [user, workspaceMode]);

  useEffect(() => {
    if (!user) return;
    const nextMode = availableWorkspaceModes.some((mode) => mode.value === workspaceMode)
      ? workspaceMode
      : availableWorkspaceModes[0]?.value || 'All';

    if (nextMode !== workspaceMode) {
      setWorkspaceMode(nextMode);
      return;
    }

    loadDashboard(nextMode).catch(handleDataError);
  }, [availableWorkspaceModes, user, workspaceMode]);

  useEffect(() => {
    if (!user) return;
    setTaskSearch('');
    setStatusFilter('All');
    loadTasks(selectedProjectId).catch(handleDataError);
  }, [selectedProjectId, user]);

  useEffect(() => {
    if (!user || activeView !== 'workspace') return;

    if (!filteredProjects.length) {
      if (selectedProjectId) setSelectedProjectId('');
      return;
    }

    if (!filteredProjects.some((project) => project._id === selectedProjectId)) {
      setSelectedProjectId(filteredProjects[0]._id);
    }
  }, [activeView, filteredProjects, selectedProjectId, user]);

  useEffect(() => {
    if (activeView !== 'workspace') return;
    if (projectsLoaded && !hasVisibleProjects) {
      setProjectComposerOpen(true);
    }
  }, [activeView, hasVisibleProjects, projectsLoaded]);

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
    setProjectMessage('');
    setMemberMessage('');
    setTaskMessage('');
    setTourStep(0);
    setTourOpen(true);
    setTourBooted(true);
  };

  const openProjectComposer = () => {
    setActiveView('workspace');
    setMessage('');
    setProjectMessage('');
    setProjectComposerOpen(true);
  };

  const closeProjectComposer = () => {
    if (hasVisibleProjects) {
      setProjectComposerOpen(false);
    }
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
    setProjectMessage('');
    setBusyAction('create-project');
    try {
      const project = await api('/api/projects', { method: 'POST', body: JSON.stringify(projectForm) });
      const nextMode = workspaceMode === 'Member' ? 'Admin' : workspaceMode;
      setProjects((current) => [project, ...current]);
      setSelectedProjectId(project._id);
      setActiveView('workspace');
      setWorkspaceMode(nextMode);
      setProjectComposerOpen(false);
      setProjectForm({ name: '', description: '' });
      await loadDashboard(nextMode);
    } catch (error) {
      setProjectMessage(error.message);
    } finally {
      setBusyAction('');
    }
  };

  const addMember = async (event) => {
    event.preventDefault();
    setMemberMessage('');
    setBusyAction('add-member');
    try {
      const updated = await api(`/api/projects/${selectedProjectId}/members`, {
        method: 'POST',
        body: JSON.stringify(memberForm)
      });
      setProjects((current) => current.map((project) => (project._id === updated._id ? updated : project)));
      setMemberForm({ email: '', role: 'Member' });
    } catch (error) {
      setMemberMessage(error.message);
    } finally {
      setBusyAction('');
    }
  };

  const removeMember = async (memberId) => {
    setMemberMessage('');
    setBusyAction(`remove-member:${memberId}`);
    try {
      const updated = await api(`/api/projects/${selectedProjectId}/members/${memberId}`, { method: 'DELETE' });
      setProjects((current) => current.map((project) => (project._id === updated._id ? updated : project)));
      await loadTasks(selectedProjectId);
      await loadDashboard(workspaceMode);
    } catch (error) {
      setMemberMessage(error.message);
    } finally {
      setBusyAction('');
    }
  };

  const createTask = async (event) => {
    event.preventDefault();
    setTaskMessage('');
    setBusyAction('create-task');
    try {
      const task = await api(`/api/projects/${selectedProjectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(taskForm)
      });
      setTasks((current) => [...current, task]);
      setTaskForm({ ...emptyTask, assignedTo: taskForm.assignedTo });
      await loadDashboard(workspaceMode);
    } catch (error) {
      setTaskMessage(error.message);
    } finally {
      setBusyAction('');
    }
  };

  const updateTaskStatus = async (taskId, status) => {
    setTaskMessage('');
    setBusyAction(`status:${taskId}`);
    try {
      const updated = await api(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      setTasks((current) => current.map((task) => (task._id === updated._id ? updated : task)));
      await loadDashboard(workspaceMode);
    } catch (error) {
      setTaskMessage(error.message);
    } finally {
      setBusyAction('');
    }
  };

  const deleteTask = async (taskId) => {
    setTaskMessage('');
    setBusyAction(`delete-task:${taskId}`);
    try {
      await api(`/api/tasks/${taskId}`, { method: 'DELETE' });
      setTasks((current) => current.filter((task) => task._id !== taskId));
      await loadDashboard(workspaceMode);
    } catch (error) {
      setTaskMessage(error.message);
    } finally {
      setBusyAction('');
    }
  };

  const updateProfile = async (event) => {
    event.preventDefault();
    setProfileMessage('');
    setMessage('');
    setBusyAction('save-profile');
    try {
      const payload = { ...profileForm, password: profileForm.password.trim() };
      const updated = await api('/api/profile', { method: 'PATCH', body: JSON.stringify(payload) });
      storeSession(updated);
      setUser(updated.user);
      setProfileForm({ name: updated.user.name, email: updated.user.email, password: '', accountRole: updated.user.accountRole });
      setProfileMessage('Profile updated successfully.');
    } catch (error) {
      setProfileMessage(error.message);
    } finally {
      setBusyAction('');
    }
  };

  const logout = () => {
    clearSession();
  };

  if (!authReady) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="auth-card auth-loading-card">
            <p className="eyebrow">Checking session</p>
            <h1>Getting your workspace ready</h1>
            <p className="muted">We’re verifying your saved session with the server before showing the dashboard.</p>
          </div>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="auth-copy">
            <span className="mark">
              <ListChecks size={28} />
            </span>
            <p className="eyebrow">{PRODUCT_NAME}</p>
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
              <button
                type="button"
                className={authMode === 'login' ? 'active' : ''}
                onClick={() => {
                  setMessage('');
                  setAuthMode('login');
                }}
              >
                Login
              </button>
              <button
                type="button"
                className={authMode === 'signup' ? 'active' : ''}
                onClick={() => {
                  setMessage('');
                  setAuthMode('signup');
                }}
              >
                Signup
              </button>
            </div>

            {authMode === 'signup' && (
              <>
                <label>
                  Name
                  <input value={authForm.name} onChange={(event) => updateAuthField('name', event.target.value)} required />
                </label>
                <label>
                  Account type
                  <div className="choice-grid triple" role="radiogroup" aria-label="Account type">
                    {accountRoleOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={authForm.accountRole === option.value ? 'selected' : ''}
                        onClick={() => updateAuthField('accountRole', option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </label>
              </>
            )}

            <label>
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => updateAuthField('email', event.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => updateAuthField('password', event.target.value)}
                minLength="6"
                required
              />
            </label>
            {message && <p className="alert">{message}</p>}
            <button className={`primary wide ${loading ? 'is-loading' : ''}`} disabled={loading} aria-busy={loading}>
              {loading && <span className="button-spinner" aria-hidden="true" />}
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
            <strong>{PRODUCT_NAME}</strong>
            <span>{user.name} - {accountRoleLabel(user.accountRole)}</span>
          </div>
        </div>

        <button
          className={`sidebar-action ${activeView === 'workspace' ? 'active' : ''}`}
          onClick={() => setActiveView('workspace')}
        >
          <LayoutDashboard size={17} /> Workspace overview
        </button>

        {canSwitchWorkspaceMode && (
          <section className="mode-switch" data-tour="workspace-switch">
            <div className="mini-title">
              <Shield size={16} />
              <span>View as</span>
            </div>
            <div className="segmented compact" role="tablist" aria-label="Workspace mode">
              {availableWorkspaceModes.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={workspaceMode === mode.value ? 'active' : ''}
                  onClick={() => setWorkspaceMode(mode.value)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="project-list-header">
          <div className="mini-title">
            <Sparkles size={16} />
            <span>Projects</span>
          </div>
          <button type="button" className="ghost small-button" onClick={openProjectComposer}>
            <Plus size={15} /> New
          </button>
        </div>

        <nav className="project-list" aria-label="Projects" data-tour="project-list">
          {filteredProjects.map((project) => (
            <button
              key={project._id}
              className={selectedProjectId === project._id ? 'selected' : ''}
              onClick={() => {
                setSelectedProjectId(project._id);
                setActiveView('workspace');
                setProjectComposerOpen(false);
              }}
            >
              <span>{project.name}</span>
              <small>{project.members.length} members</small>
            </button>
          ))}
          {!filteredProjects.length && (
            <p className="quiet">
              {workspaceMode === 'All' ? 'No projects yet.' : `No ${workspaceMode === 'Admin' ? 'admin' : 'user'} projects yet.`}
            </p>
          )}
        </nav>

        <div className="sidebar-footer-links">
          <button className="ghost logout" onClick={logout}>
            <LogOut size={16} /> Logout
          </button>

          <button type="button" className="ghost wide tour-trigger tour-footer-link" onClick={openTour}>
            <CircleHelp size={16} /> View walkthrough
          </button>
        </div>
      </aside>

      <section className="workspace">
        {activeView === 'profile' ? (
          <ProfilePage
            user={user}
            profileForm={profileForm}
            setProfileForm={setProfileForm}
            profileMessage={profileMessage}
            updateProfile={updateProfile}
            saving={isBusy('save-profile')}
            workspaceMode={workspaceMode}
            openProjectComposer={openProjectComposer}
            goToWorkspace={() => setActiveView('workspace')}
          />
        ) : (
          <>
            <header className="topbar">
              <div>
                <p className="eyebrow">{workspaceHeading}</p>
                <h1>{selectedProject?.name || 'Launch the next project with clarity'}</h1>
                <p className="muted">
                  {selectedProject?.description || 'Create the project first, then assign teammates, tasks, and responsibilities from one clean workspace.'}
                </p>
              </div>
              <div className="topbar-actions">
                <UserAccessButton user={user} onClick={() => setActiveView('profile')} />
                {currentMembership && (
                  <span className="role-pill">
                    <Shield size={16} /> {currentMembership.role}
                  </span>
                )}
                <button
                  type="button"
                  className="primary"
                  onClick={openProjectComposer}
                  data-tour={showProjectComposer ? undefined : 'create-project'}
                >
                  <Plus size={16} /> New project
                </button>
              </div>
            </header>

            {showProjectComposer && (
              <ProjectComposer
                projectForm={projectForm}
                setProjectForm={setProjectForm}
                createProject={createProject}
                projectMessage={projectMessage}
                busy={isBusy('create-project')}
                onClose={closeProjectComposer}
                canClose={hasVisibleProjects}
                tourId={showProjectComposer ? 'create-project' : 'project-composer'}
              />
            )}

            {(dashboard?.projectCount || 0) > 0 && (
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
            )}

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
                        <button className={`primary ${isBusy('create-task') ? 'is-loading' : ''}`} disabled={isBusy('create-task')} aria-busy={isBusy('create-task')}>
                          {isBusy('create-task') && <span className="button-spinner" aria-hidden="true" />}
                          <Plus size={16} /> {isBusy('create-task') ? 'Creating task...' : 'Create task'}
                        </button>
                        {taskMessage && <p className="alert task-inline-message">{taskMessage}</p>}
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
                          <select
                            value={task.status}
                            onChange={(event) => updateTaskStatus(task._id, event.target.value)}
                            disabled={isBusy(`status:${task._id}`)}
                          >
                            <option>To Do</option>
                            <option>In Progress</option>
                            <option>Done</option>
                          </select>
                          {isAdmin && (
                            <button
                              className={`text-button danger ${isBusy(`delete-task:${task._id}`) ? 'is-loading' : ''}`}
                              title="Delete task"
                              onClick={() => deleteTask(task._id)}
                              disabled={isBusy(`delete-task:${task._id}`)}
                              aria-busy={isBusy(`delete-task:${task._id}`)}
                            >
                              {isBusy(`delete-task:${task._id}`) && <span className="button-spinner" aria-hidden="true" />}
                              <Trash2 size={15} /> {isBusy(`delete-task:${task._id}`) ? 'Deleting...' : 'Delete task'}
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
                          <button
                            className={`text-button add-member ${isBusy('add-member') ? 'is-loading' : ''}`}
                            title="Add member"
                          disabled={isBusy('add-member')}
                          aria-busy={isBusy('add-member')}
                          >
                            {isBusy('add-member') && <span className="button-spinner" aria-hidden="true" />}
                            <UserPlus size={16} /> {isBusy('add-member') ? 'Adding teammate...' : 'Add teammate'}
                          </button>
                          {memberMessage && <p className="alert member-inline-message">{memberMessage}</p>}
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
                              <button
                                className={`text-button danger ${isBusy(`remove-member:${member.user._id}`) ? 'is-loading' : ''}`}
                                title="Remove member"
                                onClick={() => removeMember(member.user._id)}
                                disabled={isBusy(`remove-member:${member.user._id}`)}
                                aria-busy={isBusy(`remove-member:${member.user._id}`)}
                              >
                                {isBusy(`remove-member:${member.user._id}`) && <span className="button-spinner" aria-hidden="true" />}
                                <Trash2 size={15} /> {isBusy(`remove-member:${member.user._id}`) ? 'Removing...' : 'Remove teammate'}
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
                <h2>Start with the project, then the rest follows</h2>
                <p>Create a project in the main canvas to unlock tasks, teammates, workload, and progress tracking.</p>
              </section>
            )}

            <div className="mobile-utility-actions">
              <button type="button" className="ghost wide tour-trigger" onClick={openTour}>
                <CircleHelp size={16} /> View walkthrough
              </button>
              <button className="ghost wide" onClick={logout}>
                <LogOut size={16} /> Logout
              </button>
            </div>
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

function ProfilePage({ user, profileForm, setProfileForm, profileMessage, updateProfile, saving, workspaceMode, openProjectComposer, goToWorkspace }) {
  return (
    <section className="profile-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Profile settings</p>
          <h1>Your account hub</h1>
          <p className="muted">Keep your account details current and jump back into work with the right context.</p>
        </div>
        <div className="topbar-actions">
          <button type="button" className="ghost" onClick={goToWorkspace}>
            <ArrowLeft size={16} /> Back to workspace
          </button>
          <UserAccessButton user={user} active />
          <span className="role-pill">
            <UserCircle size={16} /> {accountRoleLabel(user.accountRole)} account
          </span>
          <button type="button" className="ghost" onClick={openProjectComposer}>
            <Plus size={16} /> New project
          </button>
        </div>
      </header>

      <div className="profile-grid">
        <section className="panel profile-summary">
          <div className="profile-avatar">{initials(profileForm.name)}</div>
          <div className="profile-summary-copy">
            <h2>{profileForm.name}</h2>
            <p>{profileForm.email}</p>
          </div>
          <div className="profile-summary-meta">
            <div>
              <span className="eyebrow">Account access</span>
              <strong>{accountRoleLabel(profileForm.accountRole)}</strong>
              <p>Choose whether this login is used for admin work, user work, or both.</p>
            </div>
            <div>
              <span className="eyebrow">Current view</span>
              <strong>{workspaceMode === 'All' ? 'All work' : workspaceMode === 'Admin' ? 'Admin view' : 'User view'}</strong>
              <p>Use the workspace toggle to move between the contexts that matter right now.</p>
            </div>
          </div>
        </section>

        <form className="panel profile-form" onSubmit={updateProfile}>
          <div className="profile-form-header">
            <div>
              <p className="eyebrow">Edit details</p>
              <h2>Update your information</h2>
            </div>
          </div>
          <div className="profile-form-grid">
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
                <option value="Both">Admin + User</option>
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
          </div>
          {profileMessage && <p className={profileMessage.includes('success') ? 'success' : 'alert'}>{profileMessage}</p>}
          <button className={`primary profile-submit ${saving ? 'is-loading' : ''}`} disabled={saving} aria-busy={saving}>
            {saving && <span className="button-spinner" aria-hidden="true" />}
            <Save size={16} /> {saving ? 'Saving profile...' : 'Save profile changes'}
          </button>
        </form>
      </div>
    </section>
  );
}

function UserAccessButton({ user, active = false, onClick }) {
  const content = (
    <>
      <span className="user-chip-avatar">{initials(user.name)}</span>
      <span className="user-chip-copy">
        <strong>{user.name}</strong>
        <small>Profile settings</small>
      </span>
    </>
  );

  if (active) {
    return (
      <div className="user-chip active" data-tour="profile-chip" aria-current="page">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="user-chip"
      onClick={onClick}
      data-tour="profile-chip"
    >
      {content}
    </button>
  );
}

function ProjectComposer({ projectForm, setProjectForm, createProject, projectMessage, busy, onClose, canClose, tourId }) {
  return (
    <section className="panel composer-panel" data-tour={tourId}>
      <div className="composer-copy">
        <div>
          <p className="eyebrow">New project</p>
          <h2>Make project creation the first move</h2>
        </div>
        <p>
          Start with the workspace name and a short brief. Once the project exists, you can add teammates, assign tasks, and track delivery from one place.
        </p>
      </div>

      <form className="composer-form" onSubmit={createProject}>
        <label>
          Project name
          <input
            placeholder="Website launch"
            value={projectForm.name}
            onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })}
            required
          />
        </label>
        <label>
          Short description
          <textarea
            placeholder="What is this project trying to ship?"
            value={projectForm.description}
            onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })}
          />
        </label>
        <div className="composer-actions">
          {canClose && (
            <button type="button" className="ghost" onClick={onClose}>
              Keep current workspace
            </button>
          )}
          <button className={`primary ${busy ? 'is-loading' : ''}`} disabled={busy} aria-busy={busy}>
            {busy && <span className="button-spinner" aria-hidden="true" />}
            <Plus size={16} /> {busy ? 'Creating project...' : 'Create project'}
          </button>
        </div>
        {projectMessage && <p className="alert composer-inline-message">{projectMessage}</p>}
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

function getProjectRole(project, userId) {
  return project?.members?.find((member) => member.user._id === userId)?.role || null;
}

function defaultWorkspaceMode(accountRole) {
  if (accountRole === 'Admin') return 'Admin';
  if (accountRole === 'Member') return 'Member';
  return 'All';
}

function isWorkspaceMode(value) {
  return value === 'All' || value === 'Admin' || value === 'Member';
}

function accountRoleLabel(accountRole) {
  if (accountRole === 'Admin') return 'Admin';
  if (accountRole === 'Both') return 'Admin + User';
  return 'User';
}

export default App;
