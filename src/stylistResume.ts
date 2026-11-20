// Renders a one-page, ATS-friendly resume PDF from Stylist's items. Pure code (pdfkit), no LLM.
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
  header: { name?: string; email?: string; phone?: string; location?: string; links?: Link[] };
  summary: string | null;
  roles: { org: string; title: string; location: string; dates: string; bullets: string[] }[];
  projects: { name: string; links: Link[]; bullets: string[] }[];
  skills: { label: string; items: string[] }[];
  education: { school: string; degree: string; location: string; end: string }[];
};

const asLinks = (v: any): Link[] =>
  Array.isArray(v) ? v.filter((l) => l && (l.url || typeof l === "string")).map((l) => (typeof l === "string" ? { label: l, url: l } : l)) : [];

export function buildModel(items: Item[], surface: string): ResumeModel {
  const on = items.filter((i) => i.active && i.surfaces.includes(surface)).sort((a, b) => a.order_no - b.order_no);
  const kids = (k: string) => on.filter((i) => i.kind === "bullet" && i.parent_key === k).map((i) => String(i.content.text));
  const h = on.find((i) => i.kind === "header")?.content ?? {};
  return {
    header: { ...h, links: asLinks(h.links) },
    summary: on.find((i) => i.kind === "summary")?.content?.text ?? null,
    roles: on.filter((i) => i.kind === "role").map((r) => ({
      org: r.content.org,
      title: r.content.title_by_surface?.[surface] ?? r.content.title,
      location: r.content.location ?? "",
      dates: [r.content.start, r.content.end].filter(Boolean).join(" to "),
      bullets: kids(r.key),
    })),
    projects: on.filter((i) => i.kind === "project").map((p) => ({
      name: p.content.name, links: asLinks(p.content.links), bullets: kids(p.key),
    })),
    skills: on.filter((i) => i.kind === "skill_group").map((s) => ({ label: s.content.label, items: s.content.items ?? [] })),
    education: on.filter((i) => i.kind === "education").map((e) => e.content),
  };
}

export function modelToText(m: ResumeModel): string {
  const out: string[] = [];
  const h = m.header;
  out.push(h.name ?? "", [h.location, h.email, h.phone].filter(Boolean).join(" | "));
  out.push((h.links ?? []).map((l) => `${l.label}: ${l.url}`).join(" | "), "");
  if (m.summary) out.push("SUMMARY", m.summary, "");
  out.push("EXPERIENCE");
  for (const r of m.roles) {
    out.push(`${r.title}, ${r.org} | ${r.location} | ${r.dates}`);
    for (const b of r.bullets) out.push(`- ${b}`);
  }
  if (m.projects.length) {
    out.push("", "PROJECTS");
    for (const p of m.projects) {
      out.push(`${p.name}${p.links.length ? " | " + p.links.map((l) => `${l.label}: ${l.url}`).join(" | ") : ""}`);
      for (const b of p.bullets) out.push(`- ${b}`);
    }
  }
  out.push("", "SKILLS");
  for (const s of m.skills) out.push(`${s.label}: ${s.items.join(", ")}`);
  out.push("", "EDUCATION");
  for (const e of m.education) out.push(`${e.degree}, ${e.school} | ${e.location} | ${e.end}`);
  return out.join("\n");
}

// Light palette
const INK = "#2B2B2B";
const BODY = "#3A3A3A";
const MUTED = "#7A7A7A";
const ACCENT = "#3D5A80";
const RULE = "#C9D3DF";

// Equal margins on every side
const MARGIN = 40;
const BODY_SIZE = 9.8;

/** Renders once to measure, then spreads any leftover space evenly so the bottom margin matches the others. */
export async function renderPdf(m: ResumeModel): Promise<{ pdf: Buffer; pages: number }> {
  const first = await renderOnce(m, 1);
  if (first.pages !== 1 || first.leftover <= 4 || first.gapTotal <= 0) return { pdf: first.pdf, pages: first.pages };
  const scale = Math.min(2.2, 1 + (first.leftover - 2) / first.gapTotal);
  const second = await renderOnce(m, scale);
  return second.pages === 1 ? { pdf: second.pdf, pages: 1 } : { pdf: first.pdf, pages: first.pages };
}

