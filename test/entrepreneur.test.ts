// Unit tests for Entrepreneur's pure rules. Run: npm test (Node 22.18+ runs the TypeScript directly).
// Templates here are synthetic stand-ins with the same placeholders; the real one lives in the answer bank.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  fillTemplate, stripRules, extractCard, checkWhyLine, fallbackWhyLine, qualifies, normalizeYc, agentTerms, isUSCompany,
  batchKey, byNewestBatch, dedupeFounders, founderEmailFrom, emailsOnPage, parseCompanyPage, parseAlgoliaOpts, buildMime,
  bounceRecipients, isGmailStop, PORTFOLIO_URL, type FounderIn,
} from "../src/entrepreneurRules.ts";

const TEMPLATE = [
  "Subject: Coffee chat about [COMPANY]",
  "",
  "Hey [FOUNDER FIRST NAME],",
  "",
  "I came across [COMPANY], and I am really interested in [WHY LINE].",
  "",
  "Second paragraph.",
  "",
  "[portfolio card with thumbnail]",
  "",
  "Thank you,",
  "Sender",
  "",
  '[Rules: fill only [COMPANY], [FOUNDER FIRST NAME] and [WHY LINE]. On a site: replace [portfolio card with thumbnail] with a link.]',
].join("\n");
const CARD_ANSWER = 'Intro text\n[REQUIRED CARD:]\n<table role="presentation" width="520"><tr><td><a href="https://example.test/"><img src="https://img.test/x.png"></a></td></tr></table>\n\nThank you';
const CARD = extractCard(CARD_ANSWER)!;

test("extractCard pulls the <table> block from answer #1", () => {
  assert.ok(CARD.startsWith("<table"));
  assert.ok(CARD.endsWith("</table>"));
  assert.equal(extractCard("no card here"), null);
});

test("stripRules drops the trailing [Rules: ...] block, nested brackets included", () => {
  const s = stripRules(TEMPLATE);
  assert.ok(!s.includes("Rules"));
  assert.ok(s.endsWith("Sender"));
  assert.equal(stripRules("plain"), "plain");
});

