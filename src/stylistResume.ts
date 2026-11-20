// Renders a one-page resume PDF from Stylist's items in Vishwa's own template. Pure code (pdfkit), no LLM.
// Template measured from her originals (LibreOffice, Liberation Serif): Times serif, 0.5in margins,
// left-aligned name, navy headline, navy uppercase section headings over a full-width navy rule.
import PDFDocument from "pdfkit";

export type Item = {
  key: string;
  kind: string;
  parent_key: string | null;
  surfaces: string[];
  content: any;
  fact_ids: number[];
  order_no: number;
  active: boolean;
};

export type Link = { label: string; url: string };

export const RESUME_SURFACES = ["resume:fde", "resume:ai_engineer", "resume:gtm"] as const;

export type ResumeModel = {
  header: { name?: string; headline?: string; email?: string; phone?: string; location?: string; links: Link[] };
  summary: { text?: string; bullets?: string[] } | null;
  education: { school: string; degree: string; end: string }[];
  skills: { label: string; items: string[] }[];
  roles: { title: string; orgline: string; dates: string; bullets: string[] }[];
  projects: { name: string; name_url?: string; stack?: string; links: Link[]; text: string }[];
};

const asLinks = (v: any): Link[] =>
  Array.isArray(v) ? v.filter((l) => l && (l.url || typeof l === "string")).map((l) => (typeof l === "string" ? { label: l, url: l } : l)) : [];

export function buildModel(items: Item[], surface: string): ResumeModel {
  const on = items.filter((i) => i.active && i.surfaces.includes(surface)).sort((a, b) => a.order_no - b.order_no);
  const kids = (k: string) => on.filter((i) => i.kind === "bullet" && i.parent_key === k).map((i) => String(i.content.text));
  const h = on.find((i) => i.kind === "header")?.content ?? {};
  const s = on.find((i) => i.kind === "summary")?.content;
  return {
    header: { name: h.name, headline: h.headline_by_surface?.[surface] ?? h.headline, email: h.email, phone: h.phone, location: h.location, links: asLinks(h.links) },
    summary: s ? (Array.isArray(s.bullets) ? { bullets: s.bullets } : { text: s.text }) : null,
    education: on.filter((i) => i.kind === "education").map((e) => ({ school: e.content.school, degree: e.content.degree, end: e.content.end ?? "" })),
    skills: on.filter((i) => i.kind === "skill_group").map((g) => ({ label: g.content.label, items: g.content.items ?? [] })),
    roles: on.filter((i) => i.kind === "role").map((r) => ({
      title: r.content.title_by_surface?.[surface] ?? r.content.title,
      orgline: r.content.orgline ?? [r.content.org, r.content.location ? `(${r.content.location})` : ""].filter(Boolean).join(" "),
      dates: [r.content.start, r.content.end].filter(Boolean).join(" - "),
      bullets: kids(r.key),
    })),
    projects: on.filter((i) => i.kind === "project").map((p) => ({
      name: p.content.name,
      name_url: p.content.name_url,
      stack: p.content.stack,
      links: asLinks(p.content.links),
      text: [p.content.text, ...kids(p.key)].filter(Boolean).join(" "),
    })),
  };
}

export function modelToText(m: ResumeModel): string {
  const h = m.header;
  const out: string[] = [h.name ?? "", h.headline ?? "", [h.email, h.phone, ...h.links.map((l) => `${l.label}: ${l.url}`), h.location].filter(Boolean).join(" | "), ""];
  if (m.summary) {
    out.push("SUMMARY");
    if (m.summary.bullets) for (const b of m.summary.bullets) out.push(`- ${b}`);
    else out.push(m.summary.text ?? "");
    out.push("");
  }
  out.push("EDUCATION");
  for (const e of m.education) out.push(`${e.school} | ${e.end}`, `  ${e.degree}`);
  out.push("", "SKILLS");
  for (const s of m.skills) out.push(`${s.label}: ${s.items.join(", ")}`);
  out.push("", "EXPERIENCE");
  for (const r of m.roles) {
    out.push(`${r.title} | ${r.dates}`, `  ${r.orgline}`);
    for (const b of r.bullets) out.push(`- ${b}`);
  }
  if (m.projects.length) {
    out.push("", "PROJECTS");
    for (const p of m.projects) {
      const links = [p.name_url ? `${p.name}: ${p.name_url}` : "", ...p.links.map((l) => `${l.label}: ${l.url}`)].filter(Boolean);
      out.push(`- ${p.name}${p.stack ? ` (${p.stack})` : ""}: ${p.text}${links.length ? ` [${links.join(" | ")}]` : ""}`);
    }
  }
  return out.join("\n");
}

// Her template, measured from the original PDFs (points)
const NAVY = "#1F3864";   // headline, section headings, rules
const LINK = "#0563C1";   // hyperlinks
const BLACK = "#000000";
const MARGIN = 36;        // 0.5in on every side
const BODY = 9.5;
const PITCH = 10.95;      // body line spacing
const F = { r: "Times-Roman", b: "Times-Bold", i: "Times-Italic" };

type Run = { text: string; font: string; url?: string };

