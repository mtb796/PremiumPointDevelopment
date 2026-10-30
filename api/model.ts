/**
 * /api/model — the ONLY place the Anthropic API is called. The key stays in an
 * environment variable server-side and is never exposed to the browser (handoff: model
 * access). The model name is a setting; claude-sonnet-5-5 is a sensible default.
 *
 * The AI layer only proposes and explains inputs; it never computes a number that appears
 * in the output, and it never supplies, infers, or fills in a zoning value. Callers must
 * keep that contract — this proxy just forwards the prompt.
 */
import { notAvailable, type Req, type Res } from "./_shared.js";

const API_URL = "https://api.anthropic.com/v1/messages";

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return notAvailable(res, "model", "ANTHROPIC_API_KEY is not configured");

  const model = process.env.MODEL_NAME || "claude-sonnet-5-5";
  const body = (req.body ?? {}) as { messages?: unknown; system?: string; max_tokens?: number };
  if (!body.messages) {
    res.status(400).json({ error: "messages is required" });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const r = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens: body.max_tokens ?? 1024, system: body.system, messages: body.messages }),
    });
    clearTimeout(timer);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    clearTimeout(timer);
    notAvailable(res, "model", e instanceof Error ? e.message : "request failed");
  }
}
