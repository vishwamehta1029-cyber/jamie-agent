import { q, one } from "./db.js";
import { SEED_DATA } from "./seedData.js";

export async function loadSeed(): Promise<string> {
  const existing = Number((await one<{ n: string }>("SELECT count(*) n FROM facts"))!.n);
  if (existing > 0) return `Brain already has ${existing} facts; not seeding.`;
  const d = SEED_DATA;
  for (const f of d.facts)
    await q("INSERT INTO facts (category, fact, source, source_ref) VALUES ($1,$2,$3,$4)", [f.category, f.fact, f.source, f.source_ref ?? null]);
  for (const l of d.lessons) await q("INSERT INTO lessons (topic, lesson, source) VALUES ($1,$2,'seed')", [l.topic, l.lesson]);
  for (const [company, role, note] of d.applications)
    await q("INSERT INTO applications (company, role, status, notes) VALUES ($1,$2,'submitted',$3)", [
      company, role, ["imported from history", note].filter(Boolean).join("; "),
    ]);
  for (const [company, role, note] of d.in_progress)
    await q("INSERT INTO applications (company, role, status, notes) VALUES ($1,$2,'in_progress',$3)", [company, role, note]);
  for (const a of d.answers)
    await q("INSERT INTO answers (question, answer, question_type, role_type, approved, reusable) VALUES ($1,$2,$3,$4,$5,$6)", [
      a.question, a.answer, a.question_type, a.role_type, a.approved, a.reusable,
    ]);
  return `Seeded ${d.facts.length} facts, ${d.lessons.length} lessons, ${d.applications.length + d.in_progress.length} applications, ${d.answers.length} answers.`;
}
