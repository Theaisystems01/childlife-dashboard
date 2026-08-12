const TOKEN_KEY = "childlife.token";

/**
 * Empty by default, which keeps every call relative ("/api/...") — the right thing
 * both in dev (Vite proxies) and on Vercel (vercel.json rewrites), because the
 * browser then sees one origin and CORS never applies.
 *
 * Set VITE_API_BASE_URL only to point straight at the backend instead. That is
 * cross-origin, so the deploying origin must also be added to CORS_ORIGINS in
 * backend/.env. Vite inlines this at BUILD time, so changing it needs a redeploy.
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

const url = (path) => `${API_BASE}${path}`;

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
  const res = await fetch(url(path), {
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
  const res = await fetch(url("/api/auth/login"), { method: "POST", body });
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
  patients: (params) => json(`/api/patients?${new URLSearchParams(clean(params))}`),
  queue: (params) => json(`/api/patients/queue?${new URLSearchParams(clean(params))}`),
  batches: () => json("/api/patients/batches"),

  uploadPatients: async (file) => {
    const body = new FormData();
    body.append("file", file);
    const res = await request("/api/patients/upload", { method: "POST", body });
    return res.json();
  },

  downloadTemplate: () => downloadFrom("/api/patients/template", "patient-upload-template.xlsx"),

  exportUrl: (params) => `/api/export/xlsx?${new URLSearchParams(clean(params))}`,
  download: (params) =>
    downloadFrom(api.exportUrl(params), `childlife-feedback-${new Date().toISOString().slice(0, 10)}.xlsx`),
};

/** Fetches through request() so the auth header is attached, then saves the blob. */
async function downloadFrom(path, filename) {
  const res = await request(path);
  const blobUrl = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

function clean(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== "" && v !== null && v !== undefined),
  );
}
