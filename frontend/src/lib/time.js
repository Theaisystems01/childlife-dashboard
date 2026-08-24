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
