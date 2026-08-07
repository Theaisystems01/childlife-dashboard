const TOKEN_KEY = "childlife.token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 401) {
    // Expired or revoked — drop the token so the router bounces to /login rather
    // than leaving the UI in a half-authenticated state.
    setToken(null);
    throw new ApiError("Session expired", 401);
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail, res.status);
  }
  return res;
}

export async function login(username, password) {
  const body = new URLSearchParams({ username, password });
  const res = await fetch("/api/auth/login", { method: "POST", body });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new ApiError(detail?.detail || "Sign in failed", res.status);
  }
  const data = await res.json();
  setToken(data.access_token);
  return data.user;
}

export function logout() {
  setToken(null);
}

const json = (path) => request(path).then((r) => r.json());

export const api = {
  me: () => json("/api/auth/me"),
  overview: (params) => json(`/api/stats/overview?${new URLSearchParams(clean(params))}`),
  calls: (params) => json(`/api/calls?${new URLSearchParams(clean(params))}`),
  call: (id) => json(`/api/calls/${encodeURIComponent(id)}`),
  filters: () => json("/api/calls/filters"),
  exportUrl: (params) => `/api/export/xlsx?${new URLSearchParams(clean(params))}`,
  download: async (params) => {
    const res = await request(api.exportUrl(params));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `childlife-feedback-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

function clean(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== "" && v !== null && v !== undefined),
  );
}
