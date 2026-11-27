const TZ = "Africa/Cairo";

function offsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

export function cairoToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

export function isValidDay(day: string | undefined): day is string {
  return !!day && /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day));
}

/** Start (inclusive) and end (exclusive) of a Cairo calendar day as ISO strings. */
export function cairoDayRange(day: string): { from: string; to: string } {
  const [y, m, d] = day.split("-").map(Number);
  const bound = (dd: number) => {
    const guess = new Date(Date.UTC(y, m - 1, dd, 0, 0, 0));
    const off = offsetMinutes(new Date(guess.getTime() - offsetMinutes(guess) * 60000));
    return new Date(guess.getTime() - off * 60000).toISOString();
  };
  return { from: bound(d), to: bound(d + 1) };
}
