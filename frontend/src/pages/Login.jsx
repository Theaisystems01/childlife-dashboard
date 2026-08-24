import { useState } from "react";
import { login } from "../lib/api";
import { Button } from "../components/ui";

export default function Login({ onSignedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSignedIn(await login(username, password));
    } catch (err) {
      setError(err.message || "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6" style={{ background: "var(--page)" }}>
      <div className="animate-in w-full max-w-[380px]">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-lg font-medium"
            style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            CL
          </div>
          <h1 className="text-xl font-medium tracking-tight">ChildLife Foundation</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Patient feedback reporting
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-xl border p-6"
          style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-md)" }}
        >
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                autoFocus
                className="rounded-lg border px-3 py-2 text-sm focus:outline-2 focus:outline-offset-1"
                style={{ background: "var(--surface-raised)", borderColor: "var(--border)", color: "var(--text-primary)", outlineColor: "var(--accent)" }}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="rounded-lg border px-3 py-2 text-sm focus:outline-2 focus:outline-offset-1"
                style={{ background: "var(--surface-raised)", borderColor: "var(--border)", color: "var(--text-primary)", outlineColor: "var(--accent)" }}
              />
            </label>

            {error && (
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]"
                style={{ background: "rgba(208,59,59,0.10)", color: "var(--critical)" }}
                role="alert"
              >
                <span aria-hidden="true">⚠</span>
                {error}
              </div>
            )}

            <Button variant="primary" type="submit" disabled={busy} className="mt-1 w-full py-2.5">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </div>
        </form>

        <p className="mt-5 text-center text-xs" style={{ color: "var(--text-muted)" }}>
          This dashboard contains patient records. Do not share your credentials.
        </p>

        <div className="mt-8 flex flex-col items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.09em]" style={{ color: "var(--text-muted)" }}>
            Powered by
          </span>
          <a href="https://theaisystem.com" target="_blank" rel="noreferrer">
            <img src="/aisystems-logo.png" alt="AI Systems" className="h-5 w-auto opacity-85" />
          </a>
        </div>
      </div>
    </div>
  );
}
