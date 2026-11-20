import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { q, one } from "./db.js";

// Project Lab: takes Vishwa's projects to shipped (live demo + deployable by others),
// then improves them and suggests what to iterate on. Spec: agents/project-lab.md

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export const ACTIVE_STATUSES = ["audit", "shipping", "improving"];
const STATUSES = ["not_started", "audit", "shipping", "shipped", "improving", "parked"] as const;

// Vishwa's definition of done. Every item must be checked, with proof, before a project is shipped.
export const DONE_CHECKLIST: Record<string, string> = {
  live_url: "A. Public URL, no sign-up or setup needed to try it",
  stranger_usable: "A. A stranger can use it without instructions from Vishwa",
  sample_data: "A. Sample data or a guided first run (no empty screen)",
  cost_cap: "A. Usage limits or a capped demo key so strangers can't run up API costs",
  graceful_errors: "A. Handles errors gracefully (no raw stack traces)",
  one_command_setup: "B. One-command setup (Docker Compose or a Deploy to Vercel button)",
  env_example: "B. .env.example lists every required variable; no secrets in the repo",
  install_guide: "B. Install guide a new person can follow in about 15 minutes",
  fresh_env_tested: "B. Tested on a fresh environment",
  config_separated: "B. Config separated from code so others can plug in their own keys and data",
  license: "B. License file",
  readme: "C. README: what it does, how it works, demo link, how to deploy",
  architecture_diagram: "C. Architecture diagram",
  demo_video: "C. Demo video or GIF",
  talking_points: "C. Interview talking points saved",
  stylist_notified: "C. Stylist told what changed (resume and portfolio)",
};

const bar = (done: number, total: number) => {
  if (!total) return "no tasks yet";
  const filled = Math.round((done / total) * 12);
  return `${done} of ${total} ${"▓".repeat(filled)}${"░".repeat(12 - filled)}`;
};

async function findProject(project: string | number) {
  const p =
    typeof project === "number"
      ? await one("SELECT * FROM projects WHERE id = $1", [project])
      : await one("SELECT * FROM projects WHERE lower(repo) = lower($1) OR lower(name) = lower($1)", [project.trim()]);
  if (!p) throw new Error(`Project "${project}" not found. Create it with jamie_pl_upsert_project first.`);
  return p;
}

async function touch(projectId: number) {
  await q("UPDATE projects SET last_activity_at = now(), updated_at = now() WHERE id = $1", [projectId]);
}

export async function activeProject() {
  return one("SELECT * FROM projects WHERE status = ANY($1) ORDER BY last_activity_at DESC LIMIT 1", [ACTIVE_STATUSES]);
}

export async function openChange() {
  return one(
    `SELECT c.*, p.repo FROM pl_changes c JOIN projects p ON p.id = c.project_id
     WHERE c.status = 'open' ORDER BY c.opened_at LIMIT 1`
  );
}

export async function progress(projectId: number) {
  const p = await one("SELECT * FROM projects WHERE id = $1", [projectId]);
  const tasks = await q("SELECT * FROM pl_tasks WHERE project_id = $1 ORDER BY order_no, id", [projectId]);
  const live = tasks.filter((t: any) => t.status !== "parked");
  const done = live.filter((t: any) => t.status === "done").length;
  const next = live.filter((t: any) => t.status === "todo" || t.status === "doing").slice(0, 3);
  const checklist = p.done_checklist || {};
  const missing = Object.keys(DONE_CHECKLIST).filter((k) => !checklist[k]?.done);
  const idleDays = Math.floor((Date.now() - new Date(p.last_activity_at).getTime()) / 86_400_000);
  let nudge: string | null = null;
  if (ACTIVE_STATUSES.includes(p.status) && idleDays >= 5) {
    nudge = `No activity for ${idleDays} days. Shrink the next step further and ask if priorities changed. Do not push harder.`;
  } else if (ACTIVE_STATUSES.includes(p.status) && idleDays >= 2) {
    nudge = `No activity for ${idleDays} days. Send ONE short nudge with the smallest next step.`;
  }
  return {
    project: p.name,
    repo: p.repo,
    status: p.status,
    progress: { done, total: live.length, bar: bar(done, live.length) },
    next_tasks: next.map((t: any) => ({ id: t.id, title: t.title, minutes: t.minutes, milestone: t.milestone })),
    done_checklist_missing: missing.map((k) => ({ key: k, item: DONE_CHECKLIST[k] })),
    live_url: p.live_url,
    idle_days: idleDays,
    nudge,
  };
}

