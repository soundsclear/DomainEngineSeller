CREATE TABLE users (
  id text PRIMARY KEY NOT NULL,
  email text NOT NULL,
  password_hash text,
  role text NOT NULL DEFAULT 'admin',
  created_at integer NOT NULL
);

CREATE TABLE domains (
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

CREATE TABLE domain_scores (
  id text PRIMARY KEY NOT NULL,
  domain_id text NOT NULL,
  readability_score integer NOT NULL,
  brandability_score integer NOT NULL,
  end_user_count_score integer NOT NULL,
  extension_quality_score integer NOT NULL,
  created_at integer NOT NULL,
  FOREIGN KEY (domain_id) REFERENCES domains(id)
);

CREATE TABLE price_recommendations (
  id text PRIMARY KEY NOT NULL,
  domain_id text NOT NULL,
  quick_sale_price integer NOT NULL,
  target_price integer NOT NULL,
  aspirational_price integer NOT NULL,
  confidence_score integer NOT NULL,
  rationale text NOT NULL,
  domain_type text NOT NULL,
  created_at integer NOT NULL,
  FOREIGN KEY (domain_id) REFERENCES domains(id)
);

CREATE TABLE leads (
  id text PRIMARY KEY NOT NULL,
  domain_id text,
  company_name text NOT NULL,
  website text,
  buyer_fit_reason text,
  priority_score integer NOT NULL DEFAULT 0,
  do_not_contact integer NOT NULL DEFAULT 0,
  country text,
  source text,
  created_at integer NOT NULL,
  FOREIGN KEY (domain_id) REFERENCES domains(id)
);

CREATE TABLE lead_reasons (
  id text PRIMARY KEY NOT NULL,
  lead_id text NOT NULL,
  reason text NOT NULL,
  created_at integer NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);

CREATE TABLE contacts (
  id text PRIMARY KEY NOT NULL,
  lead_id text,
  contact_name text,
  contact_role text,
  contact_email text,
  contact_page_url text,
  created_at integer NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);

CREATE TABLE outreach_threads (
  id text PRIMARY KEY NOT NULL,
  lead_id text NOT NULL,
  domain_id text,
  status text NOT NULL,
  auto_send_enabled integer NOT NULL DEFAULT 0,
  last_message_at integer,
  created_at integer NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id),
  FOREIGN KEY (domain_id) REFERENCES domains(id)
);

CREATE TABLE messages (
  id text PRIMARY KEY NOT NULL,
  thread_id text NOT NULL,
  direction text NOT NULL,
  channel text NOT NULL,
  subject text,
  body text NOT NULL,
  classification text,
  sent_at integer,
  created_at integer NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES outreach_threads(id)
);

CREATE TABLE followup_tasks (
  id text PRIMARY KEY NOT NULL,
  thread_id text NOT NULL,
  due_at integer NOT NULL,
  status text NOT NULL,
  created_at integer NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES outreach_threads(id)
);

CREATE TABLE inbound_inquiries (
  id text PRIMARY KEY NOT NULL,
  domain_id text,
  thread_id text,
  inquiry_type text NOT NULL,
  sender_name text,
  sender_email text NOT NULL,
  message text NOT NULL,
  offer_amount integer,
  created_at integer NOT NULL,
  FOREIGN KEY (domain_id) REFERENCES domains(id),
  FOREIGN KEY (thread_id) REFERENCES outreach_threads(id)
);

CREATE TABLE marketplace_listings (
  id text PRIMARY KEY NOT NULL,
  domain_id text NOT NULL,
  afternic_listed integer NOT NULL DEFAULT 0,
  sedo_listed integer NOT NULL DEFAULT 0,
  marketplace_price integer,
  nameserver_mode text,
  lander_mode text,
  external_sale_reference text,
  platform_status text,
  expected_payout integer,
  created_at integer NOT NULL,
  FOREIGN KEY (domain_id) REFERENCES domains(id)
);

CREATE TABLE deals (
  id text PRIMARY KEY NOT NULL,
  domain_id text NOT NULL,
  lead_id text,
  closing_method text NOT NULL,
  status text NOT NULL,
  agreed_price integer,
  payment_secured integer NOT NULL DEFAULT 0,
  buyer_approval_state text,
  created_at integer NOT NULL,
  updated_at integer NOT NULL,
  FOREIGN KEY (domain_id) REFERENCES domains(id),
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);

CREATE TABLE deal_events (
  id text PRIMARY KEY NOT NULL,
  deal_id text NOT NULL,
  event_type text NOT NULL,
  notes text,
  created_at integer NOT NULL,
  FOREIGN KEY (deal_id) REFERENCES deals(id)
);

CREATE TABLE transfer_tasks (
  id text PRIMARY KEY NOT NULL,
  deal_id text NOT NULL,
  registrar text NOT NULL,
  action_type text NOT NULL,
  status text NOT NULL,
  checklist_json text NOT NULL,
  deadline_at integer,
  manual_checkpoint_required integer NOT NULL DEFAULT 1,
  created_at integer NOT NULL,
  FOREIGN KEY (deal_id) REFERENCES deals(id)
);

CREATE TABLE provider_transactions (
  id text PRIMARY KEY NOT NULL,
  deal_id text NOT NULL,
  provider text NOT NULL,
  provider_reference text NOT NULL,
  status text NOT NULL,
  amount integer,
  created_at integer NOT NULL,
  FOREIGN KEY (deal_id) REFERENCES deals(id)
);

CREATE TABLE invoices (
  id text PRIMARY KEY NOT NULL,
  deal_id text NOT NULL,
  stripe_customer_id text,
  stripe_invoice_id text,
  invoice_status text NOT NULL,
  invoice_url text,
  invoice_sent_at integer,
  paid_at integer,
  created_at integer NOT NULL,
  FOREIGN KEY (deal_id) REFERENCES deals(id)
);

CREATE TABLE settings (
  id text PRIMARY KEY NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  updated_at integer NOT NULL
);

CREATE TABLE audit_log (
  id text PRIMARY KEY NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  actor text NOT NULL,
  metadata_json text,
  created_at integer NOT NULL
);
