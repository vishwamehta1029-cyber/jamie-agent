import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./server.js";
import { renderBrain } from "./brain.js";
import { loadSeed } from "./seed.js";

function secretOk(given: string | undefined): boolean {
  const want = process.env.JAMIE_SECRET;
  if (!want || want.length < 24 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parse(req: IncomingMessage): { secret?: string; view: string } {
  const url = new URL(req.url || "/", "http://x");
  const m = url.pathname.match(/^\/([^/]+)\/(mcp|brain|seed)\/?$/);
  return { secret: url.searchParams.get("k") || m?.[1], view: url.searchParams.get("view") || m?.[2] || "mcp" };
}

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  if (req.body !== undefined) return req.body;
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
}

function text(res: ServerResponse, code: number, body: string, type = "text/plain") {
  res.statusCode = code;
  res.setHeader("Content-Type", `${type}; charset=utf-8`);
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

export async function handle(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  const { secret, view } = parse(req);
  if (!secretOk(secret)) return text(res, 404, "Not found");

  if (req.method === "GET" && view === "brain") {
    try {
      return text(res, 200, await renderBrain(), "text/markdown");
    } catch (e: any) {
      console.error(e);
      return text(res, 500, "Brain unavailable: " + (e?.message || "error"));
    }
  }
  if (req.method === "GET" && view === "seed") {
    try {
      return text(res, 200, await loadSeed());
    } catch (e: any) {
      console.error(e);
      return text(res, 500, "Seed failed: " + (e?.message || "error"));
    }
  }
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }));
    return;
  }
  try {
    const body = await readBody(req);
    const server = buildServer();
    server.registerTool(
      "jamie_get_brain",
      {
        description:
          "Return Jamie's ENTIRE brain as Markdown: every fact, answer, application, contact, pattern, send, Apollo use, lesson, handoff, and setting. Jamie knows only what is in here. Call after any write so the brain file shown to Vishwa is refreshed.",
        inputSchema: {},
      },
      async () => ({ content: [{ type: "text" as const, text: await renderBrain() }] })
    );
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req as any, res, body);
  } catch (e: any) {
    console.error(e);
    if (!res.headersSent) text(res, 500, JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null }), "application/json");
  }
}