export function registerProjectLabTools(server: McpServer) {
  server.registerTool(
    "jamie_pl_upsert_project",
    {
      description:
        "Project Lab: create or update a project's knowledge record (what it does, architecture, stack, decisions, failures, approved metrics, skills proven by the code, talking points, v2 list). Pass repo as owner/name. skills_proven must only list skills visible in the code. metrics must only be approved metrics. Status changes go through jamie_pl_set_active, never here.",
      inputSchema: {
        repo: z.string().describe("owner/name, e.g. vishwamehta1029-cyber/The_Matchstick_Studio"),
        name: z.string().optional(),
        one_liner: z.string().optional(),
        problem: z.string().optional(),
        in_scope: z.boolean().optional(),
        live_url: z.string().optional(),
        deploy_method: z.string().optional(),
        architecture: z.string().optional(),
        stack: z.string().optional(),
        decisions: z.string().optional(),
        failures: z.string().optional(),
        metrics: z.string().optional(),
        skills_proven: z.array(z.string()).optional(),
        talking_points: z.string().optional(),
        v2_list: z.array(z.string()).optional(),
        last_synced_commit: z.string().optional(),
      },
    },
    async (a) => {
      const fields = [
        "name", "one_liner", "problem", "in_scope", "live_url", "deploy_method", "architecture", "stack",
        "decisions", "failures", "metrics", "skills_proven", "talking_points", "v2_list", "last_synced_commit",
      ] as const;
      const existing = await one("SELECT * FROM projects WHERE lower(repo) = lower($1)", [a.repo.trim()]);
      if (existing) {
        const sets: string[] = [];
        const vals: unknown[] = [existing.id];
        for (const f of fields) if (a[f] !== undefined) { vals.push(a[f]); sets.push(`${f} = $${vals.length}`); }
        if (a.last_synced_commit) sets.push("last_synced_at = now()");
        sets.push("updated_at = now()", "last_activity_at = now()");
        return ok(await one(`UPDATE projects SET ${sets.join(", ")} WHERE id = $1 RETURNING *`, vals));
      }
      const cols = ["repo", ...fields.filter((f) => a[f] !== undefined)];
      const vals = [a.repo.trim(), ...fields.filter((f) => a[f] !== undefined).map((f) => a[f])];
      if (!cols.includes("name")) { cols.push("name"); vals.push(a.repo.split("/").pop()); }
      return ok(
        await one(`INSERT INTO projects (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`, vals)
      );
    }
  );

  server.registerTool(
    "jamie_pl_list_projects",
    {
      description: "Project Lab: list all projects with status, progress, live URL, and which one is active.",
      inputSchema: { include_out_of_scope: z.boolean().optional() },
    },
    async ({ include_out_of_scope }) => {
      const rows = await q(
        `SELECT p.id, p.repo, p.name, p.status, p.in_scope, p.live_url, p.shipped_at, p.last_activity_at,
                count(t.*) FILTER (WHERE t.status <> 'parked') total,
                count(t.*) FILTER (WHERE t.status = 'done') done
         FROM projects p LEFT JOIN pl_tasks t ON t.project_id = p.id
         WHERE $1::boolean OR p.in_scope
         GROUP BY p.id ORDER BY (p.status = ANY($2)) DESC, p.status, p.name`,
        [include_out_of_scope ?? false, ACTIVE_STATUSES]
      );
      const act = await activeProject();
      return ok({
        active_project: act ? { id: act.id, repo: act.repo, status: act.status } : null,
        projects: rows.map((r: any) => ({ ...r, progress: bar(Number(r.done), Number(r.total)) })),
      });
    }
  );

  server.registerTool(
    "jamie_pl_get_project",
    {
      description:
        "Project Lab: full record for one project (knowledge base, tasks, open change, ideas, definition-of-done checklist, progress). Read this before working on a project.",
      inputSchema: { project: z.union([z.string(), z.number().int()]).describe("repo, name, or id") },
    },
    async ({ project }) => {
      const p = await findProject(project);
      const [tasks, changes, ideas] = await Promise.all([
        q("SELECT * FROM pl_tasks WHERE project_id = $1 ORDER BY order_no, id", [p.id]),
        q("SELECT * FROM pl_changes WHERE project_id = $1 ORDER BY opened_at DESC LIMIT 20", [p.id]),
        q("SELECT * FROM pl_ideas WHERE project_id = $1 ORDER BY (status='pitched') DESC, score DESC NULLS LAST, created_at DESC", [p.id]),
      ]);
      const checklist = Object.entries(DONE_CHECKLIST).map(([key, item]) => ({
        key, item, done: !!p.done_checklist?.[key]?.done, proof: p.done_checklist?.[key]?.proof ?? null,
      }));
      return ok({ project: p, progress: await progress(p.id), tasks, changes, ideas, done_checklist: checklist });
    }
  );

  server.registerTool(
    "jamie_pl_set_active",
    {
      description:
        "Project Lab: change a project's status (audit, shipping, improving, parked, not_started). ONE project can be active (audit/shipping/improving) at a time. Switching away from a project that is mid-ship needs Vishwa to say 'switch' (vishwa_said_switch=true). Use jamie_pl_check_done with mark_shipped=true to mark shipped.",
      inputSchema: {
        project: z.union([z.string(), z.number().int()]),
        status: z.enum(["not_started", "audit", "shipping", "improving", "parked"]),
        vishwa_said_switch: z.boolean().optional(),
      },
    },
    async ({ project, status, vishwa_said_switch }) => {
      const p = await findProject(project);
      if (ACTIVE_STATUSES.includes(status)) {
        const act = await activeProject();
        if (act && act.id !== p.id) {
          if (!vishwa_said_switch) {
            return ok({
              refused: true,
              reason: `${act.name} is already active (${act.status}). One project at a time. Finish it, or ask Vishwa if she wants to switch.`,
              active: { id: act.id, repo: act.repo, progress: (await progress(act.id)).progress },
            });
          }
          await q("UPDATE projects SET status = 'parked', updated_at = now() WHERE id = $1", [act.id]);
        }
      }
      const row = await one(
        "UPDATE projects SET status = $2, updated_at = now(), last_activity_at = now() WHERE id = $1 RETURNING id, repo, name, status",
        [p.id, status]
      );
      return ok({ project: row, progress: await progress(p.id) });
    }
  );

  server.registerTool(
    "jamie_pl_set_tasks",
    {
      description:
        "Project Lab: save the finish-line task list from the audit. Each task is 20-30 minutes, in order. Pass vishwa_approved=true ONLY after Vishwa approved this exact list; that locks it. A locked list cannot gain tasks without Vishwa's approval (scope creep goes to the v2 list instead). mode=append adds tasks to the end.",
      inputSchema: {
        project: z.union([z.string(), z.number().int()]),
        tasks: z.array(
          z.object({
            title: z.string(),
            detail: z.string().optional(),
            minutes: z.number().int().min(5).max(60).optional(),
            milestone: z.enum(["core_works", "live_demo", "packaged", "fresh_env_test", "docs_demo", "improvement"]).optional(),
          })
        ),
        mode: z.enum(["replace", "append"]).optional(),
        vishwa_approved: z.boolean(),
      },
    },
    async ({ project, tasks, mode, vishwa_approved }) => {
      const p = await findProject(project);
      if (p.tasks_locked && !vishwa_approved) {
        return ok({
          refused: true,
          reason: "The finish line is locked. New tasks need Vishwa's approval. Put nice-to-haves on the v2 list with jamie_pl_upsert_project.",
        });
      }
      const long = tasks.filter((t) => (t.minutes ?? 30) > 30);
      if ((mode ?? "replace") === "replace") {
        const started = await one("SELECT count(*) n FROM pl_tasks WHERE project_id = $1 AND status <> 'todo'", [p.id]);
        if (Number(started.n) > 0) {
          return ok({ refused: true, reason: "Some tasks are already in progress or done. Use mode=append, or update tasks individually." });
        }
        await q("DELETE FROM pl_tasks WHERE project_id = $1", [p.id]);
      }
      const start = Number((await one("SELECT COALESCE(max(order_no), 0) n FROM pl_tasks WHERE project_id = $1", [p.id])).n);
      let i = start;
      for (const t of tasks) {
        i += 1;
        await q(
          "INSERT INTO pl_tasks (project_id, title, detail, minutes, order_no, milestone) VALUES ($1,$2,$3,$4,$5,$6)",
          [p.id, t.title, t.detail ?? null, t.minutes ?? 30, i, t.milestone ?? null]
        );
      }
      await q("UPDATE projects SET tasks_locked = $2, updated_at = now(), last_activity_at = now() WHERE id = $1", [p.id, vishwa_approved || p.tasks_locked]);
      return ok({
        saved: tasks.length,
        locked: vishwa_approved || p.tasks_locked,
        warning: long.length ? `${long.length} task(s) are over 30 minutes. Split them before starting.` : undefined,
        progress: await progress(p.id),
      });
    }
  );

  server.registerTool(
    "jamie_pl_update_task",
    {
      description:
        "Project Lab: move a task through todo -> doing -> in_review -> done (or parked). Only the active project's tasks can be started. Only one task can be in_review at a time across all projects (one open PR).",
      inputSchema: {
        task_id: z.number().int(),
        status: z.enum(["todo", "doing", "in_review", "done", "parked"]),
        pr_url: z.string().optional(),
      },
    },
    async ({ task_id, status, pr_url }) => {
      const t = await one("SELECT t.*, p.status pstatus, p.name pname FROM pl_tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1", [task_id]);
      if (!t) throw new Error(`task ${task_id} not found`);
      if ((status === "doing" || status === "in_review") && !ACTIVE_STATUSES.includes(t.pstatus)) {
        return ok({ refused: true, reason: `${t.pname} is not the active project. Activate it with jamie_pl_set_active first.` });
      }
      if (status === "in_review") {
        const other = await one("SELECT id, title FROM pl_tasks WHERE status = 'in_review' AND id <> $1", [task_id]);
        if (other) return ok({ refused: true, reason: `Task #${other.id} "${other.title}" is already in review. One open PR at a time.` });
      }
      const row = await one(
        `UPDATE pl_tasks SET status = $2, pr_url = COALESCE($3, pr_url),
           done_at = CASE WHEN $2 = 'done' THEN now() ELSE NULL END
         WHERE id = $1 RETURNING *`,
        [task_id, status, pr_url ?? null]
      );
      await touch(t.project_id);
      return ok({ task: row, progress: await progress(t.project_id) });
    }
  );

  server.registerTool(
    "jamie_pl_log_change",
    {
      description:
        "Project Lab: record a pull request. action=open before asking Vishwa to review (refused if another PR is open, the project is not active, or the branch is not lab/<project>/<task>). action=merged or closed after Vishwa merges or closes it (Project Lab never merges). Also records the check-back question and how Vishwa answered.",
      inputSchema: {
        action: z.enum(["open", "merged", "closed", "check_back"]),
        project: z.union([z.string(), z.number().int()]).optional(),
        change_id: z.number().int().optional(),
        task_id: z.number().int().optional(),
        idea_id: z.number().int().optional(),
        branch: z.string().optional(),
        pr_url: z.string().optional(),
        summary: z.string().optional(),
        check_back_q: z.string().optional(),
        check_back_result: z.enum(["clear", "explained_again"]).optional(),
      },
    },
    async (a) => {
      if (a.action === "open") {
        if (!a.project || !a.branch) throw new Error("project and branch are required to open a change");
        const p = await findProject(a.project);
        if (!ACTIVE_STATUSES.includes(p.status)) {
          return ok({ refused: true, reason: `${p.name} is not the active project. Only the active project gets PRs.` });
        }
        if (!/^lab\/[^/]+\/[^/]+/.test(a.branch)) {
          return ok({ refused: true, reason: "Branch must be named lab/<project>/<task>. Never work on main." });
        }
        const open = await openChange();
        if (open) return ok({ refused: true, reason: `A PR is already open (${open.pr_url || open.branch} on ${open.repo}). One at a time; wait for Vishwa.` });
        const row = await one(
          `INSERT INTO pl_changes (project_id, task_id, idea_id, branch, pr_url, summary, check_back_q)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [p.id, a.task_id ?? null, a.idea_id ?? null, a.branch, a.pr_url ?? null, a.summary ?? null, a.check_back_q ?? null]
        );
        if (a.task_id) await q("UPDATE pl_tasks SET status = 'in_review', pr_url = COALESCE($2, pr_url) WHERE id = $1", [a.task_id, a.pr_url ?? null]);
        await touch(p.id);
        return ok({ change: row, next: "Send Vishwa the plain-language walkthrough and the check-back question. Wait for her to merge." });
      }
      if (!a.change_id) throw new Error("change_id is required");
      const c = await one("SELECT * FROM pl_changes WHERE id = $1", [a.change_id]);
      if (!c) throw new Error(`change ${a.change_id} not found`);
      if (a.action === "check_back") {
        return ok(await one(
          "UPDATE pl_changes SET check_back_q = COALESCE($2, check_back_q), check_back_result = COALESCE($3, check_back_result) WHERE id = $1 RETURNING *",
          [c.id, a.check_back_q ?? null, a.check_back_result ?? null]
        ));
      }
      const row = await one("UPDATE pl_changes SET status = $2, closed_at = now() WHERE id = $1 RETURNING *", [c.id, a.action]);
      if (c.task_id) await q("UPDATE pl_tasks SET status = $2, done_at = CASE WHEN $2 = 'done' THEN now() ELSE NULL END WHERE id = $1", [c.task_id, a.action === "merged" ? "done" : "todo"]);
      if (c.idea_id && a.action === "merged") await q("UPDATE pl_ideas SET status = 'built', updated_at = now() WHERE id = $1", [c.idea_id]);
      await touch(c.project_id);
      return ok({
        change: row,
        progress: await progress(c.project_id),
        next: a.action === "merged"
          ? "Update the project record (jamie_pl_upsert_project), save the talking point, tell Stylist what changed, then start the next task."
          : "Ask Vishwa what to change, then revise or move on.",
      });
    }
  );

  server.registerTool(
    "jamie_pl_progress",
    {
      description:
        "Project Lab: progress bar, next 1-3 tasks, missing definition-of-done items, and whether a nudge is due (2+ idle days: one short nudge; 5+: shrink the step). Defaults to the active project. Use for every check-in.",
      inputSchema: { project: z.union([z.string(), z.number().int()]).optional() },
    },
    async ({ project }) => {
      const p = project ? await findProject(project) : await activeProject();
      if (!p) return ok({ active_project: null, next: "No active project. Ask Vishwa which project to ship next." });
      return ok({ ...(await progress(p.id)), open_pr: await openChange() });
    }
  );

  server.registerTool(
    "jamie_pl_check_done",
    {
      description:
        "Project Lab: tick definition-of-done items with proof (URL, screenshot path, fresh-environment log). Items: " +
        Object.keys(DONE_CHECKLIST).join(", ") +
        ". Set mark_shipped=true to mark the project shipped; refused unless EVERY item is done with proof.",
      inputSchema: {
        project: z.union([z.string(), z.number().int()]),
        items: z.array(z.object({ key: z.enum(Object.keys(DONE_CHECKLIST) as [string, ...string[]]), done: z.boolean(), proof: z.string().optional() })).optional(),
        mark_shipped: z.boolean().optional(),
      },
    },
    async ({ project, items, mark_shipped }) => {
      const p = await findProject(project);
      const checklist = { ...(p.done_checklist || {}) };
      for (const it of items ?? []) {
        if (it.done && !it.proof) return ok({ refused: true, reason: `"${it.key}" needs proof (a URL, file, or log) to be checked.` });
        checklist[it.key] = { done: it.done, proof: it.proof ?? null, at: new Date().toISOString() };
      }
      await q("UPDATE projects SET done_checklist = $2, updated_at = now(), last_activity_at = now() WHERE id = $1", [p.id, JSON.stringify(checklist)]);
      const missing = Object.keys(DONE_CHECKLIST).filter((k) => !checklist[k]?.done);
      if (mark_shipped) {
        if (missing.length) return ok({ refused: true, reason: "Not shipped yet. Missing items:", missing: missing.map((k) => DONE_CHECKLIST[k]) });
        await q("UPDATE projects SET status = 'shipped', shipped_at = now() WHERE id = $1", [p.id]);
        return ok({ shipped: true, project: p.name, next: "Celebrate with Vishwa, run wrap-up, then offer to start the next project." });
      }
      return ok({ project: p.name, missing: missing.map((k) => ({ key: k, item: DONE_CHECKLIST[k] })) });
    }
  );

  server.registerTool(
    "jamie_pl_add_idea",
    {
      description:
        "Project Lab: save a suggestion for a project (improvement, bug, security, dependency, ux) or a parked idea. Include why, skills it proves, how many recent jobs asked for them, effort (quick_win or bigger_build), demo value. Score = sum of (rating 1-5 x weight): job demand x3, role fit x3, effort x2, demo value x2, fixes a gap x1.",
      inputSchema: {
        project: z.union([z.string(), z.number().int()]),
        idea: z.string(),
        why: z.string().optional(),
        skills: z.array(z.string()).optional(),
        job_count: z.number().int().optional(),
        effort: z.enum(["quick_win", "bigger_build"]).optional(),
        demo_value: z.string().optional(),
        score: z.number().optional(),
        kind: z.enum(["improvement", "bug", "security", "dependency", "ux", "parked"]).optional(),
      },
    },
    async (a) => {
      const p = await findProject(a.project);
      const dup = await one("SELECT * FROM pl_ideas WHERE project_id = $1 AND lower(idea) = lower($2)", [p.id, a.idea]);
      if (dup) return ok({ note: "Idea already saved.", idea: dup });
      return ok(await one(
        `INSERT INTO pl_ideas (project_id, idea, why, skills, job_count, effort, demo_value, score, kind)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [p.id, a.idea, a.why ?? null, a.skills ?? [], a.job_count ?? null, a.effort ?? null, a.demo_value ?? null, a.score ?? null, a.kind ?? "improvement"]
      ));
    }
  );

  server.registerTool(
    "jamie_pl_ideas",
    {
      description:
        "Project Lab: list ideas across projects (default: pitched, highest score first) for the weekly digest. Never re-pitch an idea Vishwa said no to.",
      inputSchema: {
        status: z.enum(["pitched", "yes", "no", "later", "built"]).optional(),
        project: z.union([z.string(), z.number().int()]).optional(),
        limit: z.number().int().max(50).optional(),
      },
    },
    async ({ status, project, limit }) => {
      const pid = project ? (await findProject(project)).id : null;
      return ok(await q(
        `SELECT i.*, p.name project_name, p.repo FROM pl_ideas i JOIN projects p ON p.id = i.project_id
         WHERE i.status = $1 AND ($2::int IS NULL OR i.project_id = $2)
         ORDER BY i.score DESC NULLS LAST, i.created_at DESC LIMIT $3`,
        [status ?? "pitched", pid, limit ?? 5]
      ));
    }
  );

  server.registerTool(
    "jamie_pl_set_idea_status",
    {
      description: "Project Lab: record Vishwa's answer to a pitched idea: yes, no (with reason, never pitched again), or later.",
      inputSchema: { idea_id: z.number().int(), status: z.enum(["yes", "no", "later"]), reason: z.string().optional() },
    },
    async ({ idea_id, status, reason }) =>
      ok(await one("UPDATE pl_ideas SET status = $2, reason = COALESCE($3, reason), updated_at = now() WHERE id = $1 RETURNING *", [idea_id, status, reason ?? null]))
  );
}
