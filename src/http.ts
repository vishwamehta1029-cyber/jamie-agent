import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./server.js";
import { renderBrain } from "./brain.js";
import { loadSeed } from "./seed.js";
import { loadItems, portfolioFeed } from "./stylist.js";
import { buildModel, renderPdf } from "./stylistResume.js";

function secretOk(given: string | undefined): boolean {
  const want = process.env.JAMIE_SECRET;
  if (!want || want.length < 24 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parse(req: IncomingMessage): { secret?: string; view: string; variant?: string } {
  const url = new URL(req.url || "/", "http://x");
  if (/^\/public\/portfolio\.json$/.test(url.pathname)) return { view: "portfolio" };
  const r = url.pathname.match(/^\/([^/]+)\/resume\/([a-z_]+?)(?:\.pdf)?\/?$/);
  if (r) return { secret: r[1], view: "resume", variant: r[2] };
  const m = url.pathname.match(/^\/([^/]+)\/(mcp|brain|seed)\/?$/);
  return {
    secret: url.searchParams.get("k") || m?.[1],
    view: url.searchParams.get("view") || m?.[2] || "mcp",
    variant: url.searchParams.get("variant") || undefined,
  };
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
  const { secret, view, variant } = parse(req);

  // Public, read-only: the portfolio's approved content (nothing private is in it)
  if (req.method === "GET" && view === "portfolio") {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=300");
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify(portfolioFeed(await loadItems())));
    } catch (e: any) {
      console.error(e);
      return text(res, 500, "{}", "application/json");
    }
  }

  if (!secretOk(secret)) return text(res, 404, "Not found");

  if (req.method === "GET" && view === "resume") {
    const surface = `resume:${variant}`;
    if (!["resume:fde", "resume:ai_engineer", "resume:gtm"].includes(surface)) return text(res, 404, "Unknown resume");
    try {
      const { pdf } = await renderPdf(buildModel(await loadItems(), surface));
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Vishwa_Mehta_Resume_${variant}.pdf"`);
      res.setHeader("Cache-Control", "no-store");
      return res.end(pdf);
    } catch (e: any) {
      console.error(e);
      return text(res, 500, "Resume unavailable: " + (e?.message || "error"));
    }
  }

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
