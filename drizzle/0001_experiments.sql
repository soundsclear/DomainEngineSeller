CREATE TABLE experiments (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at integer NOT NULL
);

CREATE TABLE experiment_variants (
  id text PRIMARY KEY NOT NULL,
  experiment_id text NOT NULL REFERENCES experiments(id),
  label text NOT NULL,
  tone text NOT NULL DEFAULT 'standard',
  has_price integer NOT NULL DEFAULT 0,
  subject_slot text NOT NULL DEFAULT 'default',
  followup_days_1 integer NOT NULL DEFAULT 5,
  followup_days_2 integer NOT NULL DEFAULT 7
);

CREATE TABLE experiment_assignments (
  id text PRIMARY KEY NOT NULL,
  experiment_id text NOT NULL REFERENCES experiments(id),
  variant_id text NOT NULL REFERENCES experiment_variants(id),
  lead_id text NOT NULL REFERENCES leads(id),
  thread_id text REFERENCES outreach_threads(id),
  assigned_at integer NOT NULL
);

CREATE TABLE experiment_outcomes (
  id text PRIMARY KEY NOT NULL,
  assignment_id text NOT NULL REFERENCES experiment_assignments(id),
  outcome_type text NOT NULL,
  value integer,
  occurred_at integer NOT NULL
);
