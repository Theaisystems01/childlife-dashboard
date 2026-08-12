import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { Badge, Button, Card, EmptyState, Field, Input, Segmented, Select, Skeleton, Stat, StatStrip } from "../components/ui";

const STATUS_TONE = { pending: "accent", attempted: "warning", completed: "good" };
const STATUS_ICON = { pending: "○", attempted: "◐", completed: "✓" };

function StatusBadge({ status }) {
  return (
    <Badge tone={STATUS_TONE[status] || "neutral"}>
      <span aria-hidden="true">{STATUS_ICON[status] || "—"}</span>
      {status}
    </Badge>
  );
}

function formatWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Drag-and-drop upload for the patient sheet. */
function Upload({ onDone }) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const send = useCallback(
    async (file) => {
      if (!file) return;
      setBusy(true);
      setError("");
      setResult(null);
      try {
        const r = await api.uploadPatients(file);
        setResult(r);
        onDone?.();
      } catch (e) {
        setError(e.message || "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [onDone],
  );

  return (
    <Card
      title="Upload patient list"
      subtitle="An .xlsx sheet with one row per patient"
      action={
        <Button onClick={() => api.downloadTemplate()}>↓ Template</Button>
      }
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          send(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[12px] border border-dashed px-6 py-10 text-center transition-colors"
        style={{
          borderColor: dragging ? "var(--accent)" : "var(--border-strong)",
          background: dragging ? "var(--accent-wash)" : "var(--surface-sunken)",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm"
          hidden
          onChange={(e) => {
            send(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className="text-[13.5px]" style={{ color: "var(--text-secondary)" }}>
          {busy ? "Reading the sheet…" : "Drop the spreadsheet here, or click to choose"}
        </div>
        <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Needs a Phone Number column. Patient Name, MR Number and ER name are recommended.
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-[10px] px-3 py-2 text-[13px]" style={{ background: "rgba(208,59,59,0.10)", color: "var(--critical)" }} role="alert">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px]">
            <span style={{ color: "var(--good)" }}>{result.created} added</span>
            <span style={{ color: "var(--text-secondary)" }}>{result.updated} updated</span>
            {result.skipped > 0 && <span style={{ color: "var(--warning-ink)" }}>{result.skipped} skipped</span>}
            <span style={{ color: "var(--text-muted)" }}>{result.total_patients} patients in total</span>
          </div>

          {result.problems?.length > 0 && (
            <div className="mt-3 rounded-[10px] border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="mb-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                Rows that could not be imported
              </div>
              <div className="flex flex-col gap-1">
                {result.problems.map((p) => (
                  <div key={p.row} className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                    Row {p.row}: {p.value ? `"${p.value}" — ` : ""}
                    {p.reason}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function CallQueue({ filters }) {
  const [tab, setTab] = useState("queue");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [er, setEr] = useState("");
  const [queue, setQueue] = useState(null);
  const [all, setAll] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setQueue(null);
    api.queue({ er }).then((d) => !cancelled && setQueue(d)).catch(() => !cancelled && setQueue(false));
    return () => { cancelled = true; };
  }, [er, reload]);

  useEffect(() => {
    if (tab !== "all") return;
    let cancelled = false;
    setAll(null);
    api
      .patients({ search: debounced, er, limit: 50 })
      .then((d) => !cancelled && setAll(d))
      .catch(() => !cancelled && setAll(false));
    return () => { cancelled = true; };
  }, [tab, debounced, er, reload]);

  const counts = queue?.counts;
  const rows = tab === "queue" ? queue?.items : all?.items;
  const loading = tab === "queue" ? queue === null : all === null;

  return (
    <div className="flex flex-col gap-6">
      <Upload onDone={() => setReload((n) => n + 1)} />

      {!counts ? (
        <Skeleton className="h-[124px]" />
      ) : (
        <StatStrip>
          <Stat label="Awaiting first call" value={counts.pending} hint="Uploaded, never contacted" />
          <Stat label="Needs retry" value={counts.attempted} hint="Called, but nothing captured" />
          <Stat label="Completed" value={counts.completed} accent="var(--good)" hint="Feedback captured" />
          <Stat label="Due now" value={queue?.total_due ?? 0} hint="Total still to call" />
        </StatStrip>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { label: "Call queue", value: "queue" },
            { label: "All patients", value: "all" },
          ]}
        />
        <div className="flex flex-wrap items-end gap-3">
          {tab === "all" && (
            <div className="w-[220px]">
              <Field label="Search">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, MR number, phone…" />
              </Field>
            </div>
          )}
          <Select label="ER" value={er} onChange={setEr} options={filters?.ers || []} />
        </div>
      </div>

      <Card
        title={tab === "queue" ? `Patients to call${queue ? ` · ${queue.total_due}` : ""}` : `All patients${all ? ` · ${all.total}` : ""}`}
        subtitle={
          tab === "queue"
            ? "Oldest upload first — these have no completed feedback yet"
            : "Everyone imported, including those already contacted"
        }
      >
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11" />)}
          </div>
        ) : rows === undefined || rows === null || !rows.length ? (
          <EmptyState
            title={tab === "queue" ? "Nobody is waiting for a call" : "No patients imported yet"}
            hint={tab === "queue" ? "Upload a patient list to build the queue." : "Use the upload box above to import a sheet."}
          />
        ) : (
          <div className="-mx-6 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Status", "Phone Number", "Patient Name", "MR Number", "ER name", "Visit Reason", "Attempts", "Last call"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left font-medium" style={{ color: "var(--text-muted)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="whitespace-nowrap px-3 py-2.5"><StatusBadge status={p.derived_status} /></td>
                    <td className="tnum whitespace-nowrap px-3 py-2.5">{p.phone_e164}</td>
                    <td className="whitespace-nowrap px-3 py-2.5" style={{ color: p.patient_name ? "var(--text-primary)" : "var(--text-muted)" }}>
                      {p.patient_name || "—"}
                    </td>
                    <td className="tnum whitespace-nowrap px-3 py-2.5" style={{ color: p.mr_number ? "var(--text-primary)" : "var(--text-muted)" }}>
                      {p.mr_number || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">{p.er_name || "—"}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5" style={{ color: "var(--text-secondary)" }} title={p.visit_reason || ""}>
                      {p.visit_reason || "—"}
                    </td>
                    <td className="tnum whitespace-nowrap px-3 py-2.5">{p.call_count ?? 0}</td>
                    <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--text-muted)" }}>
                      {formatWhen(p.last_call?.at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
