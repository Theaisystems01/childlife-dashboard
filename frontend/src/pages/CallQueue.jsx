import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { formatRelative, formatWhen } from "../lib/time";
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

/** How the queue is spread across retry attempts — "kitne retry pe hain". */
function AttemptBreakdown({ byAttempt }) {
  if (!byAttempt) return null;
  const entries = Object.entries(byAttempt)
    .map(([attempts, count]) => [Number(attempts), count])
    .filter(([, count]) => count > 0)
    .sort((a, b) => a[0] - b[0]);
  if (!entries.length) return null;

  const label = (n) =>
    n === 0 ? "Not yet called" : n === 1 ? "After 1 attempt" : `After ${n} attempts`;

  return (
    <Card title="Retry breakdown" subtitle="Patients grouped by how many times we have called them">
      <div className="flex flex-wrap gap-2">
        {entries.map(([attempts, count]) => (
          <span
            key={attempts}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-sunken)" }}
          >
            <span style={{ color: "var(--text-muted)" }}>{label(attempts)}</span>
            <span className="tnum font-medium" style={{ color: "var(--text-primary)" }}>{count}</span>
          </span>
        ))}
      </div>
    </Card>
  );
}

/**
 * Who uploaded which file, when, and what happened to it.
 *
 * Driven by the audit records, so a sheet still appears here after its patients have
 * been removed — otherwise clearing the queue also erases any trace that the upload
 * ever happened.
 */
function UploadHistory({ reload }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.batches().then((d) => !cancelled && setRows(d)).catch(() => !cancelled && setRows([]));
    return () => { cancelled = true; };
  }, [reload]);

  if (!rows) return <Skeleton className="h-[120px]" />;
  if (!rows.length) return null;

  return (
    <Card title="Upload history" subtitle="Every patient sheet imported, newest first">
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["File", "Uploaded", "By", "Rows", "Added", "Updated", "Duplicates", "Skipped", "Still in queue"].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left font-medium" style={{ color: "var(--text-muted)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.batch_id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="max-w-[240px] truncate px-3 py-2.5" title={b.filename || b.batch_id}>
                  {b.filename || <span style={{ color: "var(--text-muted)" }}>{b.batch_id}</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--text-secondary)" }} title={formatWhen(b.uploaded_at)}>
                  {b.uploaded_at ? formatRelative(b.uploaded_at) : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--text-secondary)" }}>{b.uploaded_by || "—"}</td>
                <td className="tnum px-3 py-2.5">{b.rows_read || "—"}</td>
                <td className="tnum px-3 py-2.5" style={{ color: b.created ? "var(--good)" : "var(--text-muted)" }}>{b.created || "—"}</td>
                <td className="tnum px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{b.updated || "—"}</td>
                <td className="tnum px-3 py-2.5" style={{ color: b.duplicates ? "var(--warning-ink)" : "var(--text-muted)" }}>{b.duplicates || "—"}</td>
                <td className="tnum px-3 py-2.5" style={{ color: b.skipped ? "var(--critical)" : "var(--text-muted)" }}>{b.skipped || "—"}</td>
                <td className="tnum px-3 py-2.5">{b.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
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
        {/* An explicit button as well as the drop zone. The dashed area alone did not
            read as something you could click. */}
        <Button
          variant="primary"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
        >
          {busy ? "Reading the sheet…" : "Choose .xlsx file"}
        </Button>
        <div className="text-[13.5px]" style={{ color: "var(--text-secondary)" }}>
          …or drop the spreadsheet here
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
            {result.duplicates > 0 && (
              <span style={{ color: "var(--warning-ink)" }}>{result.duplicates} duplicate row(s)</span>
            )}
            {result.skipped > 0 && <span style={{ color: "var(--critical)" }}>{result.skipped} skipped</span>}
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
      <UploadHistory reload={reload} />

      {!counts ? (
        <Skeleton className="h-[124px]" />
      ) : (
        <>
          <StatStrip>
            <Stat label="Awaiting first call" value={counts.pending} hint="Uploaded, never contacted" />
            <Stat label="Needs retry" value={counts.attempted} hint="Called, but never connected" />
            <Stat label="Completed" value={counts.completed} accent="var(--good)" hint="Feedback captured" />
            <Stat label="Due now" value={queue?.total_due ?? 0} hint="Ready to dial this moment" />
            <Stat
              label="Retry scheduled"
              value={queue?.retries_waiting ?? 0}
              hint="Waiting out the retry gap"
            />
          </StatStrip>
          <AttemptBreakdown byAttempt={queue?.by_attempt} />
        </>
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
                  {["Status", "Phone Number", "Patient Name", "MR Number", "ER name", "Attempts", "Last tried", "Next retry"].map((h) => (
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
                    <td className="tnum whitespace-nowrap px-3 py-2.5" title={`${p.call_count ?? 0} call record(s)`}>
                      {p.attempts ?? 0}
                    </td>
                    {/* The dialler's own clock, not the call history — it is written
                        even when a dial fails before any call record exists. */}
                    <td
                      className="whitespace-nowrap px-3 py-2.5"
                      style={{ color: "var(--text-secondary)" }}
                      title={p.last_called_at ? formatWhen(p.last_called_at) : "Never called"}
                    >
                      {p.last_called_at ? formatRelative(p.last_called_at) : "—"}
                      {p.last_outcome && (
                        <span className="ml-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {p.last_outcome}
                        </span>
                      )}
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-2.5"
                      style={{ color: p.next_retry_at ? "var(--warning-ink)" : "var(--text-muted)" }}
                      title={p.next_retry_at ? formatWhen(p.next_retry_at) : ""}
                    >
                      {p.next_retry_at ? formatRelative(p.next_retry_at) : "—"}
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
