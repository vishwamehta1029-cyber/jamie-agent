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
  ('guessing_paused', 'false')
ON CONFLICT (key) DO NOTHING;
DELETE FROM settings WHERE key IN ('weekly_bounce_cap', 'weekly_bounce_rate_pct', 'min_sends_for_rate');
`;