export async function renderPdf(m: ResumeModel): Promise<{ pdf: Buffer; pages: number }> {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 28, bottom: 18, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: { Title: `${m.header.name ?? "Resume"}` },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((res) => doc.on("end", () => res()));
  const L = MARGIN;
  const W = doc.page.width - 2 * MARGIN;
  // pdfkit measures continued text word by word but renders it with space kerning (e.g. "space A"),
  // which drifts the start of the next styled run. Drop kern pairs that involve a space so both agree.
  for (const f of Object.values(F)) {
    doc.font(f);
    const afm = (doc as any)._font?.font;
    if (afm?.kernPairs) for (const k of Object.keys(afm.kernPairs)) if (/(^|\0)space(\0|$)/.test(k)) delete afm.kernPairs[k];
  }
  doc.font(F.r).fontSize(BODY);
  const GAP = Math.max(0, PITCH - doc.currentLineHeight(true));

  // Mixed-style paragraph (bold / italic / regular / link runs) wrapped inside [x, x+w]
  const para = (input: Run[], x: number, w: number) => {
    // Merge neighbouring runs of the same style; pdfkit can break lines at run boundaries
    const runs: Run[] = [];
    for (const r of input.filter((r) => r.text)) {
      const prev = runs[runs.length - 1];
      if (prev && prev.font === r.font && prev.url === r.url) prev.text += r.text;
      else runs.push({ ...r });
    }
    doc.fontSize(BODY);
    runs.forEach((r, idx) => {
      const last = idx === runs.length - 1;
      doc.font(r.font).fillColor(r.url ? LINK : BLACK);
      const opts: any = { continued: !last, lineGap: GAP, underline: !!r.url, link: r.url ?? null };
      if (idx === 0) doc.text(r.text, x, doc.y, { ...opts, width: w });
      else doc.text(r.text, opts);
    });
    doc.fillColor(BLACK);
  };

  const section = (title: string) => {
    doc.y += 5.35;
    const top = doc.y;
    doc.font(F.b).fontSize(12).fillColor(NAVY).text(title.toUpperCase(), L, top, { lineBreak: false });
    doc.moveTo(L, top + 13.4).lineTo(L + W, top + 13.4).lineWidth(0.75).strokeColor(NAVY).stroke();
    doc.y = top + 17.2;
    doc.fillColor(BLACK);
  };

  // Bold left text with bold right-aligned text on the same line
  const splitRow = (left: string, right: string) => {
    const y = doc.y;
    doc.font(F.b).fontSize(BODY).fillColor(BLACK);
    if (right) doc.text(right, L, y, { width: W, align: "right", lineBreak: false });
    doc.text(left, L, y, { width: W - (right ? doc.widthOfString(right) + 12 : 0), lineGap: GAP });
  };

  const bullet = (runs: Run[]) => {
    const y = doc.y;
    doc.font(F.r).fontSize(BODY).fillColor(BLACK).text("•", L + 14.4, y, { lineBreak: false });
    doc.y = y;
    para(runs, L + 25.2, W - 25.2);
  };

  // Header
  const h = m.header;
  doc.font(F.b).fontSize(20).fillColor(BLACK).text(h.name ?? "", L, 30, { lineBreak: false });
  doc.y = 28 + 21.6;
  if (h.headline) { doc.font(F.b).fontSize(11).fillColor(NAVY).text(h.headline, L, doc.y, { width: W }); }
  doc.y = Math.max(doc.y, 49.8 + 12.5);
  const contact: Run[] = [];
  const pieces: Run[] = [
    ...(h.email ? [{ text: h.email, font: F.r }] : []),
    ...(h.phone ? [{ text: h.phone, font: F.r }] : []),
    ...h.links.map((l) => ({ text: l.label, font: F.r, url: l.url })),
    ...(h.location ? [{ text: h.location, font: F.r }] : []),
  ];
  pieces.forEach((p, i) => { if (i) contact.push({ text: " | ", font: F.r }); contact.push(p); });
  para(contact, L, W);

  if (m.summary) {
    section("Summary");
    if (m.summary.bullets) for (const b of m.summary.bullets) bullet([{ text: b, font: F.r }]);
    else para([{ text: m.summary.text ?? "", font: F.r }], L, W);
  }

  if (m.education.length) {
    section("Education");
    for (const e of m.education) {
      splitRow(e.school, e.end);
      doc.font(F.i).fontSize(BODY).text(e.degree, L + 14.4, doc.y, { width: W - 14.4, lineGap: GAP });
    }
  }

  if (m.skills.length) {
    section("Skills");
    for (const s of m.skills) para([{ text: `${s.label}: `, font: F.b }, { text: s.items.join(", "), font: F.r }], L, W);
  }

  if (m.roles.length) {
    section("Experience");
    m.roles.forEach((r, i) => {
      if (i) doc.y += 0.95;
      splitRow(r.title, r.dates);
      doc.font(F.i).fontSize(BODY).fillColor(BLACK).text(r.orgline, L + 10, doc.y, { width: W - 10, lineGap: GAP });
      for (const b of r.bullets) bullet([{ text: b, font: F.r }]);
    });
  }

  if (m.projects.length) {
    section("Projects");
    for (const p of m.projects) {
      const runs: Run[] = [{ text: p.name, font: F.b, url: p.name_url }];
      if (p.stack) runs.push({ text: ` (${p.stack})`, font: F.b });
      for (const l of p.links) runs.push({ text: " | ", font: F.b }, { text: l.label, font: F.b, url: l.url });
      // Keep the colon glued to whatever precedes it so it never starts a line
      runs[runs.length - 1].text += ": ";
      runs.push({ text: p.text, font: F.r });
      bullet(runs);
    }
  }

  const pages = doc.bufferedPageRange().count;
  doc.end();
  await done;
  return { pdf: Buffer.concat(chunks), pages };
}
