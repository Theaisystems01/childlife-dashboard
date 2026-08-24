import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { BarChart, StackedBar } from "../components/charts";
import { Card, Segmented, Skeleton, Stat, StatStrip } from "../components/ui";

const RANGES = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "All", value: null },
];


/* One card, three columns. Three separate cards for category / subcategory / area
   read as three unrelated things; they are one breakdown of the same complaint. */
const BREAKDOWNS = [
  { key: "categories", title: "Category", hint: "What went wrong" },
  { key: "subcategories", title: "Sub category", hint: "Who it was about" },
  { key: "areas", title: "Area", hint: "Where it happened" },
];

export default function Overview({ filters }) {
  const [days, setDays] = useState(null);
  const [er, setEr] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    api
      .overview({ days, er })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [days, er]);

  if (error) {
    return (
      <Card>
        <p className="text-[13px]" style={{ color: "var(--critical)" }}>
          Could not load statistics: {error}
        </p>
      </Card>
    );
  }

  const kpis = data?.kpis;

  return (
    <div className="flex flex-col gap-6">
      {/* One filter row, above everything. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented options={RANGES} value={days} onChange={setDays} />
        <Segmented
          value={er}
          onChange={setEr}
          options={[{ label: "All ERs", value: "" }, ...(filters?.ers || []).map((n) => ({ label: n, value: n }))]}
        />
      </div>

      {!data ? (
        <Skeleton className="h-[124px]" />
      ) : (
        <StatStrip>
          <Stat label="Calls" value={kpis.total_calls} hint={`${kpis.total_minutes} min total`} />
          <Stat
            label="Complaints"
            value={kpis.valid_complaints}
            hint={kpis.support_required ? `${kpis.support_required} need follow-up` : "None need follow-up"}
          />
          <Stat label="Satisfied" value={kpis.satisfied} hint="Pressed 1 at the menu" />
          <Stat label="Avg length" value={`${kpis.avg_minutes}m`} hint="Per call" />
          <Stat
            label="Cost"
            value={`Rs ${Number(kpis.total_cost_pkr || 0).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`}
            hint={
              kpis.ai_minutes != null
                ? `${Math.round(kpis.ai_minutes)}m AI · ${Math.round(kpis.menu_minutes || 0)}m menu`
                : `$${(kpis.total_cost_usd || 0).toFixed(3)} provider spend`
            }
          />
        </StatStrip>
      )}


      <Card title="Complaint breakdown" subtitle="Across category, staff group and location" padded={false}>
        <div className="grid grid-cols-1 gap-px md:grid-cols-3" style={{ background: "var(--border)" }}>
          {BREAKDOWNS.map((b) => (
            <div key={b.key} className="px-6 pb-6 pt-1" style={{ background: "var(--surface)" }}>
              <div className="mb-3.5">
                <div className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>{b.title}</div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{b.hint}</div>
              </div>
              {data ? <BarChart data={data[b.key]} /> : <Skeleton className="h-[100px]" />}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Call outcomes" subtitle="How each call ended">
          {data ? <StackedBar data={data.status} /> : <Skeleton className="h-[92px]" />}
        </Card>

        <Card title="By emergency room" subtitle="Call share per ER">
          {data ? <BarChart data={data.ers} /> : <Skeleton className="h-[92px]" />}
        </Card>
      </div>
    </div>
  );
}
