// Same-origin JSON client, modelled on the assistant console's. All server data
// is rendered as React text, never as HTML. Authentication is the server's job:
// this client sends the session cookie and never fakes a signed-in state.

/**
 * Why a request failed, in terms the interface can act on.
 * - offline: the browser could not reach the server at all.
 * - missing: the server answered, but this API does not exist there yet
 *   (404, 405, 501, or an HTML page where JSON was expected).
 * - auth: the server wants a signed-in owner (401, 403).
 * - server: anything else the server rejected or failed on.
 */
export type FailureKind = "offline" | "missing" | "auth" | "server"

export class ApiError extends Error {
  status: number
  kind: FailureKind
  constructor(message: string, status: number, kind: FailureKind) {
    super(message)
    this.status = status
    this.kind = kind
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = opts.method || "GET"
  const init: RequestInit = { method, credentials: "same-origin", headers: { Accept: "application/json" } }
  if (method !== "GET") {
    // The header marks a script request, so a plain cross-site form post can't
    // reach a mutating endpoint. The backend should require it.
    init.headers = { Accept: "application/json", "Content-Type": "application/json", "X-Panel-Request": "1" }
    init.body = JSON.stringify(opts.body ?? {})
  }
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError("The panel could not reach its server. Check the connection, then refresh.", 0, "offline")
  }
  if (res.status === 204) return null as T
  const text = await res.text()
  const isJson = (res.headers.get("content-type") || "").includes("json")
  let data: unknown = undefined
  if (text && isJson) {
    try {
      data = JSON.parse(text)
    } catch {
      /* handled below */
    }
  }
  if (!res.ok) {
    const serverError = data && typeof data === "object" && "error" in data ? String((data as { error: unknown }).error) : ""
    if (res.status === 401 || res.status === 403)
      throw new ApiError(serverError || "Sign in as the owner to manage settings.", res.status, "auth")
    if (res.status === 404 || res.status === 405 || res.status === 501)
      throw new ApiError(serverError || `The server has no ${method} ${path} yet.`, res.status, "missing")
    if (res.status === 502 || res.status === 503 || res.status === 504)
      throw new ApiError(serverError || `The settings service is not responding (${res.status}).`, res.status, "offline")
    throw new ApiError(serverError || `The server answered ${res.status}.`, res.status, "server")
  }
  // A static host answering every path with index.html means the API is absent.
  if (data === undefined && text)
    throw new ApiError(`${path} returned a web page instead of data. The settings API is not installed here.`, res.status, "missing")
  return (data ?? null) as T
}

export const failure = (e: unknown): ApiError =>
  e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : String(e), 0, "server")