test("fillTemplate fills placeholders, subject, card and plain-text link", () => {
  const f = fillTemplate(TEMPLATE, { first: "Ada", company: "Acme & Co", why: "how you are using agents to automate claims" }, CARD);
  assert.equal(f.subject, "Coffee chat about Acme & Co");
  assert.ok(f.text.startsWith("Hey Ada,"));
  assert.ok(!f.text.includes("Subject:"));
  assert.ok(f.text.includes("I am really interested in how you are using agents to automate claims."));
  assert.ok(f.text.includes(PORTFOLIO_URL));
  assert.ok(!f.text.includes("[portfolio card"));
  assert.ok(!/\[(COMPANY|FOUNDER FIRST NAME|WHY LINE|Rules)/.test(f.text + f.html));
  // HTML: card swapped in, names escaped, blank lines become paragraphs, single newlines <br>
  assert.ok(f.html.includes(CARD));
  assert.ok(!f.html.includes(PORTFOLIO_URL));
  assert.ok(f.html.includes("Acme &amp; Co"));
  assert.ok(f.html.includes("Thank you,<br>Sender"));
  assert.equal((f.html.match(/<p /g) ?? []).length, 4);
});

test("fillTemplate defaults the subject when the template has none", () => {
  const f = fillTemplate("Hi [FOUNDER FIRST NAME] at [COMPANY], [WHY LINE]", { first: "A", company: "B", why: "c" }, CARD);
  assert.equal(f.subject, "Coffee chat about B");
});

test("checkWhyLine accepts a good line and cleans echoes and periods", () => {
  const src = "AI agents that automate insurance claims for carriers";
  const v = checkWhyLine('"I am really interested in how you are using agents to automate insurance claims."', src);
  assert.equal(v.ok, true, v.problems.join());
  assert.equal(v.line, "how you are using agents to automate insurance claims");
  assert.equal(checkWhyLine("AI agents for claims", src).ok, true); // acronym start is fine
});

test("checkWhyLine rejects dashes, invented numbers, length, capitals, multiple lines", () => {
  const src = "Voice agents for 24/7 dental front desks";
  assert.equal(checkWhyLine("how you handle calls — at scale", src).ok, false);
  assert.equal(checkWhyLine("how you handle calls – at scale", src).ok, false);
  assert.equal(checkWhyLine("how you answer 24 hours a day", src).ok, true);
  assert.equal(checkWhyLine("how you save clinics 40 hours", src).ok, false);
  assert.equal(checkWhyLine("x".repeat(121), src).ok, false);
  assert.equal(checkWhyLine("How you answer calls", src).ok, false);
  assert.equal(checkWhyLine("how you answer\ncalls", src).ok, false);
  assert.equal(checkWhyLine("", src).ok, false);
});

test("fallbackWhyLine always passes the checks", () => {
  const cases: [string | null, string][] = [
    ["Automates insurance claims with AI agents.", "Claimly"],
    ["AI agents for dental front desks", "Dentra"],
    ["The browser agent for enterprise ops — fast", "Opsy"],
    ["Pushes code reviews to autonomous agents", "Revvy"],
    [null, "Nothing"],
    ["A".repeat(10) + " " + "very long words ".repeat(20), "Long"],
  ];
  for (const [ol, name] of cases) {
    const line = fallbackWhyLine(ol, name);
    const v = checkWhyLine(line, ol ?? "");
    assert.equal(v.ok, true, `${line} -> ${v.problems.join(", ")}`);
  }
  assert.equal(fallbackWhyLine("Automates insurance claims with AI agents.", "X"), "how you automate insurance claims with AI agents");
  assert.equal(fallbackWhyLine("Pushes code to agents", "X"), "how you push code to agents");
  assert.equal(fallbackWhyLine("AI agents for dental front desks", "X"), "what you are building with AI agents for dental front desks");
});

const hit = (o: Record<string, unknown>) =>
  normalizeYc({ slug: "acme", name: "Acme", status: "Active", batch: "Fall 2025", one_liner: "AI agents for claims", all_locations: "San Francisco, CA, USA", regions: ["United States of America", "America / Canada"], ...o })!;

test("qualifies: active, US, not acquired, agent terms", () => {
  assert.equal(qualifies(hit({})).ok, true);
  assert.equal(qualifies(hit({ status: "Acquired" })).ok, false);
  assert.equal(qualifies(hit({ status: "Inactive" })).ok, false);
  assert.equal(qualifies(hit({ all_locations: "London, England, United Kingdom", regions: ["United Kingdom", "Europe"] })).ok, false);
  assert.equal(qualifies(hit({ all_locations: "Austin, TX, USA", regions: [] })).ok, true);
  assert.equal(qualifies(hit({ one_liner: "Payroll software for restaurants", long_description: "" })).ok, false);
});

test("agentTerms: rule-based agent match, human agents need AI context", () => {
  assert.deepEqual(agentTerms("Agentic AI for finance teams").includes("agentic"), true);
  assert.ok(agentTerms("Voice agents that answer calls with AI").includes("voice agents"));
  assert.ok(agentTerms("AI employees for back office work").includes("ai employees"));
  assert.ok(agentTerms("Browser agents powered by LLMs").includes("browser agents"));
  assert.deepEqual(agentTerms("CRM for real estate agents"), []);
  assert.deepEqual(agentTerms("CRM for real estate agents, with AI scheduling"), []);
  assert.ok(agentTerms("AI agents for real estate agents").length > 0);
});

test("isUSCompany uses regions or locations", () => {
  assert.equal(isUSCompany({ location: null, regions: ["United States of America"] }), true);
  assert.equal(isUSCompany({ location: "New York, NY, USA", regions: [] }), true);
  assert.equal(isUSCompany({ location: "Bengaluru, KA, India", regions: ["India"] }), false);
  assert.equal(isUSCompany({ location: null, regions: [] }), false);
});

test("batches sort newest first", () => {
  assert.equal(batchKey("Fall 2025"), 20254);
  assert.equal(batchKey("W24"), 20241);
  assert.equal(batchKey("X25"), 20252);
  assert.equal(batchKey(null), null);
  const list = [{ batch: "Winter 2023", name: "a" }, { batch: null, name: "b" }, { batch: "Summer 2025", name: "c" }, { batch: "Spring 2025", name: "d" }];
  assert.deepEqual(list.sort(byNewestBatch).map((x) => x.name), ["c", "d", "a", "b"]);
});

const F = (name: string, extra: Partial<FounderIn> = {}): FounderIn => ({ name, first_name: name.split(" ")[0], last_name: name.split(" ")[1], title: "Founder", linkedin_url: null, twitter_url: null, email: null, ...extra });

test("dedupeFounders: never the same person twice", () => {
  const out = dedupeFounders([
    F("Ada Lovelace", { linkedin_url: "https://linkedin.com/in/ada/" }),
    F("ada lovelace"),
    F("Ada L", { linkedin_url: "https://linkedin.com/in/ada" }),
    F("Grace Hopper", { email: "g@x.com" }),
    F("Grace H", { email: "G@x.com" }),
    F("Alan Turing"),
    F("Known Person"),
  ], 10, { names: ["Known Person"] });
  assert.deepEqual(out.map((f) => f.name), ["Ada Lovelace", "Grace Hopper", "Alan Turing"]);
  assert.equal(dedupeFounders([F("A B"), F("C D"), F("E F")], 2).length, 2);
});

test("schema dedupes founders and emails with unique indexes", () => {
  const schema = readFileSync(new URL("../src/schema.ts", import.meta.url), "utf8");
  assert.match(schema, /UNIQUE INDEX IF NOT EXISTS ent_founders_name_idx ON ent_founders \(company_id, lower\(name\)\)/);
  assert.match(schema, /UNIQUE INDEX IF NOT EXISTS ent_founders_email_idx ON ent_founders \(lower\(email\)\)/);
  assert.match(schema, /'entrepreneur_enabled', 'false'/);
});

test("public emails: only the founder's own address on the company domain", () => {
  const html = '<a href="mailto:hello@acme.ai">hi</a> ada@acme.ai jobs@acme.ai x@other.com logo@2x.png';
  const emails = emailsOnPage(html, "acme.ai");
  assert.deepEqual(emails.sort(), ["ada@acme.ai", "hello@acme.ai", "jobs@acme.ai"]);
  assert.equal(founderEmailFrom(emails, "Ada", "Lovelace"), "ada@acme.ai");
  assert.equal(founderEmailFrom(emails, "Grace", "Hopper"), null);
});

test("parseCompanyPage reads the embedded data-page JSON", () => {
  const data = {
    props: {
      company: {
        name: "Acme", slug: "acme", batch_name: "Fall 2025", one_liner: "AI agents", website: "https://www.acme.ai", status: "Active",
        location: "San Francisco, CA, USA", team_size: 4,
        founders: [
          { full_name: "Ada Lovelace", title: "CEO", linkedin_url: "https://www.linkedin.com/in/ada", twitter_url: "https://x.com/ada", is_active: true },
          { full_name: "Gone Founder", title: "CTO", is_active: false },
          { full_name: "Mononym" },
        ],
      },
    },
  };
  const html = `<div id="app" data-page="${JSON.stringify(data).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"></div>`;
  const p = parseCompanyPage(html)!;
  assert.equal(p.company!.domain, "acme.ai");
  assert.equal(p.company!.batch, "Fall 2025");
  assert.deepEqual(p.founders.map((f) => [f.first_name, f.title]), [["Ada", "CEO"]]);
  assert.equal(parseCompanyPage("<html></html>"), null);
});

test("parseAlgoliaOpts reads the public directory config", () => {
  assert.deepEqual(parseAlgoliaOpts('<script>window.AlgoliaOpts = {"app":"APPID","key":"searchkey"};</script>'), { app: "APPID", key: "searchkey" });
  assert.equal(parseAlgoliaOpts("<script></script>"), null);
});

test("buildMime is multipart text + HTML in base64url", () => {
  const raw = buildMime({ from: "Me <me@x.com>", to: "a@b.com", subject: "Coffee chat about Café", text: "hi", html: "<p>hi</p>" }, "BOUND");
  const mime = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(mime, /Content-Type: multipart\/alternative; boundary="BOUND"/);
  assert.match(mime, /text\/plain/);
  assert.match(mime, /text\/html/);
  assert.match(mime, /Subject: =\?UTF-8\?B\?/);
  assert.ok(!raw.includes("+") && !raw.includes("/"));
});

test("bounce parsing and Gmail stop errors", () => {
  const msg = { snippet: "Address not found. Your message wasn't delivered to ada@acme.ai", payload: { headers: [{ name: "X-Failed-Recipients", value: "ada@acme.ai" }], parts: [] } };
  assert.ok(bounceRecipients(msg).includes("ada@acme.ai"));
  assert.equal(isGmailStop(429, ""), true);
  assert.equal(isGmailStop(403, '{"reason":"dailyLimitExceeded"}'), true);
  assert.equal(isGmailStop(400, "invalid to"), false);
});
