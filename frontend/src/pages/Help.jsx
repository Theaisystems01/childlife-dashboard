import { useState } from "react";
import { Badge, Card } from "../components/ui";

/**
 * The user guide.
 *
 * Two audiences in one page, deliberately separated: staff who upload lists and read
 * reports, and whoever operates the calling system. Mixing them made both halves harder
 * to follow — a nurse does not need to know what a retry gap is, and the person setting
 * the retry gap does not need the Excel instructions.
 *
 * Screenshots are captured from the real dashboard with demo data, so they show a
 * populated system rather than empty tables.
 */

const SECTIONS = [
  { id: "start", label: "Getting started", audience: "staff" },
  { id: "upload", label: "Uploading a patient list", audience: "staff" },
  { id: "queue", label: "Following the queue", audience: "staff" },
  { id: "records", label: "Reading call records", audience: "staff" },
  { id: "export", label: "Exporting the report", audience: "staff" },
  { id: "careful", label: "What to be careful of", audience: "staff" },
  { id: "how", label: "How a call works", audience: "operator" },
  { id: "settings", label: "Retries and calling hours", audience: "operator" },
  { id: "costing", label: "Costing", audience: "operator" },
  { id: "trouble", label: "When calls are not going out", audience: "operator" },
];

function Shot({ src, caption }) {
  return (
    <figure className="my-4">
      <img
        src={src}
        alt={caption}
        className="w-full rounded-[10px] border"
        style={{ borderColor: "var(--border)" }}
      />
      {caption && (
        <figcaption className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function Step({ n, title, children }) {
  return (
    <div className="flex gap-3.5">
      <div
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-medium"
        style={{ background: "var(--accent-wash)", color: "var(--accent)" }}
      >
        {n}
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <div className="text-[13.5px] font-medium">{title}</div>
        <div className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Warn({ children, tone = "warning" }) {
  const bg = tone === "critical" ? "rgba(208,59,59,0.08)" : "rgba(191,140,0,0.10)";
  const fg = tone === "critical" ? "var(--critical)" : "var(--warning-ink)";
  return (
    <div className="my-3 rounded-[10px] px-3.5 py-3 text-[13px] leading-relaxed" style={{ background: bg }}>
      <span className="font-medium" style={{ color: fg }}>
        {tone === "critical" ? "Important — " : "Watch out — "}
      </span>
      <span style={{ color: "var(--text-secondary)" }}>{children}</span>
    </div>
  );
}

function H({ id, children, kicker }) {
  return (
    <div id={id} className="scroll-mt-6 pt-2">
      {kicker && (
        <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.09em]" style={{ color: "var(--text-muted)" }}>
          {kicker}
        </div>
      )}
      <h2 className="text-[17px] font-medium tracking-[-0.01em]">{children}</h2>
    </div>
  );
}

export default function Help() {
  const [audience, setAudience] = useState("staff");
  const shown = SECTIONS.filter((s) => s.audience === audience);

  return (
    <div className="flex gap-8">
      {/* Contents */}
      <aside className="sticky top-8 hidden h-fit w-[210px] shrink-0 lg:block">
        <div className="mb-3 flex gap-1 rounded-[10px] p-1" style={{ background: "var(--surface-sunken)" }}>
          {[
            ["staff", "For staff"],
            ["operator", "For operators"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setAudience(id)}
              className="flex-1 cursor-pointer rounded-[8px] px-2 py-1.5 text-[12px] font-medium transition-colors"
              style={{
                background: audience === id ? "var(--surface)" : "transparent",
                color: audience === id ? "var(--text-primary)" : "var(--text-muted)",
                boxShadow: audience === id ? "var(--shadow-sm)" : "none",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <nav className="flex flex-col gap-0.5">
          {shown.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-[8px] px-2.5 py-1.5 text-[12.5px] transition-colors hover:brightness-95"
              style={{ color: "var(--text-secondary)" }}
            >
              {s.label}
            </a>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 max-w-[760px] flex-1 pb-16">
        {audience === "staff" ? <StaffGuide /> : <OperatorGuide />}
      </div>
    </div>
  );
}

function StaffGuide() {
  return (
    <div className="flex flex-col gap-8">
      <Card>
        <H id="start" kicker="Getting started">What this dashboard does</H>
        <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          ChildLife calls families after a child has been treated in one of the emergency
          rooms and asks a single question: were you satisfied? A recorded voice plays the
          question, the family answers with the phone keypad, and anyone who says they were
          <em> not</em> satisfied is put through to an assistant that listens to the
          complaint and files it in the foundation&rsquo;s own reporting format.
        </p>
        <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Your part is three things: give the system a list of families to call, watch the
          list work through, and export the report when you need it.
        </p>
        <Shot src="/help/overview.png" caption="The Overview page — how many calls were made, what families complained about, and what it cost." />
      </Card>

      <Card>
        <H id="upload" kicker="Step one">Uploading a patient list</H>
        <Shot src="/help/queue.png" caption="Call queue — the upload box sits at the top, with the history of every sheet below it." />
        <div className="mt-2">
          <Step n="1" title="Download the template">
            On the <strong>Call queue</strong> page, press <strong>↓ Template</strong> in the
            top right of the upload box. It gives you a spreadsheet with the right column
            headings already in place.
          </Step>
          <Step n="2" title="Fill in one row per family">
            The only column that must be filled is <strong>Phone Number</strong>. Patient
            Name, MR Number and ER name are strongly recommended — without the name the
            assistant cannot greet the family properly, and without the ER it cannot tell
            which hospital they visited.
          </Step>
          <Step n="3" title="Choose the file">
            Press <strong>Choose .xlsx file</strong>, or drag the spreadsheet onto the
            dashed box.
          </Step>
          <Step n="4" title="Say what kind of upload it is">
            <strong>A new round of calls</strong> means everyone in the sheet should be
            called, including families you have called before about an earlier visit.
            <strong> A correction</strong> means you are fixing details in a sheet you
            already uploaded, and nobody who has already been called should be rung again.
          </Step>
          <Step n="5" title="Read the result line">
            It tells you how many were added, updated, skipped and how many rows were
            duplicates. Anything skipped is listed with the row number and the reason.
          </Step>
        </div>
        <Warn>
          Phone numbers can be in any format — <code>+923001234567</code>,{" "}
          <code>03001234567</code> or <code>3001234567</code> all work. A number that is
          not a valid Pakistani mobile is skipped and named in the result, so check that
          line before assuming the whole sheet went in.
        </Warn>
      </Card>

      <Card>
        <H id="queue" kicker="Step two">Following the queue</H>
        <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          The five figures across the middle of the Call queue page tell you where the
          batch has got to.
        </p>
        <dl className="mt-3 grid grid-cols-[minmax(140px,auto)_1fr] gap-x-5 gap-y-2 text-[13px]">
          {[
            ["Awaiting first call", "Uploaded, never dialled yet."],
            ["Needs retry", "We rang, nobody picked up. They will be tried again."],
            ["Completed", "The family answered and we have their feedback."],
            ["Due now", "Ready to be dialled this moment."],
            ["Retry scheduled", "Waiting out the gap before the next attempt."],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-medium">{k}</dt>
              <dd style={{ color: "var(--text-secondary)" }}>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          The table underneath lists each family with how many times they have been tried,
          when they were last called and what happened, and when the next attempt is due.
          Hover any of those times to see the exact date.
        </p>
      </Card>

      <Card>
        <H id="records" kicker="Step three">Reading call records</H>
        <Shot src="/help/calls.png" caption="Call records — every call, with what happened and what it cost." />
        <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Two columns describe what happened, and they answer different questions.
        </p>
        <div className="mt-3 flex flex-col gap-2.5 text-[13px]">
          <div className="flex items-start gap-3">
            <div className="w-[110px] shrink-0 font-medium">Status</div>
            <div style={{ color: "var(--text-secondary)" }}>
              Did the phone get answered at all. <Badge tone="good">Answered</Badge>{" "}
              <Badge tone="critical">Not answered</Badge> A small number beside it, like{" "}
              <strong>·2</strong>, means it took two attempts.
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-[110px] shrink-0 font-medium">Input</div>
            <div style={{ color: "var(--text-secondary)" }}>
              What the family pressed. <Badge tone="good">Satisfied</Badge>{" "}
              <Badge tone="critical">Dissatisfied</Badge> <Badge>Silent</Badge> — silent
              means they picked up but never pressed a key.
            </div>
          </div>
        </div>
        <p className="mt-4 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Click any row to open the full record: the report fields, how long the call took,
          what it cost, and the complete conversation if the family spoke to the assistant.
        </p>
      </Card>

      <Card>
        <H id="export" kicker="Step four">Exporting the report</H>
        <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Press <strong>↓ Export Excel</strong> on the Call records page. The file contains
          exactly the columns the foundation uses, in the foundation&rsquo;s order, and only
          the rows currently shown — so filter first if you want a subset.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Times in the export are Pakistan time and are real dates, so sorting and
          filtering in Excel work normally.
        </p>
      </Card>

      <Card>
        <H id="careful" kicker="Please read">What to be careful of</H>
        <Warn tone="critical">
          <strong>Check the phone numbers before uploading.</strong> Every row is a real
          family who will be telephoned. A wrong number means calling a stranger about a
          child who is not theirs.
        </Warn>
        <Warn tone="critical">
          <strong>Names must match the numbers.</strong> The assistant greets the family by
          the child&rsquo;s name. If the sheet has the wrong name against a number, a parent
          hears someone else&rsquo;s child named on the phone.
        </Warn>
        <Warn>
          <strong>&ldquo;A new round of calls&rdquo; will re-call people.</strong> If you
          are only fixing a typo, choose <em>correction</em> instead, or families who
          already gave feedback will be telephoned again.
        </Warn>
        <Warn>
          <strong>Uploading does not start the calling.</strong> It puts families in the
          queue. Calls go out during the configured calling hours, a few at a time.
        </Warn>
        <p className="mt-4 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          This dashboard contains patient records. Do not share your sign-in, and sign out
          on shared computers.
        </p>
      </Card>
    </div>
  );
}

function OperatorGuide() {
  return (
    <div className="flex flex-col gap-8">
      <Card>
        <H id="how" kicker="Operators">How a call works</H>
        <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          A call is an ordinary recorded menu until the moment someone reports a problem.
          Nothing intelligent is running before that, which is why a satisfied family costs
          almost nothing.
        </p>
        <pre
          className="mt-4 overflow-x-auto rounded-[10px] px-4 py-3.5 text-[12px] leading-relaxed"
          style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}
        >{`  we dial the family
        │
        ├── no answer / busy / phone off ──► retry later, up to the attempt limit
        │
        ▼
  recorded menu plays
  "press 1 if satisfied, 2 if not, 0 to hear this again"
        │
        ├── 1 ──► thank you, hang up            (no AI, no cost)
        ├── 0 ──► menu plays again
        ├── nothing ──► two reminders, then hang up politely
        │
        └── 2 ──► assistant joins the SAME call
                  asks what went wrong, in Urdu
                  files the complaint, says goodbye, hangs up`}</pre>
        <p className="mt-4 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          The <strong>AI time</strong> column on Call records is the part after 2 was
          pressed. It is the only part that costs money per minute, so a call can be long
          and still cheap.
        </p>
      </Card>

      <Card>
        <H id="settings" kicker="Operators">Retries and calling hours</H>
        <Shot src="/help/settings.png" caption="Settings — everything here takes effect on the next batch, without a restart." />
        <dl className="mt-2 grid grid-cols-[minmax(150px,auto)_1fr] gap-x-5 gap-y-2.5 text-[13px]">
          {[
            ["Simultaneous calls", "How many calls run at once. Must not exceed the number of channels the operator allows on the number — going over does not queue, the extra calls are rejected and counted as failed attempts."],
            ["Ring for", "How long an unanswered phone rings before we give up and mark it for retry."],
            ["Attempts per patient", "Including the first call. Set to 1 to never retry."],
            ["Wait before each retry", "One gap per retry. A phone that is switched off is worth trying again in half an hour; one that has been off all day is not."],
            ["Calling hours", "Calls are only placed inside this window, Pakistan time. Outside it the queue is held, not dropped."],
            ["Pause", "Stops new calls without losing the queue. Calls in progress finish normally."],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-medium">{k}</dt>
              <dd style={{ color: "var(--text-secondary)" }}>{v}</dd>
            </div>
          ))}
        </dl>
        <Warn>
          Only calls that never connected are retried — busy, unanswered, or phone switched
          off. A family who answered is never called again whatever they said, and a wrong
          number is not retried either.
        </Warn>
      </Card>

      <Card>
        <H id="costing" kicker="Operators">Costing</H>
        <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Three rates make up what a call costs, and they are visible only to accounts
          granted access.
        </p>
        <dl className="mt-3 grid grid-cols-[minmax(110px,auto)_1fr] gap-x-5 gap-y-2 text-[13px]">
          <div className="contents">
            <dt className="font-medium">Carrier</dt>
            <dd style={{ color: "var(--text-secondary)" }}>Charged on the whole call, whatever happened on it.</dd>
          </div>
          <div className="contents">
            <dt className="font-medium">Menu</dt>
            <dd style={{ color: "var(--text-secondary)" }}>Minutes before the assistant joined.</dd>
          </div>
          <div className="contents">
            <dt className="font-medium">AI</dt>
            <dd style={{ color: "var(--text-secondary)" }}>Minutes with the assistant, after 2 was pressed.</dd>
          </div>
        </dl>
        <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          A minute is either a menu minute or an AI minute, never both. A call that never
          reaches the assistant is only ever charged the first two.
        </p>
        <Warn>
          The <strong>billing pulse</strong> is not yet confirmed with the operator. If they
          bill in whole minutes rather than by the second, a short satisfied call costs
          roughly twice what the dashboard currently shows — and short satisfied calls are
          most of the volume.
        </Warn>
      </Card>

      <Card>
        <H id="trouble" kicker="Operators">When calls are not going out</H>
        <div className="mt-2 flex flex-col gap-3.5 text-[13px] leading-relaxed">
          {[
            ["The queue shows patients but nothing is dialling",
             "Check the calling hours first — outside the window the queue is held deliberately. Then check whether the dialler is running: it is a separate process from the assistant, and one can be up while the other is not."],
            ["Everyone comes back as “Not answered”",
             "If a whole batch fails identically, suspect the phone number format or the operator, not the families. A single number failing is normal; every number failing is a configuration problem."],
            ["A family was called but there is no record",
             "Records are written when the call ends. A call still in progress has no record yet."],
            ["The upload said success but the queue is empty",
             "Check the upload history table — it shows how many rows were read, added and skipped. A sheet where every row was skipped still reports as a successful upload."],
          ].map(([q, a]) => (
            <div key={q}>
              <div className="font-medium">{q}</div>
              <div className="mt-0.5" style={{ color: "var(--text-secondary)" }}>{a}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
