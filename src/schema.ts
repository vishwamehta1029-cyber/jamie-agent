export const SCHEMA = `
CREATE TABLE IF NOT EXISTS facts (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  fact TEXT NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  superseded_by INT REFERENCES facts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS answers (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  question_type TEXT,
  role_type TEXT,
  company TEXT,
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  reusable BOOLEAN NOT NULL DEFAULT TRUE,
  times_used INT NOT NULL DEFAULT 0,
  application_id INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  job_id TEXT,
  url TEXT,
  location TEXT,
  ats TEXT,
  resume_used TEXT,
  tier TEXT NOT NULL DEFAULT 'mass',
  status TEXT NOT NULL DEFAULT 'saved',
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS applications_company_idx ON applications (lower(company));
CREATE TABLE IF NOT EXISTS submitted_answers (
  id SERIAL PRIMARY KEY,
  application_id INT NOT NULL REFERENCES applications(id),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  answer_id INT REFERENCES answers(id),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT,
  company TEXT NOT NULL,
  domain TEXT,
  linkedin_url TEXT,
  email TEXT,
  email_source TEXT,
  email_confidence TEXT,
  patterns_tried INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  application_id INT REFERENCES applications(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contacts_company_idx ON contacts (lower(company));
CREATE TABLE IF NOT EXISTS email_patterns (
  domain TEXT PRIMARY KEY,
  pattern TEXT,
  status TEXT NOT NULL DEFAULT 'guessed',
  evidence TEXT,
  catch_all BOOLEAN,
  accepts_mail BOOLEAN,
  bounces INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sends (
  id SERIAL PRIMARY KEY,
  contact_id INT NOT NULL REFERENCES contacts(id),
  to_email TEXT NOT NULL,
  subject TEXT,
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  bounced BOOLEAN NOT NULL DEFAULT FALSE,
  bounced_at TIMESTAMPTZ,
  checked_1h BOOLEAN NOT NULL DEFAULT FALSE,
  checked_24h BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS apollo_usage (
  id SERIAL PRIMARY KEY,
  contact_id INT REFERENCES contacts(id),
  reason TEXT NOT NULL,
  credits NUMERIC NOT NULL DEFAULT 1,
  result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lessons (
  id SERIAL PRIMARY KEY,
  topic TEXT NOT NULL,
  lesson TEXT NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS handoffs (
  id SERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  summary TEXT NOT NULL,
  next_steps TEXT,
  open_items JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('mass_apps_daily_cap', '45'),
  ('company_bounce_cap', '3'),
  ('daily_send_limit', '250'),
  ('max_patterns_per_person', '2'),
  ('max_years_experience', '3'),
  ('guessing_paused', 'false'),
  ('scout_max_age_hours', '24'),
  ('scout_exclude_agencies', 'true')
ON CONFLICT (key) DO NOTHING;
DELETE FROM settings WHERE key IN ('weekly_bounce_cap', 'weekly_bounce_rate_pct', 'min_sends_for_rate');

-- Project Lab: finish, deploy, improve and suggest for Vishwa's projects
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  repo TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  one_liner TEXT,
  problem TEXT,
  status TEXT NOT NULL DEFAULT 'not_started',
  in_scope BOOLEAN NOT NULL DEFAULT TRUE,
  live_url TEXT,
  deploy_method TEXT,
  architecture TEXT,
  stack TEXT,
  decisions TEXT,
  failures TEXT,
  metrics TEXT,
  skills_proven TEXT[] NOT NULL DEFAULT '{}',
  talking_points TEXT,
  v2_list TEXT[] NOT NULL DEFAULT '{}',
  done_checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  tasks_locked BOOLEAN NOT NULL DEFAULT FALSE,
  last_synced_commit TEXT,
  last_synced_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  shipped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pl_tasks (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  detail TEXT,
  minutes INT NOT NULL DEFAULT 30,
  order_no INT NOT NULL DEFAULT 0,
  milestone TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  pr_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS pl_tasks_project_idx ON pl_tasks (project_id, order_no);
CREATE TABLE IF NOT EXISTS pl_changes (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id),
  task_id INT REFERENCES pl_tasks(id),
  idea_id INT,
  branch TEXT NOT NULL,
  pr_url TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  check_back_q TEXT,
  check_back_result TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS pl_ideas (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id),
  idea TEXT NOT NULL,
  why TEXT,
  skills TEXT[] NOT NULL DEFAULT '{}',
  job_count INT,
  effort TEXT,
  demo_value TEXT,
  score NUMERIC,
  kind TEXT NOT NULL DEFAULT 'improvement',
  status TEXT NOT NULL DEFAULT 'pitched',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scout: finds, filters and ranks job postings
CREATE TABLE IF NOT EXISTS scout_runs (
  id SERIAL PRIMARY KEY,
  sources TEXT[] NOT NULL DEFAULT '{}',
  query TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  notes TEXT,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS scout_watchlist (
  id SERIAL PRIMARY KEY,
  company TEXT NOT NULL,
  ats TEXT NOT NULL,
  token TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL DEFAULT 'manual',
  last_checked_at TIMESTAMPTZ,
  last_jobs INT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ats, token)
);
CREATE TABLE IF NOT EXISTS scout_watchlist_misses (
  company TEXT PRIMARY KEY,
  tried_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  run_id INT REFERENCES scout_runs(id),
  source TEXT NOT NULL,
  external_id TEXT,
  url TEXT NOT NULL,
  company TEXT NOT NULL,
  real_employer TEXT,
  role TEXT NOT NULL,
  location TEXT,
  work_mode TEXT,
  posted_at TIMESTAMPTZ,
  is_repost BOOLEAN,
  repost_proof TEXT,
  min_years NUMERIC,
  years_quote TEXT,
  requires_cs_degree BOOLEAN NOT NULL DEFAULT FALSE,
  swe_focused BOOLEAN NOT NULL DEFAULT FALSE,
  is_agency BOOLEAN NOT NULL DEFAULT FALSE,
  hiring_manager TEXT,
  salary_min INT,
  salary_max INT,
  skills TEXT[] NOT NULL DEFAULT '{}',
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  fit_score NUMERIC,
  fit_reason TEXT,
  resume TEXT,
  flags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'shortlisted',
  reject_reasons TEXT[] NOT NULL DEFAULT '{}',
  application_id INT REFERENCES applications(id),
  qa_checked BOOLEAN NOT NULL DEFAULT FALSE,
  qa_result TEXT,
  extracted JSONB NOT NULL DEFAULT '{}'::jsonb,
  found_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_source_ext_idx ON jobs (source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status, fit_score DESC);
CREATE INDEX IF NOT EXISTS jobs_company_idx ON jobs (lower(company));
CREATE TABLE IF NOT EXISTS job_skills (
  job_id INT NOT NULL REFERENCES jobs(id),
  skill TEXT NOT NULL,
  PRIMARY KEY (job_id, skill)
);
`;
