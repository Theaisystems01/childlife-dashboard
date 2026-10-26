import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { formatRelative, formatWhen } from "../lib/time";
import { Badge, Button, Card, EmptyState, Field, Input, Pagination, Segmented, Select, Skeleton, Stat, StatStrip, paginate } from "../components/ui";

const STATUS_TONE = {
  pending: "accent",
  calling: "accent",
  attempted: "warning",
  completed: "good",
  unreachable: "critical",
};
const STATUS_ICON = {
  pending: "○",
  calling: "◔",
  attempted: "◐",
  completed: "✓",
  unreachable: "✕",
};

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
const UPLOADS_PER_PAGE = 5;


const SHEET_ROWS_PER_PAGE = 50;

/**
 * The rows that came out of one uploaded sheet, read-only.
 *
 * Not the .xlsx itself: the upload endpoint parses the file and discards it, keeping
 * only the audit counts, so there is no original to hand back. These are the patients it
 * produced, which is what the file is being opened to check anyway — did the right
 * numbers land, with the right ER against them.
 */
function SheetViewer({ batch, onClose }) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => setPage(1), [batch?.batch_id]);

  useEffect(() => {
    if (!batch) return undefined;
    let cancelled = false;
    setData(null);
    setError("");
    api
      .patients({ batch_id: batch.batch_id, page, limit: SHEET_ROWS_PER_PAGE })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message || "Could not load the rows"));
    return () => { cancelled = true; };
  }, [batch, page]);

  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  if (!batch) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(11,11,11,0.35)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[86vh] w-full max-w-[1000px] flex-col rounded-xl border"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="min-w-0">
            <div className="truncate text-[15px] font-medium">{batch.filename || batch.batch_id}</div>
            <div className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
              {batch.rows_read ? `${batch.rows_read} rows read` : "—"}
              {batch.uploaded_by ? ` · ${batch.uploaded_by}` : ""}
              {batch.uploaded_at ? ` · ${formatWhen(batch.uploaded_at)}` : ""}
            </div>
          </div>
          <Button onClick={onClose}>Close</Button>
        </div>

        {error && (
          <div className="px-5 py-4 text-[13px]" style={{ color: "var(--critical)" }}>{error}</div>
        )}
        {!data && !error && <div className="p-5"><Skeleton className="h-20" /></div>}

        {data && (
          <>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0" style={{ background: "var(--surface)" }}>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["#", "Phone", "Patient", "MR Number", "ER", "Patient Catg", "Disposition", "Status"].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-3 py-2.5 text-left font-medium"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="tnum px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                        {(page - 1) * SHEET_ROWS_PER_PAGE + i + 1}
                      </td>
                      <td className="tnum whitespace-nowrap px-3 py-2">{r.phone_raw || r.phone_e164 || "—"}</td>
                      <td className="max-w-[180px] truncate px-3 py-2" title={r.patient_name}>{r.patient_name || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2" style={{ color: "var(--text-secondary)" }}>{r.mr_number || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.er_name || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2" style={{ color: "var(--text-secondary)" }}>{r.patient_category || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2" style={{ color: "var(--text-secondary)" }}>{r.disposition_category || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <Badge tone={STATUS_TONE[r.derived_status] || "neutral"}>{r.derived_status || "pending"}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.items.length && (
                <div className="px-5 py-6 text-[13px]" style={{ color: "var(--text-muted)" }}>
                  No rows from this upload are still in the system.
                </div>
              )}
            </div>
            <div className="shrink-0 border-t px-2" style={{ borderColor: "var(--border)" }}>
              <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function UploadHistory({ reload, onOpen }) {
  const [rows, setRows] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    api.batches().then((d) => !cancelled && setRows(d)).catch(() => !cancelled && setRows([]));
    return () => { cancelled = true; };
  }, [reload]);

  // A new upload belongs at the top, so go back to the first page when one lands.
  useEffect(() => setPage(1), [reload]);

  if (!rows) return <Skeleton className="h-[120px]" />;
  if (!rows.length) return null;

  const shown = paginate(rows, page, UPLOADS_PER_PAGE);

  return (
    <Card title="Upload history" subtitle="Every patient sheet imported, newest first">
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["File", "Uploaded", "By", "Rows", "Added", "Updated", "Duplicates", "Skipped", "Still to call"].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left font-medium" style={{ color: "var(--text-muted)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.slice.map((b) => (
              <tr key={b.batch_id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="max-w-[240px] px-3 py-2.5">
                  {/* The filename is the handle: it is what the reader recognises, and
                      clicking the thing you recognise is cheaper than a separate action
                      column that has to be labelled. */}
                  <button
                    type="button"
                    onClick={() => onOpen(b)}
                    className="block max-w-full truncate text-left underline decoration-dotted underline-offset-2 hover:decoration-solid focus:outline-2 focus:outline-offset-2"
                    title={`View the rows from ${b.filename || b.batch_id}`}
                  >
                    {b.filename || <span style={{ color: "var(--text-muted)" }}>{b.batch_id}</span>}
                  </button>
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
                <td
                  className="tnum px-3 py-2.5"
                  style={{ color: b.waiting ? "var(--text-primary)" : "var(--text-muted)" }}
                  title={`${b.count} row(s) from this upload are still in the system`}
                >
                  {b.waiting ? b.waiting : "\u2014"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={shown.page}
        pages={shown.pages}
        total={shown.total}
        onPage={setPage}
        unit="uploads"
      />
    </Card>
  );
}

/** Drag-and-drop upload for the patient sheet. */
function Upload({ onDone }) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  // Nothing in the sheet says whether this is a fresh round of calls or a correction
  // to the last one — visit date would have, but the foundation does not supply it —
  // so the person uploading has to tell us.
  const [recallExisting, setRecallExisting] = useState(true);
  // The sheet the server refused on its column contents, kept so it can be sent again
  // without being picked a second time. Set only by a rejection, cleared by anything
  // else, so "Upload anyway" cannot linger and apply to a later file.
  const [rejected, setRejected] = useState(null);
  const inputRef = useRef(null);

  const send = useCallback(
    async (file, { ignoreColumnCheck = false } = {}) => {
      if (!file) return;
      setBusy(true);
      setError("");
      setResult(null);
      try {
        const r = await api.uploadPatients(file, { recallExisting, ignoreColumnCheck });
        setResult(r);
        setRejected(null);
        onDone?.();
      } catch (e) {
        const message = e.message || "Upload failed";
        setError(message);
        // A column complaint is the one failure worth offering to override: the sheet
        // may be unusual rather than wrong, and the message says which columns and
        // what they hold, so the decision can be made on evidence.
        setRejected(message.startsWith("The columns in this sheet") ? file : null);
      } finally {
        setBusy(false);
      }
    },
    [onDone, recallExisting],
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

      <div className="mt-4 flex flex-col gap-2">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="radio"
            name="upload-mode"
            checked={recallExisting}
            onChange={() => setRecallExisting(true)}
            className="mt-0.5 h-4 w-4"
          />
          <span className="text-[13px]">
            A new round of calls
            <span className="ml-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
              — anyone in the sheet becomes due again, including families called about an
              earlier visit
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="radio"
            name="upload-mode"
            checked={!recallExisting}
            onChange={() => setRecallExisting(false)}
            className="mt-0.5 h-4 w-4"
          />
          <span className="text-[13px]">
            A correction to a sheet already uploaded
            <span className="ml-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
              — details are updated, but nobody already called is rung again
            </span>
          </span>
        </label>
      </div>

      {error && (
        <div className="mt-3 rounded-[10px] px-3 py-2 text-[13px]" style={{ background: "rgba(208,59,59,0.10)", color: "var(--critical)" }} role="alert">
          {error}
          {rejected && (
            /* Offered only for a column complaint, and only after the message above
               has said which columns and what they hold. A sheet can be unusual
               rather than wrong, and refusing it outright would leave no way through
               at an inconvenient hour. */
            <div className="mt-2">
              <Button onClick={() => send(rejected, { ignoreColumnCheck: true })} disabled={busy}>
                Upload anyway
              </Button>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px]">
            <span style={{ color: "var(--good)" }}>{result.created} added</span>
            <span style={{ color: "var(--text-secondary)" }}>{result.updated} updated</span>
            {result.recalled > 0 && (
              <span style={{ color: "var(--accent)" }}>{result.recalled} due again</span>
            )}
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

const PATIENTS_PER_PAGE = 15;

export default function CallQueue({ filters }) {
  const [tab, setTab] = useState("queue");
  const [patientPage, setPatientPage] = useState(1);
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

  // Switching tab or filter changes what is being listed, so start at page one
  // rather than stranding the reader on a page that no longer exists.
  useEffect(() => setPatientPage(1), [tab, er, debounced, reload]);

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
      .patients({ search: debounced, er, page: patientPage, limit: PATIENTS_PER_PAGE })
      .then((d) => !cancelled && setAll(d))
      .catch(() => !cancelled && setAll(false));
    return () => { cancelled = true; };
  }, [tab, debounced, er, reload, patientPage]);

  const counts = queue?.counts;
  // "attempted" covers both patients still owed a retry and those that have used the
  // whole budget. Only the first group is work; the dialler will never pick up the second.
  // Which upload is open in the read-only viewer, if any.
  const [sheet, setSheet] = useState(null);
  const stalled = queue?.stalled ?? 0;
  const needsRetry = Math.max(0, (counts?.attempted ?? 0) - stalled);
  const loading = tab === "queue" ? queue === null : all === null;

  // The queue arrives in one response, so it pages in the browser. "All patients" is
  // already paged by the server, so that one just follows its own page number.
  const allRows = tab === "queue" ? queue?.items : all?.items;
  const shown =
    tab === "queue"
      ? paginate(allRows, patientPage, PATIENTS_PER_PAGE)
      : { slice: allRows || [], page: all?.page ?? 1, pages: all?.pages ?? 1, total: all?.total ?? 0 };
  const rows = shown.slice;

  return (
    <div className="flex flex-col gap-6">
      <Upload onDone={() => setReload((n) => n + 1)} />
      <UploadHistory reload={reload} onOpen={setSheet} />
      <SheetViewer batch={sheet} onClose={() => setSheet(null)} />

      {!counts ? (
        <Skeleton className="h-[124px]" />
      ) : (
        <>
          <StatStrip>
            <Stat label="Awaiting first call" value={counts.pending} hint="Uploaded, never contacted" />
            <Stat label="Needs retry" value={needsRetry} hint="Called, and a retry is still owed" />
            <Stat label="Retry scheduled" value={queue?.retries_waiting ?? 0} hint="Waiting out the retry gap" />
            <Stat label="Due now" value={queue?.total_due ?? 0} hint="Ready to dial this moment" />
            <Stat label="Calling now" value={counts.calling ?? 0} hint="On the line this moment" />
            <Stat label="Completed" value={counts.completed} accent="var(--good)" hint="Feedback captured" />
            <Stat label="Unreachable" value={counts.unreachable ?? 0} hint="Tried and given up on" />
            {/* Out of attempts but still filed as "attempted" — the dialler writes
                "exhausted" only as it records a final failure, so lowering max_attempts
                afterwards strands these. Shown on its own because folding them into
                "Needs retry" had the page offering work that can never be done. */}
            {stalled > 0 && (
              <Stat
                label="Out of attempts"
                value={stalled}
                hint={`Tried ${queue?.max_attempts ?? "max"}×, will not be called again`}
              />
            )}
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
            ? "Oldest upload first — everyone the dialler would pick up next"
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
