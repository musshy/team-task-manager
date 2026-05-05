const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:5000';
const password = 'password123';
const stamp = Date.now();
const adminEmail = `smoke-admin-${stamp}@example.com`;
const memberEmail = `smoke-member-${stamp}@example.com`;

const request = async (path, { method = 'GET', token, body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message || `${method} ${path} failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
};

const main = async () => {
  const admin = await request('/api/auth/signup', {
    method: 'POST',
    body: { name: 'Smoke Admin', email: adminEmail, password, accountRole: 'Both' }
  });

  const member = await request('/api/auth/signup', {
    method: 'POST',
    body: { name: 'Smoke Member', email: memberEmail, password, accountRole: 'Member' }
  });

  const project = await request('/api/projects', {
    method: 'POST',
    token: admin.token,
    body: {
      name: `Smoke Project ${stamp}`,
      description: 'Automated submission-readiness verification.'
    }
  });

  const updatedProject = await request(`/api/projects/${project._id}/members`, {
    method: 'POST',
    token: admin.token,
    body: { email: memberEmail, role: 'Member' }
  });

  const memberId = updatedProject.members.find((entry) => entry.user.email === memberEmail)?.user._id;
  if (!memberId) throw new Error('Member signup succeeded but the member was not added to the project.');

  await request(`/api/projects/${project._id}/tasks`, {
    method: 'POST',
    token: admin.token,
    body: {
      title: 'Smoke-test task',
      description: 'Verify the member update flow.',
      dueDate: '2026-05-20',
      priority: 'High',
      assignedTo: memberId
    }
  });

  const memberTasks = await request(`/api/projects/${project._id}/tasks`, {
    token: member.token
  });

  const firstTaskId = memberTasks[0]?._id;
  if (!firstTaskId) throw new Error('Member could not see the assigned task.');

  await request(`/api/tasks/${firstTaskId}`, {
    method: 'PATCH',
    token: member.token,
    body: { status: 'Done' }
  });

  const dashboard = await request('/api/dashboard?mode=All', {
    token: admin.token
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        projectId: project._id,
        usersCreated: [adminEmail, memberEmail],
        dashboard
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
