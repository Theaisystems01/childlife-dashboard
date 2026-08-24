import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Skeleton } from "../components/ui";

const COLUMNS = [
  "Phone Number",
  "Received Time",
  "Disposition Catg",
  "Patient Category",
  "ER name",
  "MR Number",
  "Patient Name",
  "Remarks",
  "Complaint Category",
  "Complaint Sub Category",
  "Area",
];

/** Did we reach the number. Shows the attempt count when it took more than one. */
function ConnectionBadge({ connection, attempt }) {
  const answered = connection === "Answered";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Badge tone={answered ? "good" : "critical"}>{connection || "—"}</Badge>
      {attempt > 1 && (
        <span className="tnum text-[11px]" style={{ color: "var(--text-muted)" }} title={`Connected on attempt ${attempt}`}>
          ·{attempt}
        </span>
      )}
    </span>
  );
}

/** What the caller pressed. Only meaningful once the call was answered. */
function InputBadge({ input, connected }) {
  if (!connected) {
    return <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>{input || "—"}</span>;
  }
  const tone = input === "Satisfied" ? "good" : input === "Dissatisfied" ? "critical" : undefined;
  return <Badge tone={tone}>{input || "—"}</Badge>;
}

/** "1.77" minutes is not a thing anyone says out loud. Render it as 1m 46s. */
function formatDuration(minutes) {
  const total = Math.round((Number(minutes) || 0) * 60);
  if (total <= 0) return "0s";
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (!m) return `${s}s`;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/** Rupees, the currency the costing conversation actually happens in. */
function pkr(value) {
  const n = Number(value) || 0;
  return `Rs ${n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function Calls({ filters }) {
  const [query, setQuery] = useState({ search: "", status: "", category: "", er: "", days: null });
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [downloading, setDownloading] = useState(false);

  // Debounce the search box so each keystroke isn't a round trip.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.search), 300);
    return () => clearTimeout(t);
  }, [query.search]);

  useEffect(() => setPage(1), [debounced, query.status, query.category, query.er]);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    api
      .calls({ ...query, search: debounced, page, limit: 25 })
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData({ items: [], total: 0, pages: 1 }));
    return () => {
      cancelled = true;
    };
  }, [debounced, query.status, query.category, query.er, query.days, page]);

  const set = (key) => (value) => setQuery((q) => ({ ...q, [key]: value }));

  async function download() {
    setDownloading(true);
    try {
      await api.download({ ...query, search: debounced });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[230px] flex-1">
            <Field label="Search">
              <Input
                value={query.search}
                onChange={(e) => set("search")(e.target.value)}
                placeholder="Patient name, MR number, phone, remarks…"
              />
            </Field>
          </div>

          <Select label="Status" value={query.status} onChange={set("status")} options={filters?.statuses || []} />
          <Select label="Category" value={query.category} onChange={set("category")} options={filters?.categories || []} />
          <Select label="ER" value={query.er} onChange={set("er")} options={filters?.ers || []} />

          <Button variant="primary" onClick={download} disabled={downloading}>
            {downloading ? "Preparing…" : "↓ Export Excel"}
          </Button>
        </div>
      </Card>

      <Card
        title={`Call records${data ? ` · ${data.total}` : ""}`}
        subtitle="The foundation reporting format, newest first"
      >
        {!data ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11" />)}
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState title="No calls match these filters" hint="Try widening the period or clearing a filter." />
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {/* Two columns, not one. "Answered" and "Silent" are different
                      questions: the first is whether the number is reachable, the
                      second is whether the family engaged. Merged, a silent answer
                      looked the same as a dead number. */}
                  <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap" style={{ color: "var(--text-muted)" }}>Status</th>
                  <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap" style={{ color: "var(--text-muted)" }}>Input</th>
                  <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap" style={{ color: "var(--text-muted)" }}>AI time</th>
                  <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap" style={{ color: "var(--text-muted)" }}>Cost</th>
                  {COLUMNS.map((c) => (
                    <th key={c} className="px-3 py-2.5 text-left font-medium whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelected(row.session_id)}
                    className="cursor-pointer transition-colors hover:brightness-[0.98]"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <ConnectionBadge connection={row.connection} attempt={row.attempt} />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <InputBadge input={row.caller_input} connected={row.connection === "Answered"} />
                    </td>
                    <td
                      className="tnum px-3 py-2.5 whitespace-nowrap"
                      style={{ color: row.ai_minutes ? "var(--text-primary)" : "var(--text-muted)" }}
                      title={row.ai_engaged ? "Minutes spent with the AI" : "IVR only — no AI, no model cost"}
                    >
                      {row.ai_engaged ? formatDuration(row.ai_minutes) : "—"}
                    </td>
                    <td
                      className="tnum px-3 py-2.5 whitespace-nowrap"
                      style={{ color: row.cost_pkr ? "var(--text-primary)" : "var(--text-muted)" }}
                      title={
                        row.cost_pkr_breakdown
                          ? `carrier ${row.cost_pkr_breakdown.carrier} + menu ${row.cost_pkr_breakdown.ivr} + AI ${row.cost_pkr_breakdown.ai}`
                          : ""
                      }
                    >
                      {row.connection === "Answered" ? pkr(row.cost_pkr) : "—"}
                    </td>
                    {COLUMNS.map((c) => (
                      <td
                        key={c}
                        className={`px-3 py-2.5 ${c === "Remarks" ? "max-w-[280px] truncate" : "whitespace-nowrap"} ${
                          ["Phone Number", "MR Number", "Received Time"].includes(c) ? "tnum" : ""
                        }`}
                        style={{ color: row.report[c] ? "var(--text-primary)" : "var(--text-muted)" }}
                        title={row.report[c] || ""}
                      >
                        {c === "Received Time" ? formatWhen(row.report[c]) : row.report[c] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.pages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Page {data.page} of {data.pages}
            </span>
            <div className="flex gap-2">
              <Button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Previous</Button>
              <Button onClick={() => setPage((p) => Math.min(data.pages, p + 1))} disabled={page >= data.pages}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      {selected && <CallDetail sessionId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function CallDetail({ sessionId, onClose }) {
  const [call, setCall] = useState(null);

  useEffect(() => {
    setCall(null);
    api.call(sessionId).then(setCall).catch(() => setCall(false));
  }, [sessionId]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portalled to <body> on purpose. App.jsx wraps every page in .animate-in, which
  // animates `transform` — and a transformed ancestor becomes the containing block for
  // position:fixed. Rendered in place, this drawer anchored to the centred, max-width
  // <main> and slid out of the page gutter instead of the edge of the screen.
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(11,11,11,0.35)" }} onClick={onClose}>
      {/* The panel itself never scrolls. It is a flex column of three parts: a fixed
          header, a fixed report block, and a transcript that scrolls on its own. The
          previous version put overflow-y-auto on the whole aside, so a long transcript
          dragged the header and the report off-screen together. */}
      <aside
        className="animate-in flex h-full w-full max-w-[560px] flex-col overflow-hidden border-l"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex shrink-0 items-center justify-between border-b px-5 py-4"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div>
            <h2 className="text-sm font-medium">Call detail</h2>
            <p className="tnum mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{sessionId}</p>
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="Close">✕</Button>
        </header>

        {call === null && <div className="flex flex-col gap-2 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>}
        {call === false && <div className="p-5 text-sm" style={{ color: "var(--critical)" }}>Could not load this call.</div>}

        {call && (
          <>
            {/* Fixed upper block — stays visible while the transcript scrolls. */}
            <div className="shrink-0 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <ConnectionBadge connection={call.connection} attempt={call.attempt} />
                <InputBadge input={call.caller_input} connected={call.connection === "Answered"} />
                <Badge tone="accent">{call.direction}</Badge>
                {call.patient_matched && <Badge tone="good">✓ patient matched</Badge>}
                {call.support_required && <Badge tone="critical">follow-up needed</Badge>}
              </div>

              <dl className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                {COLUMNS.map((c) => (
                  <div key={c} className="contents">
                    <dt style={{ color: "var(--text-muted)" }}>{c}</dt>
                    <dd className={["Phone Number", "MR Number"].includes(c) ? "tnum" : ""} style={{ color: call.report[c] ? "var(--text-primary)" : "var(--text-muted)" }}>
                      {c === "Received Time" ? formatWhen(call.report[c]) : call.report[c] || "—"}
                    </dd>
                  </div>
                ))}
                <div className="contents">
                  <dt style={{ color: "var(--text-muted)" }}>Call length</dt>
                  <dd className="tnum">{formatDuration(call.duration_minutes)}</dd>
                </div>
                <div className="contents">
                  <dt style={{ color: "var(--text-muted)" }}>AI minutes</dt>
                  <dd className="tnum" title="Time with the model. The recorded menu is free.">
                    {call.ai_engaged ? formatDuration(call.ai_minutes) : "— (IVR only)"}
                  </dd>
                </div>
                <div className="contents">
                  <dt style={{ color: "var(--text-muted)" }}>Cost</dt>
                  <dd className="tnum font-medium">{pkr(call.cost_pkr)}</dd>
                </div>
                {call.cost_pkr_breakdown && (
                  <>
                    <div className="contents">
                      <dt className="pl-3" style={{ color: "var(--text-muted)" }}>· carrier</dt>
                      <dd className="tnum" style={{ color: "var(--text-muted)" }}>
                        {pkr(call.cost_pkr_breakdown.carrier)}
                      </dd>
                    </div>
                    <div className="contents">
                      <dt className="pl-3" style={{ color: "var(--text-muted)" }}>· menu</dt>
                      <dd className="tnum" style={{ color: "var(--text-muted)" }}>
                        {pkr(call.cost_pkr_breakdown.ivr)}
                      </dd>
                    </div>
                    <div className="contents">
                      <dt className="pl-3" style={{ color: "var(--text-muted)" }}>· AI</dt>
                      <dd className="tnum" style={{ color: "var(--text-muted)" }}>
                        {pkr(call.cost_pkr_breakdown.ai)}
                      </dd>
                    </div>
                  </>
                )}

              </dl>
            </div>

            {/* min-h-0 is what actually lets this scroll: without it the flex child
                grows to fit its content instead of clipping. */}
            <div className="flex min-h-0 flex-1 flex-col">
              <h3
                className="shrink-0 px-5 pb-2 pt-4 text-[11px] font-medium uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Transcript {call.transcript?.length ? `· ${call.transcript.length} turns` : ""}
              </h3>
              {call.transcript?.length ? (
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-5 pb-5">
                  {call.transcript.map((turn, i) => (
                    <div
                      key={i}
                      className="shrink-0 rounded-lg px-3 py-2 text-[13px]"
                      style={{
                        background: turn.role === "assistant" ? "var(--accent-wash)" : "var(--surface-sunken)",
                        marginLeft: turn.role === "assistant" ? 0 : "1.5rem",
                      }}
                    >
                      <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                        {turn.role === "assistant" ? "Ayesha" : "Caller"}
                      </div>
                      <div className="whitespace-pre-wrap break-words" style={{ color: "var(--text-primary)" }}>{turn.text}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-5 pb-5 text-[13px]" style={{ color: "var(--text-muted)" }}>
                  No transcript recorded for this call.
                </p>
              )}
            </div>
          </>
        )}
      </aside>
    </div>,
    document.body,
  );
}