async function renderOnce(m: ResumeModel, spread: number): Promise<{ pdf: Buffer; pages: number; leftover: number; gapTotal: number }> {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: { Title: `${m.header.name ?? "Resume"}` },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((res) => doc.on("end", () => res()));
  const W = doc.page.width - 2 * MARGIN;
  const L = MARGIN;
  const bottom = () => doc.page.height - MARGIN;
  let gapTotal = 0;
  const gap = (pts: number) => { gapTotal += pts; doc.y += pts * spread; };

  // Section title, a thin rule, then clear space below the rule
  const section = (title: string) => {
    gap(9);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(ACCENT).text(title.toUpperCase(), L, doc.y, { characterSpacing: 1.4 });
    gap(2.5);
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(0.5).strokeColor(RULE).stroke();
    gap(6);
  };

  // Heading row: bold title + muted org on the left; muted details or clickable links on the right
  const row = (title: string, sub: string, right: string | Link[]) => {
    const links = Array.isArray(right) ? right : null;
    const sep = "  ·  ";
    doc.font("Helvetica").fontSize(9);
    const rightText: string = links ? links.map((l) => l.label).join(sep) : (right as string);
    const rw = rightText ? doc.widthOfString(rightText) : 0;
    const leftW = W - rw - 14;
    doc.font("Helvetica-Bold").fontSize(10.2);
    const lh = doc.heightOfString(sub ? `${title}  ${sub}` : title, { width: leftW });
    if (doc.y + lh > bottom()) doc.addPage();
    const y = doc.y;
    if (links) {
      let x = L + W - rw;
      links.forEach((l, i) => {
        doc.font("Helvetica").fontSize(9).fillColor(ACCENT).text(l.label, x, y + 0.6, { lineBreak: false });
        const lw = doc.widthOfString(l.label);
        doc.link(x, y, lw, doc.currentLineHeight(true) + 1, l.url);
        x += lw;
        if (i < links.length - 1) {
          doc.fillColor(MUTED).text(sep, x, y + 0.6, { lineBreak: false });
          x += doc.widthOfString(sep);
        }
      });
    } else if (rightText) {
      doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(rightText, L, y + 0.6, { width: W, align: "right", lineBreak: false });
    }
    doc.font("Helvetica-Bold").fontSize(10.2).fillColor(INK).text(title, L, y, { width: leftW, continued: !!sub });
    if (sub) doc.font("Helvetica").fontSize(10.2).fillColor(MUTED).text(`  ${sub}`);
    gap(2);
  };

  // Bullet with a hanging indent: small accent dot, then the text block
  const bullet = (t: string) => {
    doc.font("Helvetica").fontSize(BODY_SIZE);
    const bh = doc.heightOfString(t, { width: W - 12, lineGap: 1.2 });
    if (doc.y + bh > bottom()) doc.addPage();
    const y = doc.y;
    doc.fillColor(ACCENT).text("•", L + 2, y, { lineBreak: false });
    doc.fillColor(BODY).text(t, L + 12, y, { width: W - 12, lineGap: 1.2 });
    gap(2.2);
  };

  // Header
  const h = m.header;
  doc.font("Helvetica-Bold").fontSize(20).fillColor(INK).text(h.name ?? "", L, doc.y, { width: W, align: "center", characterSpacing: 0.4 });
  gap(3);
  doc.font("Helvetica").fontSize(9.2).fillColor(MUTED).text([h.location, h.email, h.phone].filter(Boolean).join("   |   "), L, doc.y, { width: W, align: "center" });
  gap(2);
  const hl = h.links ?? [];
  if (hl.length) {
    const sep = "   |   ";
    doc.font("Helvetica").fontSize(9.2);
    const total = hl.reduce((a, l, i) => a + doc.widthOfString(l.label) + (i ? doc.widthOfString(sep) : 0), 0);
    let x = L + (W - total) / 2;
    const y = doc.y;
    hl.forEach((l, i) => {
      if (i) { doc.fillColor(MUTED).text(sep, x, y, { lineBreak: false }); x += doc.widthOfString(sep); }
      doc.fillColor(ACCENT).text(l.label, x, y, { lineBreak: false });
      const lw = doc.widthOfString(l.label);
      doc.link(x, y, lw, doc.currentLineHeight(true) + 1, l.url);
      x += lw;
    });
    doc.x = L;
    doc.y = y + doc.currentLineHeight(true);
  }

  if (m.summary) {
    section("Summary");
    doc.font("Helvetica").fontSize(BODY_SIZE).fillColor(BODY).text(m.summary, L, doc.y, { width: W, lineGap: 1.2 });
  }

  section("Experience");
  m.roles.forEach((r, i) => {
    if (i) gap(6);
    row(r.title, r.org, [r.location, r.dates].filter(Boolean).join("   |   "));
    r.bullets.forEach(bullet);
  });

  if (m.projects.length) {
    section("Projects");
    m.projects.forEach((p, i) => {
      if (i) gap(5);
      row(p.name, "", p.links);
      p.bullets.forEach(bullet);
    });
  }

  section("Skills");
  m.skills.forEach((s, i) => {
    if (i) gap(2.5);
    doc.font("Helvetica-Bold").fontSize(BODY_SIZE).fillColor(INK).text(`${s.label}:  `, L, doc.y, { width: W, continued: true, lineGap: 1.2 })
      .font("Helvetica").fillColor(BODY).text(s.items.join(", "));
  });

  section("Education");
  for (const e of m.education) row(e.degree, "", [e.school, e.end].filter(Boolean).join("   |   "));

  const pages = doc.bufferedPageRange().count;
  const leftover = bottom() - doc.y;
  doc.end();
  await done;
  return { pdf: Buffer.concat(chunks), pages, leftover, gapTotal };
}
