const API_BASE = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export const api = async (path, options = {}) => {
  const token = localStorage.getItem('teamTaskToken');
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
