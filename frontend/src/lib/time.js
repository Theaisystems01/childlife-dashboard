/**
 * Every timestamp the foundation reads is Pakistan time.
 *
 * The API returns UTC ISO strings. Rendering them with the browser's own timezone means
 * a call looks like it happened at a different hour depending on who opens the
 * dashboard, so the zone is pinned rather than inherited.
 */

export const PK_TIME_ZONE = "Asia/Karachi";

export function formatWhen(iso) {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-PK", {
    timeZone: PK_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * "12 min ago" / "in 2 hr" — what a queue actually needs. Absolute times are still
 * available on hover via formatWhen().
 */
export function formatRelative(iso) {
  if (!iso) return "\u2014";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;

  const seconds = Math.round((then - Date.now()) / 1000);
  const future = seconds > 0;
  const abs = Math.abs(seconds);

  const say = (n, unit) => {
    const word = n === 1 ? unit : `${unit}s`;
    return future ? `in ${n} ${word}` : `${n} ${word} ago`;
  };
  if (abs < 45) return future ? "in a moment" : "just now";
  if (abs < 3600) return say(Math.round(abs / 60), "min");
  if (abs < 86400) return say(Math.round(abs / 3600), "hr");
  return say(Math.round(abs / 86400), "day");
}
