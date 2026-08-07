import { useEffect, useState } from "react";

export function Card({ title, subtitle, action, children, className = "", padded = true }) {
  return (
    <section
      className={`rounded-[14px] border ${padded ? "p-6" : ""} ${className}`}
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      {(title || action) && (
        <header className={`flex items-start justify-between gap-4 ${padded ? "mb-5" : "p-6 pb-5"}`}>
          <div className="min-w-0">
            {title && (
              <h2 className="text-[13.5px] font-medium tracking-[-0.005em]" style={{ color: "var(--text-primary)" }}>
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * A single figure in the KPI strip. Deliberately unboxed — the strip supplies one
 * container and hairline dividers, so four numbers read as one object instead of
 * four competing cards.
 */
export function Stat({ label, value, hint, accent }) {
  return (
    <div className="px-6 py-5" style={{ background: "var(--surface)" }}>
      <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      {/* Large and light: size carries the emphasis, not weight. */}
      <div
        className="mt-2.5 text-[34px] font-light leading-none tracking-[-0.03em]"
        style={{ color: accent || "var(--text-primary)" }}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

/**
 * Groups Stats into one bordered strip divided by hairlines.
 *
 * The dividers are a 1px grid gap showing the container's background through it —
 * `divide-x` puts borders in the wrong place once a grid wraps to a second row.
 */
export function StatStrip({ children }) {
  return (
    <div
      className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border sm:grid-cols-2 xl:grid-cols-4"
      style={{ background: "var(--border)", borderColor: "var(--border)" }}
    >
      {children}
    </div>
  );
}

export function Button({ variant = "default", className = "", ...props }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-[10px] px-3.5 py-2 text-[13px] font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.985]";
  const styles = {
    default: {
      background: "var(--surface-raised)",
      color: "var(--text-primary)",
      border: "1px solid var(--border)",
      boxShadow: "var(--shadow-sm)",
    },
    primary: {
      background: "var(--accent)",
      color: "var(--accent-ink)",
      border: "1px solid transparent",
      boxShadow: "0 1px 3px var(--accent-wash)",
    },
    ghost: { background: "transparent", color: "var(--text-secondary)", border: "1px solid transparent" },
  };
  return <button className={`${base} ${className}`} style={{ ...styles[variant], outlineColor: "var(--accent)" }} {...props} />;
}

/** Segmented control — the filter row's primary affordance. */
export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-[11px] font-medium uppercase tracking-[0.07em]" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
      )}
      <div
        className="flex items-center gap-0.5 rounded-[11px] border p-1"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-sm)" }}
      >
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={String(o.value)}
              onClick={() => onChange(o.value)}
              aria-pressed={active}
              className="rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium transition-all duration-150"
              style={
                active
                  ? { background: "var(--accent)", color: "var(--accent-ink)", boxShadow: "0 1px 2px var(--accent-wash)" }
                  : { color: "var(--text-secondary)" }
              }
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.07em]" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const controlStyle = {
  background: "var(--surface-raised)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
  outlineColor: "var(--accent)",
};

export function Select({ label, value, onChange, options, allLabel = "All" }) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[130px] rounded-[10px] border px-2.5 py-[7px] text-[13px] transition-colors focus:outline-2 focus:outline-offset-1"
        style={controlStyle}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Input(props) {
  return (
    <input
      className="w-full rounded-[10px] border px-3 py-[7px] text-[13px] transition-colors focus:outline-2 focus:outline-offset-1"
      style={controlStyle}
      {...props}
    />
  );
}

export function Badge({ tone = "neutral", children }) {
  const tones = {
    neutral: { bg: "var(--surface-sunken)", fg: "var(--text-secondary)" },
    good: { bg: "rgba(12,163,12,0.12)", fg: "var(--good)" },
    warning: { bg: "rgba(250,178,25,0.18)", fg: "var(--warning-ink)" },
    critical: { bg: "rgba(208,59,59,0.12)", fg: "var(--critical)" },
    accent: { bg: "var(--accent-wash)", fg: "var(--accent)" },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[7px] px-2 py-[3px] text-[11px] font-medium capitalize"
      style={{ background: t.bg, color: t.fg }}
    >
      {children}
    </span>
  );
}

/** Status ships an icon plus its label, so meaning never rests on color alone. */
export function StatusBadge({ status }) {
  const map = {
    answered: ["accent", "●"],
    satisfied: ["good", "✓"],
    silent: ["warning", "○"],
    unanswered: ["neutral", "—"],
  };
  const [tone, icon] = map[status] || ["neutral", "—"];
  return (
    <Badge tone={tone}>
      <span aria-hidden="true">{icon}</span>
      {status || "unknown"}
    </Badge>
  );
}

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem("childlife.theme") || "system");

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    localStorage.setItem("childlife.theme", theme);
  }, [theme]);

  return [theme, setTheme];
}

export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-[10px] ${className}`} style={{ background: "var(--surface-sunken)" }} />;
}

export function EmptyState({ title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-14 text-center">
      <div className="text-[13.5px] font-medium" style={{ color: "var(--text-secondary)" }}>
        {title}
      </div>
      {hint && (
        <div className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}
