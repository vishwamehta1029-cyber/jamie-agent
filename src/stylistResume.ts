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

export const RESUME_SURFACES = ["resume:fde", "resume:ai_engineer", "resume:gtm"] as const;

export type ResumeModel = {
  header: any;
  summary: string | null;
  roles: { org: string; title: string; location: string; dates: string; bullets: string[] }[];
  projects: { name: string; link: string; stack: string; bullets: string[] }[];
  skills: { label: string; items: string[] }[];
  education: { school: string; degree: string; location: string; end: string }[];
};

export function buildModel(items: Item[], surface: string): ResumeModel {
  const on = items.filter((i) => i.active && i.surfaces.includes(surface)).sort((a, b) => a.order_no - b.order_no);
  const kids = (k: string) => on.filter((i) => i.kind === "bullet" && i.parent_key === k).map((i) => String(i.content.text));
  return {
    header: on.find((i) => i.kind === "header")?.content ?? {},
    summary: on.find((i) => i.kind === "summary")?.content?.text ?? null,
    roles: on.filter((i) => i.kind === "role").map((r) => ({
      org: r.content.org,
      title: r.content.title_by_surface?.[surface] ?? r.content.title,
      location: r.content.location ?? "",
      dates: [r.content.start, r.content.end].filter(Boolean).join(" to "),
      bullets: kids(r.key),
    })),
    projects: on.filter((i) => i.kind === "project").map((p) => ({
      name: p.content.name, link: p.content.link ?? "", stack: p.content.stack ?? "", bullets: kids(p.key),
    })),
    skills: on.filter((i) => i.kind === "skill_group").map((s) => ({ label: s.content.label, items: s.content.items ?? [] })),
    education: on.filter((i) => i.kind === "education").map((e) => e.content),
  };
}

export function modelToText(m: ResumeModel): string {
  const out: string[] = [];
  const h = m.header;
  out.push(h.name ?? "", [h.location, h.email, h.phone, ...(h.links ?? [])].filter(Boolean).join(" | "), "");
  if (m.summary) out.push("SUMMARY", m.summary, "");
  out.push("EXPERIENCE");
  for (const r of m.roles) {
    out.push(`${r.title}, ${r.org} | ${r.location} | ${r.dates}`);
    for (const b of r.bullets) out.push(`- ${b}`);
  }
  if (m.projects.length) {
    out.push("", "PROJECTS");
    for (const p of m.projects) {
      out.push(`${p.name}${p.stack ? ` | ${p.stack}` : ""}${p.link ? ` | ${p.link}` : ""}`);
      for (const b of p.bullets) out.push(`- ${b}`);
    }
  }
  out.push("", "SKILLS");
  for (const s of m.skills) out.push(`${s.label}: ${s.items.join(", ")}`);
  out.push("", "EDUCATION");
  for (const e of m.education) out.push(`${e.degree}, ${e.school} | ${e.location} | ${e.end}`);
  return out.join("\n");
}

const INK = "#111111";
const MUTED = "#555555";
const ACCENT = "#1F3A5F";

export async function renderPdf(m: ResumeModel): Promise<{ pdf: Buffer; pages: number }> {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 32, bottom: 30, left: 40, right: 40 }, bufferPages: true, info: { Title: `${m.header.name ?? "Resume"}` } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((res) => doc.on("end", () => res()));
  const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const L = doc.page.margins.left;

  const section = (title: string) => {
    doc.moveDown(0.35);
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(ACCENT).text(title.toUpperCase(), { characterSpacing: 0.6 });
    const y = doc.y + 1;
    doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.6).strokeColor(ACCENT).stroke();
    doc.moveDown(0.22);
    doc.fillColor(INK);
  };
  const row = (left: string, right: string, bold = true) => {
    doc.font("Helvetica").fontSize(9.5);
    const rw = right ? doc.widthOfString(right) : 0;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10);
    const lh = doc.heightOfString(left, { width: W - rw - 12 });
    if (doc.y + lh > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const y = doc.y;
    if (right) doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text(right, L, y, { width: W, align: "right", lineBreak: false });
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor(INK).text(left, L, y, { width: W - rw - 12 });
  };
  const bullet = (t: string) => {
    doc.font("Helvetica").fontSize(9.8).fillColor(INK).text(`•  ${t}`, L + 8, doc.y, { width: W - 8, indent: -8, lineGap: 0.4 });
    doc.moveDown(0.06);
  };

  const h = m.header;
  doc.font("Helvetica-Bold").fontSize(18).fillColor(INK).text(h.name ?? "", { align: "center" });
  doc.font("Helvetica").fontSize(9.5).fillColor(MUTED)
    .text([h.location, h.email, h.phone].filter(Boolean).join("  |  "), { align: "center" })
    .text((h.links ?? []).join("  |  "), { align: "center" });

  if (m.summary) {
    section("Summary");
    doc.font("Helvetica").fontSize(9.8).fillColor(INK).text(m.summary, { lineGap: 0.4 });
  }
  section("Experience");
  m.roles.forEach((r, i) => {
    if (i) doc.moveDown(0.15);
    row(`${r.title}, ${r.org}`, `${r.location}  |  ${r.dates}`);
    r.bullets.forEach(bullet);
  });
  if (m.projects.length) {
    section("Projects");
    m.projects.forEach((p, i) => {
      if (i) doc.moveDown(0.12);
      row(p.name, p.link);
      p.bullets.forEach(bullet);
    });
  }
  section("Skills");
  for (const s of m.skills) {
    doc.font("Helvetica-Bold").fontSize(9.8).fillColor(INK).text(`${s.label}: `, { continued: true })
      .font("Helvetica").text(s.items.join(", "), { lineGap: 0.4 });
  }
  section("Education");
  for (const e of m.education) row(`${e.degree}, ${e.school}`, `${e.location}  |  ${e.end}`, false);

  const pages = doc.bufferedPageRange().count;
  doc.end();
  await done;
  return { pdf: Buffer.concat(chunks), pages };
}
