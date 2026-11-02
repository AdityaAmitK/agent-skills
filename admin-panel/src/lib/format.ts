const clock = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
const longTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

export const words = (s?: string) => String(s || "").replace(/[_-]+/g, " ").trim()
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`
export const time = (d: Date) => clock.format(d)

/** Seconds or milliseconds since the epoch, or an ISO string. */
export function when(v?: string | number) {
  if (v === undefined || v === null || v === "") return ""
  const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : longTime.format(d)
}

export const shortHash = (h?: string) => (h ? h.replace(/^sha256:/, "").slice(0, 10) : "")
