const outreachSchemaSql = `
CREATE TABLE IF NOT EXISTS domains (
  id text PRIMARY KEY NOT NULL,
  domain_name text NOT NULL,
  tld text NOT NULL,
  language text,
  notes text,
  category text,
  status text NOT NULL,
  sell_mode text NOT NULL,
  current_registrar text NOT NULL,
  current_registrar_reference text,
  acquisition_cost real,
  annual_renewal_cost real,
  traffic_notes text,
  whois_owner_state text,
  nameserver_state text,
  auth_code_status text,
  migration_candidate integer NOT NULL DEFAULT 0,
  target_registrar text,
  transfer_eligibility text,
  migration_priority text,
  migration_notes text,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id text PRIMARY KEY NOT NULL,
  domain_id text,
  company_name text NOT NULL,
  website text,
  buyer_fit_reason text,
  priority_score integer NOT NULL DEFAULT 0,
  do_not_contact integer NOT NULL DEFAULT 0,
  country text,
  source text,
  created_at integer NOT NULL
);

CREATE TABLE IF NOT EXISTS domain_page_content (
  domain_id text PRIMARY KEY NOT NULL,
  seo_title text NOT NULL,
  meta_description text NOT NULL,
  hero_headline text NOT NULL,
  hero_subheadline text NOT NULL,
  body_content text NOT NULL,
  content_status text NOT NULL DEFAULT 'draft',
  generated_at integer,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id text PRIMARY KEY NOT NULL,
  lead_id text,
  contact_name text,
  contact_role text,
  contact_email text,
  contact_page_url text,
  created_at integer NOT NULL
);

CREATE TABLE IF NOT EXISTS outreach_threads (
  id text PRIMARY KEY NOT NULL,
  lead_id text NOT NULL,
  domain_id text,
  status text NOT NULL,
  auto_send_enabled integer NOT NULL DEFAULT 0,
  last_message_at integer,
  created_at integer NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY NOT NULL,
  thread_id text NOT NULL,
  direction text NOT NULL,
  channel text NOT NULL,
  subject text,
  body text NOT NULL,
  classification text,
  sent_at integer,
  created_at integer NOT NULL
);

CREATE TABLE IF NOT EXISTS followup_tasks (
  id text PRIMARY KEY NOT NULL,
  thread_id text NOT NULL,
  due_at integer NOT NULL,
  status text NOT NULL,
  created_at integer NOT NULL
);

CREATE TABLE IF NOT EXISTS inbound_inquiries (
  id text PRIMARY KEY NOT NULL,
  domain_id text,
  thread_id text,
  inquiry_type text NOT NULL,
  sender_name text,
  sender_email text NOT NULL,
  message text NOT NULL,
  offer_amount integer,
  created_at integer NOT NULL
 );

CREATE TABLE IF NOT EXISTS deals (
  id text PRIMARY KEY NOT NULL,
  domain_id text NOT NULL,
  lead_id text,
  closing_method text NOT NULL,
  status text NOT NULL,
  agreed_price integer,
  payment_secured integer NOT NULL DEFAULT 0,
  buyer_approval_state text,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);

CREATE TABLE IF NOT EXISTS deal_events (
  id text PRIMARY KEY NOT NULL,
  deal_id text NOT NULL,
  event_type text NOT NULL,
  notes text,
  created_at integer NOT NULL
);

CREATE TABLE IF NOT EXISTS transfer_tasks (
  id text PRIMARY KEY NOT NULL,
  deal_id text NOT NULL,
  registrar text NOT NULL,
  action_type text NOT NULL,
  status text NOT NULL,
  checklist_json text NOT NULL,
  deadline_at integer,
  manual_checkpoint_required integer NOT NULL DEFAULT 1,
  created_at integer NOT NULL
);
`

let schemaReady = false

export async function ensureOutreachSchema(binding: D1Database) {
  if (schemaReady) {
    return
  }

  const statements = outreachSchemaSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  for (const sql of statements) {
    await binding.prepare(sql).run()
  }

  schemaReady = true
}

export async function ensureInquiryIntelligenceColumns(binding: D1Database) {
  const tableInfo = await binding.prepare('PRAGMA table_info(inbound_inquiries)').all()
  const existingColumns = new Set(
    (tableInfo.results as Array<{ name: string }>).map((r) => r.name),
  )

  if (!existingColumns.has('status')) {
    await binding
      .prepare(`ALTER TABLE inbound_inquiries ADD COLUMN status TEXT NOT NULL DEFAULT 'new'`)
      .run()
  }
  if (!existingColumns.has('classification')) {
    await binding
      .prepare(`ALTER TABLE inbound_inquiries ADD COLUMN classification TEXT`)
      .run()
  }
  if (!existingColumns.has('classification_reason')) {
    await binding
      .prepare(`ALTER TABLE inbound_inquiries ADD COLUMN classification_reason TEXT`)
      .run()
  }
}
