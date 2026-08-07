import { useState } from "react";

/* Categorical slots in fixed order. Assigned by entity, never by rank, so filtering
   the data never repaints the survivors. Kept at three — the validated all-pairs
   depth for this palette. */
export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];

export const STATUS_COLOR = {
  answered: "var(--series-1)",
  satisfied: "var(--good)",
  silent: "var(--warning)",
  unanswered: "var(--text-muted)",
};

function Empty({ label = "No data in this range" }) {
  return (
    <div className="flex h-40 items-center justify-center text-sm" style={{ color: "var(--text-muted)" }}>
      {label}
    </div>
  );
}

/**
 * Horizontal bars, one hue. Each bar is named on the left, so color carries no
 * identity and a cycled set would only add noise. The value is direct-labelled at
 * the end — also the relief the softened hues need, being under 3:1 on the light
 * surface.
 */
export function BarChart({ data, colorFor, max: maxOverride }) {
  const [hover, setHover] = useState(null);
  // Slot is taken from the position in the FULL list, not the filtered one. Dropping a
  // zero-count category must not repaint the categories that survive it.
  const rows = (data || [])
    .map((d, slot) => ({ ...d, slot }))
    .filter((d) => d.value > 0);
  if (!rows.length) return <Empty />;

  const max = maxOverride ?? Math.max(...rows.map((d) => d.value));

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const pct = max > 0 ? (row.value / max) * 100 : 0;
        const color = colorFor ? colorFor(row.label, row.slot) : "var(--bar)";
        return (
          <div
            key={row.label}
            className="group grid grid-cols-[minmax(84px,120px)_1fr_auto] items-center gap-3"
            onMouseEnter={() => setHover(row.label)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="truncate text-[13px]" style={{ color: "var(--text-secondary)" }} title={row.label}>
              {row.label}
            </div>
            {/* Track is a sunken surface; the bar is a thin mark with rounded data-end. */}
            <div className="h-[9px] w-full overflow-hidden rounded-full" style={{ background: "var(--surface-sunken)" }}>
              <div
                className="h-full rounded-full transition-[width,opacity] duration-500 ease-out"
                style={{
                  width: `${Math.max(pct, 1.5)}%`,
                  background: color,
                  opacity: hover && hover !== row.label ? 0.45 : 1,
                }}
              />
            </div>
            <div className="tnum w-10 text-right text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
              {row.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Legend — always present for two or more series, so identity is never color-alone. */
export function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
          <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Proportion bar with a 2px surface gap between adjacent fills. */
export function StackedBar({ data, total }) {
  const rows = (data || []).filter((d) => d.value > 0);
  const sum = total ?? rows.reduce((acc, d) => acc + d.value, 0);
  if (!sum) return <Empty />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full">
        {rows.map((row) => (
          <div
            key={row.label}
            className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-500"
            style={{ width: `${(row.value / sum) * 100}%`, background: STATUS_COLOR[row.label] || "var(--series-1)" }}
            title={`${row.label}: ${row.value}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {rows.map((row) => (
          <span key={row.label} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[row.label] || "var(--series-1)" }} />
            <span className="capitalize">{row.label}</span>
            <span className="tnum font-medium" style={{ color: "var(--text-primary)" }}>{row.value}</span>
            <span style={{ color: "var(--text-muted)" }}>{Math.round((row.value / sum) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}
