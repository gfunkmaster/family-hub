/**
 * Claude via Messages API med de inbyggda verktygen web_search och web_fetch.
 * Ingen SDK: ett enda POST-anrop per varv. `pause_turn` betyder att en lång sökning pausats;
 * då skickas svaret tillbaka oförändrat och Claude fortsätter.
 */
import { emptyUsage, type FetchLog, type LlmProvider, type LlmResult, type LlmUsage, type ResearchInput } from "./types.ts";

type Block = { type: string; text?: string; [k: string]: unknown };
interface MessagesResponse {
  content: Block[];
  stop_reason: string;
  model: string;
  usage?: {
    input_tokens?: number; output_tokens?: number;
    cache_read_input_tokens?: number; cache_creation_input_tokens?: number;
    server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number };
  };
}

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  maxContinuations?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

function addUsage(total: LlmUsage, u: MessagesResponse["usage"]): void {
  if (!u) return;
  total.inputTokens += u.input_tokens ?? 0;
  total.outputTokens += u.output_tokens ?? 0;
  total.cacheReadTokens += u.cache_read_input_tokens ?? 0;
  total.cacheWriteTokens += u.cache_creation_input_tokens ?? 0;
  total.webSearches += u.server_tool_use?.web_search_requests ?? 0;
  total.webFetches += u.server_tool_use?.web_fetch_requests ?? 0;
}

/** Plockar ut vilka sidor som hämtades (och vilka som nekades) ur verktygssvaren i ett svar. */
export function fetchLogFrom(content: Block[]): FetchLog[] {
  const out: FetchLog[] = [];
  for (const b of content) {
    if (b.type !== "web_fetch_tool_result") continue;
    const c = b.content as { type?: string; url?: string; error_code?: string } | undefined;
    if (!c) continue;
    if (c.type === "web_fetch_tool_result_error") out.push({ url: typeof c.url === "string" ? c.url : "", ok: false, error: c.error_code ?? "okänt fel" });
    else if (typeof c.url === "string") out.push({ url: c.url, ok: true });
  }
  return out;
}

export class AnthropicError extends Error {
  readonly status: number;
  readonly usage: LlmUsage;
  constructor(message: string, status: number, usage: LlmUsage) { super(message); this.status = status; this.usage = usage; }
}

export function createAnthropicProvider(opts: AnthropicOptions): LlmProvider {
  const doFetch = opts.fetchImpl ?? fetch;
  const maxContinuations = opts.maxContinuations ?? 8;
  return {
    name: "anthropic",
    model: opts.model,
    async research(input: ResearchInput): Promise<LlmResult> {
      const tools: Record<string, unknown>[] = [
        { type: "web_search_20250305", name: "web_search", max_uses: input.maxSearches, ...(input.location ? { user_location: { type: "approximate", ...input.location } } : {}) },
        { type: "web_fetch_20250910", name: "web_fetch", max_uses: input.maxFetches, max_content_tokens: 15000 },
      ];
      const messages: { role: "user" | "assistant"; content: string | Block[] }[] = [{ role: "user", content: input.prompt }];
      const usage = emptyUsage();
      const fetched: FetchLog[] = [];
      for (let turn = 0; turn <= maxContinuations; turn++) {
        const res = await doFetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: opts.model, max_tokens: opts.maxTokens ?? 16000, system: input.system, messages, tools }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 300_000),
        });
        const body = (await res.json().catch(() => null)) as (MessagesResponse & { error?: { message?: string } }) | null;
        if (!res.ok || !body) throw new AnthropicError(`Claude API svarade ${res.status}: ${body?.error?.message ?? "okänt fel"}`, res.status, usage);
        addUsage(usage, body.usage);
        fetched.push(...fetchLogFrom(body.content));
        if (body.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: body.content }); continue; }
        const text = body.content.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("");
        return { text, fetched, usage, model: body.model ?? opts.model, stopReason: body.stop_reason };
      }
      throw new AnthropicError(`Sökningen pausades fler än ${maxContinuations} gånger`, 0, usage);
    },
  };
}
