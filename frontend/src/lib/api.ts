import type { AnalyzeResult, StreamEvent, UpgradeResult } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const UNREACHABLE =
  "Couldn't reach the Nexus API. If it has been idle, it may still be starting up. Try again in a minute.";

async function request(path: string, body: unknown): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(UNREACHABLE);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `Request failed with status ${res.status}`);
  }
  return res;
}

/** Runs an analysis, calling onEvent for each progress event the API streams back. */
export async function streamAnalysis(
  body: { repo_url: string; github_token: string },
  onEvent: (event: StreamEvent) => void
): Promise<AnalyzeResult> {
  const res = await request("/api/analyze/stream", body);
  if (!res.body) throw new Error("This browser doesn't support streaming responses.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch {
      throw new Error("The connection dropped before the analysis finished. Please try again.");
    }
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });

    // Server-Sent Events are separated by a blank line
    const messages = buffer.split("\n\n");
    buffer = messages.pop() ?? "";
    for (const message of messages) {
      const data = message.split("\n").find((line) => line.startsWith("data: "));
      if (!data) continue;
      const event = JSON.parse(data.slice(6)) as StreamEvent;
      if (event.type === "error") throw new Error(event.message);
      onEvent(event);
      if (event.type === "result") return event.data;
    }
  }
  throw new Error("The connection closed before the analysis finished. Please try again.");
}

export async function createPullRequest(body: {
  repo_url: string;
  plan: unknown[];
  github_token: string;
}): Promise<UpgradeResult> {
  const res = await request("/api/upgrade", body);
  return res.json();
}
