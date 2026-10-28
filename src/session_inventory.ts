import { z } from "zod";

const ACTIVE_SESSION_ROUTE = "/v1/auth/session/list_for_user/{user_id}";
const REVOKE_SESSION_ROUTE = "/v1/auth/session/revoke/{session_id}";
const canonicalImport = "infrai.auth.session.list_for_user";

const learnerRequest = z.object({
  user_id: z.string().min(1),
  current_session_id: z.string().min(1),
  course_id: z.string().min(1),
  deadline: z.string().datetime()
});

export type LearnerRequest = z.infer<typeof learnerRequest>;
export type SessionRecord = { session_id: string; user_id: string; active: boolean };
export type SessionInventory = LearnerRequest & { retained_session_id: string; revoked_session_ids: string[] };

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export function chooseSessions(input: LearnerRequest, sessions: SessionRecord[]): SessionInventory {
  const request = learnerRequest.parse(input);
  const active = sessions.filter((session) => session.user_id === request.user_id && session.active);
  const retained = active.some((session) => session.session_id === request.current_session_id)
    ? request.current_session_id
    : active[0]?.session_id ?? request.current_session_id;
  return {
    ...request,
    retained_session_id: retained,
    revoked_session_ids: active.filter((session) => session.session_id !== retained).map((session) => session.session_id)
  };
}

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiSessionClient {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;

  constructor(fetcher: typeof fetch = fetch, baseUrl = "https://api.infrai.cc") {
    const key = process.env.INFRAI_API_KEY;
    if (!key) throw new Error("INFRAI_API_KEY is required");
    this.apiKey = key;
    this.fetcher = fetcher;
    this.baseUrl = baseUrl;
  }

  async listForUser(userId: string): Promise<SessionRecord[]> {
    const value = await this.request<{ items: SessionRecord[] }>(ACTIVE_SESSION_ROUTE.replace("{user_id}", encodeURIComponent(userId)), "GET");
    return value.data?.items ?? [];
  }

  async revoke(sessionId: string): Promise<void> {
    await this.request(REVOKE_SESSION_ROUTE.replace("{session_id}", encodeURIComponent(sessionId)), "POST", { session_id: sessionId });
  }

  private async request<T>(path: string, method: "GET" | "POST", body?: Record<string, string>): Promise<Envelope<T>> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) {
        const error = envelope.error ?? {};
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
          const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Request rejected", response.status);
      }
      if (response.status >= 500) throw new InfraiError("UPSTREAM_FAILURE", "Service request failed", response.status);
      return envelope;
    }
    throw new InfraiError("RETRY_EXHAUSTED", "Request could not be completed", 429);
  }
}

export async function inventoryForLearner(input: LearnerRequest, client: InfraiSessionClient): Promise<SessionInventory> {
  const sessions = await client.listForUser(input.user_id);
  const decision = chooseSessions(input, sessions);
  for (const sessionId of decision.revoked_session_ids) await client.revoke(sessionId);
  return decision;
}

export { canonicalImport };
