import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Badge, Button, Card, Field, Input, Skeleton } from "../components/ui";

/**
 * Dialling settings the foundation can change themselves.
 *
 * Deliberately limited to how and when calls are placed. Nothing here changes what the
 * agent says — wording, categories and tone stay in the prompt, where they get reviewed
 * rather than typed into a form on a Tuesday afternoon.
 */

const HOURS = Array.from({ length: 25 }, (_, i) => i);

function NumberField({ label, hint, value, onChange, min, max, suffix }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className="w-[110px]"
        />
        {suffix && <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>{suffix}</span>}
      </div>
      {hint && <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>{hint}</p>}
    </Field>
  );
}

function HourSelect({ label, value, onChange }) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 rounded-[9px] border px-2.5 text-[13px]"
        style={{ background: "var(--surface)", borderColor: "var(--border-strong)", color: "var(--text-primary)" }}
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
        ))}
      </select>
    </Field>
  );
}

export default function Settings() {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.settings().then(setForm).catch(() => setError("Could not load settings"));
  }, []);

  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const setDelay = (index) => (value) => {
    setForm((f) => {
      const delays = [...(f.retry_delay_minutes || [])];
      delays[index] = value;
      return { ...f, retry_delay_minutes: delays };
    });
    setSaved(false);
  };

  async function save() {
    setSaving(true);
    setError("");
    try {
      // The server trims or pads the delay list to match max_attempts, so the saved
      // response is the truth — take it back rather than keeping the local guess.
      const updated = await api.saveSettings({
        ...form,
        retry_delay_minutes: (form.retry_delay_minutes || []).map(Number).filter((n) => n > 0),
      });
      setForm(updated);
      setSaved(true);
    } catch (e) {
      setError(e.message || "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (error && !form) {
    return <Card><p className="text-[13px]" style={{ color: "var(--critical)" }}>{error}</p></Card>;
  }
  if (!form) return <Skeleton className="h-[420px]" />;

  const retryCount = Math.max(0, (form.max_attempts || 1) - 1);

  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      <Card
        title="Calling"
        subtitle="How many calls go out at once, and how long each one rings"
      >
        <div className="flex flex-col gap-4">
          <NumberField
            label="Simultaneous calls"
            value={form.max_concurrent_calls}
            onChange={set("max_concurrent_calls")}
            min={1}
            max={30}
            suffix="channels"
            hint="Must not exceed the number of channels the operator allows on the number. Going over does not queue — the surplus calls are rejected and counted as failed attempts."
          />
          <NumberField
            label="Ring for"
            value={form.dial_timeout_seconds}
            onChange={set("dial_timeout_seconds")}
            min={15}
            max={120}
            suffix="seconds"
            hint="How long to let an unanswered phone ring before hanging up and marking it for retry."
          />
        </div>
      </Card>

      <Card title="Retries" subtitle="What happens when a call does not connect">
        <div className="flex flex-col gap-4">
          <NumberField
            label="Attempts per patient"
            value={form.max_attempts}
            onChange={set("max_attempts")}
            min={1}
            max={5}
            suffix="including the first call"
            hint="Set to 1 to never retry."
          />

          {retryCount > 0 && (
            <div>
              <div className="mb-2 text-[13px] font-medium">Wait before each retry</div>
              <div className="flex flex-wrap gap-4">
                {Array.from({ length: retryCount }).map((_, i) => (
                  <NumberField
                    key={i}
                    label={`Before attempt ${i + 2}`}
                    value={form.retry_delay_minutes?.[i] ?? 30}
                    onChange={setDelay(i)}
                    min={1}
                    max={10080}
                    suffix="minutes"
                  />
                ))}
              </div>
            </div>
          )}

          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Only calls that never connected are retried — busy, unanswered, or phone switched
            off. A family who answered is never called again, whatever they said, and a wrong
            number is not retried either.
          </p>
        </div>
      </Card>

      <Card title="Calling hours" subtitle="Calls are only placed inside this window, Pakistan time">
        <div className="flex flex-wrap items-end gap-4">
          <HourSelect label="From" value={form.calling_window_start_hour} onChange={set("calling_window_start_hour")} />
          <HourSelect label="Until" value={form.calling_window_end_hour} onChange={set("calling_window_end_hour")} />
        </div>
        <p className="mt-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
          Outside these hours the queue is held rather than dropped — anything due is placed
          when the window next opens.
        </p>
      </Card>

      <Card title="Pause" subtitle="Stop placing new calls without losing the queue">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={!!form.paused}
            onChange={(e) => set("paused")(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-[13px]">Pause outbound calling</span>
          {form.paused && <Badge tone="critical">Paused</Badge>}
        </label>
        <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
          Calls already in progress finish normally. Nothing new is dialled until this is
          switched off.
        </p>
      </Card>

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
        {saved && <span className="text-[13px]" style={{ color: "var(--good)" }}>Saved</span>}
        {error && <span className="text-[13px]" style={{ color: "var(--critical)" }}>{error}</span>}
      </div>
    </div>
  );
}
