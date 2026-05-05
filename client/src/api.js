const API_BASE = import.meta.env.VITE_API_URL || '';
const AUTH_TOKEN_KEY = 'teamTaskToken';
const AUTH_USER_KEY = 'teamTaskUser';

const getStorages = () => {
  if (typeof window === 'undefined') return [];
  return [window.sessionStorage, window.localStorage];
};

export const readStoredToken = () => {
  for (const storage of getStorages()) {
    const token = storage.getItem(AUTH_TOKEN_KEY);
    if (token) return token;
  }
  return '';
};

export const readStoredUser = () => {
  for (const storage of getStorages()) {
    const raw = storage.getItem(AUTH_USER_KEY);
    if (!raw) continue;
    try {
      return JSON.parse(raw);
    } catch {
      storage.removeItem(AUTH_USER_KEY);
    }
  }
  return null;
};

export const storeSession = (payload) => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(AUTH_TOKEN_KEY, payload.token);
  window.sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(payload.user));
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_USER_KEY);
};

export const clearStoredSession = () => {
  for (const storage of getStorages()) {
    storage.removeItem(AUTH_TOKEN_KEY);
    storage.removeItem(AUTH_USER_KEY);
  }
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export const api = async (path, options = {}) => {
  const token = readStoredToken();
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
  } catch {
    throw new ApiError('Backend is offline. Please start the server and try again.', 0);
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.message || 'Request failed.', response.status);
  return data;
};
