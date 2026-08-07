import { useState } from "react";

/* Inline icons — no icon package, so the bundle stays small and the strokes match
   the type weight exactly. currentColor lets each one inherit its nav item's ink. */
const Icon = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="8" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="11" width="7" height="10" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  calls: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h2.2a1 1 0 0 1 .95.68l1 3a1 1 0 0 1-.3 1.1L8 10a12 12 0 0 0 6 6l1.22-1.35a1 1 0 0 1 1.1-.3l3 1a1 1 0 0 1 .68.95v2.2A1.5 1.5 0 0 1 18.5 20 15.5 15.5 0 0 1 4 5.5Z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  auto: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
    </>
  ),
  signout: (
    <>
      <path d="M15 17l5-5-5-5" />
      <path d="M20 12H9" />
      <path d="M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6" />
    </>
  ),
};

function Glyph({ name, size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {Icon[name]}
    </svg>
  );
}

const NAV = [
  { id: "overview", label: "Overview", icon: "overview", hint: "Trends and breakdowns" },
  { id: "calls", label: "Call records", icon: "calls", hint: "Every call, searchable" },
];

export default function Sidebar({ tab, onTab, user, theme, onTheme, onSignOut }) {
  const [open, setOpen] = useState(false);

  const themeCycle = { system: "light", light: "dark", dark: "system" };
  const themeGlyph = { system: "auto", light: "sun", dark: "moon" };
  const themeLabel = { system: "System theme", light: "Light theme", dark: "Dark theme" };

  const body = (
    <>
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-7">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-[11px] text-[13px] font-medium tracking-tight"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
        >
          CL
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium leading-tight tracking-[-0.01em]">
            ChildLife
          </div>
          <div className="truncate text-[11px] leading-tight" style={{ color: "var(--text-muted)" }}>
            Feedback reporting
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-3">
        <div
          className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.09em]"
          style={{ color: "var(--text-muted)" }}
        >
          Reports
        </div>
        {NAV.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                onTab(item.id);
                setOpen(false);
              }}
              aria-current={active ? "page" : undefined}
              className="group relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-all duration-150"
              style={{
                background: active ? "var(--accent-wash)" : "transparent",
                color: active ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              {/* Active rail — a second, non-color cue alongside the wash. */}
              <span
                className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-all duration-200"
                style={{ background: active ? "var(--accent)" : "transparent" }}
              />
              <Glyph name={item.icon} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] leading-tight">{item.label}</span>
                <span className="block truncate text-[11px] leading-tight" style={{ color: "var(--text-muted)" }}>
                  {item.hint}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* Footer: theme + identity + sign out */}
      <div className="px-3 pb-4">
        <button
          onClick={() => onTheme(themeCycle[theme])}
          title={themeLabel[theme]}
          aria-label={themeLabel[theme]}
          className="mb-2 flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-colors"
          style={{ color: "var(--text-secondary)" }}
        >
          <Glyph name={themeGlyph[theme]} size={17} />
          <span className="capitalize">{theme}</span>
        </button>

        <div
          className="rounded-[12px] border p-3"
          style={{ background: "var(--surface-sunken)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-medium"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              {(user?.name || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-medium leading-tight">{user?.name}</div>
              <div className="truncate text-[11px] capitalize leading-tight" style={{ color: "var(--text-muted)" }}>
                {user?.role}
              </div>
            </div>
            <button
              onClick={onSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="rounded-lg p-1.5 transition-colors hover:brightness-95"
              style={{ color: "var(--text-muted)" }}
            >
              <Glyph name="signout" size={16} />
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile trigger */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="fixed left-4 top-4 z-40 rounded-lg border p-2 lg:hidden"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-md)" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Sticky rail: pinned for the whole scroll, full viewport height. */}
      <aside
        className="sticky top-0 hidden h-screen w-[250px] shrink-0 flex-col border-r lg:flex"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {body}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" style={{ background: "rgba(11,11,11,0.4)" }} onClick={() => setOpen(false)}>
          <aside
            className="animate-in flex h-full w-[250px] flex-col border-r"
            style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {body}
          </aside>
        </div>
      )}
    </>
  );
}
