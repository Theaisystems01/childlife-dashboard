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

export default function Settings({ user }) {
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
  // Not the admin role — costing access is granted per account.
  const canManageCosting = Boolean(user?.can_manage_costing);

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

      {/* Rates are commercial, not operational, so this is gated per account rather
          than by role — an admin who runs the calling operation still does not see the
          margin. The server enforces the same rule, since hiding a card does not stop
          anyone PUTting to the endpoint. */}
      {canManageCosting && (
      <Card title="Costing" subtitle="Rates the dashboard bills on, in rupees per minute">
        <div className="flex flex-wrap gap-4">
          <NumberField
            label="Carrier"
            value={form.rate_carrier_pkr_per_min}
            onChange={set("rate_carrier_pkr_per_min")}
            min={0}
            max={100}
            suffix="PKR/min"
            hint="Charged on the whole call"
          />
          <NumberField
            label="Menu only"
            value={form.rate_ivr_pkr_per_min}
            onChange={set("rate_ivr_pkr_per_min")}
            min={0}
            max={100}
            suffix="PKR/min"
            hint="Minutes before the AI joins"
          />
          <NumberField
            label="AI"
            value={form.rate_ai_pkr_per_min}
            onChange={set("rate_ai_pkr_per_min")}
            min={0}
            max={500}
            suffix="PKR/min"
            hint="Only after pressing 2"
          />
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Field label="Carrier billing pulse">
            <select
              value={form.carrier_pulse_seconds ?? 0}
              onChange={(e) => set("carrier_pulse_seconds")(Number(e.target.value))}
              className="h-9 rounded-[9px] border px-2.5 text-[13px]"
              style={{ background: "var(--surface)", borderColor: "var(--border-strong)", color: "var(--text-primary)" }}
            >
              <option value={0}>Exact duration (per second)</option>
              <option value={30}>30 seconds, rounded up</option>
              <option value={60}>60 seconds, rounded up</option>
            </select>
          </Field>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={!!form.charge_unanswered}
              onChange={(e) => set("charge_unanswered")(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-[13px]">Charge for calls that were never answered</span>
          </label>
        </div>

        <div
          className="mt-4 rounded-[10px] px-3 py-2.5 text-[12px]"
          style={{ background: "var(--surface-sunken)", color: "var(--text-muted)" }}
        >
          <strong style={{ color: "var(--text-secondary)" }}>Both settings above are unconfirmed with Telecard.</strong>{" "}
          The pulse matters most: a 26-second satisfied call costs about Rs 1.28 billed by the
          second, Rs 1.42 on a 30-second pulse, and Rs 2.50 on a 60-second one. Most calls are
          short satisfied ones, so this roughly doubles the per-call figure at the top end.
        </div>

        <p className="mt-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
          A minute is either a menu minute or an AI minute, never both. Actual provider spend
          is recorded separately in USD and is not affected by these rates.
        </p>
      </Card>
      )}

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
