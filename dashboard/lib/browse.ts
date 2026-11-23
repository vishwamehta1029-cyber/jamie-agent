// Builds the SQL for one page of the database browser. Table and column names come only from
// information_schema (checked by the caller) and are quoted; every user value is a parameter.
// Secret-looking columns are replaced inside the SELECT, are never searched and cannot be sorted on,
// so their values never leave the database and cannot be inferred from search or order.
import { MASK, isSecretColumn } from "./mask.ts";
import { quoteIdent } from "./sql.ts";

export type Column = { name: string; type: string };

const SEARCHABLE = /^(text|character varying|character|citext|name|jsonb|json|ARRAY|USER-DEFINED|uuid)$/;

export function browseQuery(opts: {
  table: string;
  columns: Column[];
  sort?: string | null;
  dir?: "asc" | "desc";
  search?: string | null;
  limit: number;
  offset: number;
}): { text: string; countText: string; params: unknown[]; sort: string | null; searchable: string[]; masked: string[] } {
  const t = `public.${quoteIdent(opts.table)}`;
  const masked = opts.columns.filter((c) => isSecretColumn(c.name)).map((c) => c.name);
  const select = opts.columns
    .map((c) => (masked.includes(c.name)
      ? `CASE WHEN ${quoteIdent(c.name)} IS NULL THEN NULL ELSE '${MASK.replace(/'/g, "''")}' END AS ${quoteIdent(c.name)}`
      : quoteIdent(c.name)))
    .join(", ");
  const searchable = opts.columns.filter((c) => !masked.includes(c.name) && SEARCHABLE.test(c.type)).map((c) => c.name);
  const params: unknown[] = [];
  let where = "";
  const term = (opts.search ?? "").trim().slice(0, 200);
  if (term && searchable.length) {
    params.push(`%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    where = ` WHERE ${searchable.map((c) => `${quoteIdent(c)}::text ILIKE $1`).join(" OR ")}`;
  } else if (term) {
    where = " WHERE FALSE";
  }
  const names = opts.columns.map((c) => c.name);
  const fallback = names.includes("id") ? "id" : null;
  const sort = opts.sort && names.includes(opts.sort) && !masked.includes(opts.sort) ? opts.sort : fallback;
  const dir = opts.dir === "asc" ? "ASC" : "DESC";
  const order = sort ? ` ORDER BY ${quoteIdent(sort)} ${dir} NULLS LAST` : "";
  const limit = Math.max(1, Math.min(200, Math.floor(opts.limit)));
  const offset = Math.max(0, Math.floor(opts.offset));
  return {
    text: `SELECT ${select} FROM ${t}${where}${order} LIMIT ${limit} OFFSET ${offset}`,
    countText: `SELECT count(*)::bigint AS n FROM ${t}${where}`,
    params,
    sort,
    searchable,
    masked,
  };
}
