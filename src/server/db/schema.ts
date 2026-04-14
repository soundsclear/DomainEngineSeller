import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('admin'),
  createdAt: integer('created_at').notNull(),
})

export const domains = sqliteTable('domains', {
  id: text('id').primaryKey(),
  domainName: text('domain_name').notNull(),
  tld: text('tld').notNull(),
  language: text('language'),
  notes: text('notes'),
  category: text('category'),
  status: text('status').notNull(),
  sellMode: text('sell_mode').notNull(),
  currentRegistrar: text('current_registrar').notNull(),
  currentRegistrarReference: text('current_registrar_reference'),
  acquisitionCost: real('acquisition_cost'),
  annualRenewalCost: real('annual_renewal_cost'),
  trafficNotes: text('traffic_notes'),
  whoisOwnerState: text('whois_owner_state'),
  nameserverState: text('nameserver_state'),
  authCodeStatus: text('auth_code_status'),
  migrationCandidate: integer('migration_candidate', { mode: 'boolean' }).notNull().default(false),
  targetRegistrar: text('target_registrar'),
  transferEligibility: text('transfer_eligibility'),
  migrationPriority: text('migration_priority'),
  migrationNotes: text('migration_notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const domainScores = sqliteTable('domain_scores', {
  id: text('id').primaryKey(),
  domainId: text('domain_id').notNull().references(() => domains.id),
  readabilityScore: integer('readability_score').notNull(),
  brandabilityScore: integer('brandability_score').notNull(),
  endUserCountScore: integer('end_user_count_score').notNull(),
  extensionQualityScore: integer('extension_quality_score').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const priceRecommendations = sqliteTable('price_recommendations', {
  id: text('id').primaryKey(),
  domainId: text('domain_id').notNull().references(() => domains.id),
  quickSalePrice: integer('quick_sale_price').notNull(),
  targetPrice: integer('target_price').notNull(),
  aspirationalPrice: integer('aspirational_price').notNull(),
  confidenceScore: integer('confidence_score').notNull(),
  rationale: text('rationale').notNull(),
  domainType: text('domain_type').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const leads = sqliteTable('leads', {
  id: text('id').primaryKey(),
  domainId: text('domain_id').references(() => domains.id),
  companyName: text('company_name').notNull(),
  website: text('website'),
  buyerFitReason: text('buyer_fit_reason'),
  priorityScore: integer('priority_score').notNull().default(0),
  doNotContact: integer('do_not_contact', { mode: 'boolean' }).notNull().default(false),
  country: text('country'),
  source: text('source'),
  createdAt: integer('created_at').notNull(),
})

export const leadEnrichmentRuns = sqliteTable('lead_enrichment_runs', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => leads.id),
  provider: text('provider').notNull(),
  actorId: text('actor_id').notNull(),
  status: text('status').notNull(),
  sourceWebsite: text('source_website'),
  rawPayloadJson: text('raw_payload_json'),
  errorMessage: text('error_message'),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  createdAt: integer('created_at').notNull(),
})

export const domainPageContent = sqliteTable('domain_page_content', {
  domainId: text('domain_id')
    .primaryKey()
    .references(() => domains.id),
  seoTitle: text('seo_title').notNull(),
  metaDescription: text('meta_description').notNull(),
  heroHeadline: text('hero_headline').notNull(),
  heroSubheadline: text('hero_subheadline').notNull(),
  bodyContent: text('body_content').notNull(),
  contentStatus: text('content_status').notNull().default('draft'),
  generatedAt: integer('generated_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const leadReasons = sqliteTable('lead_reasons', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => leads.id),
  reason: text('reason').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const contacts = sqliteTable('contacts', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').references(() => leads.id),
  contactName: text('contact_name'),
  contactRole: text('contact_role'),
  contactEmail: text('contact_email'),
  contactPageUrl: text('contact_page_url'),
  createdAt: integer('created_at').notNull(),
})

export const leadContactPoints = sqliteTable('lead_contact_points', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => leads.id),
  runId: text('run_id').references(() => leadEnrichmentRuns.id),
  type: text('type').notNull(),
  value: text('value').notNull(),
  label: text('label'),
  sourceUrl: text('source_url'),
  confidence: integer('confidence').notNull().default(50),
  createdAt: integer('created_at').notNull(),
})

export const outreachThreads = sqliteTable('outreach_threads', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => leads.id),
  domainId: text('domain_id').references(() => domains.id),
  status: text('status').notNull(),
  autoSendEnabled: integer('auto_send_enabled', { mode: 'boolean' }).notNull().default(false),
  lastMessageAt: integer('last_message_at'),
  createdAt: integer('created_at').notNull(),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull().references(() => outreachThreads.id),
  direction: text('direction').notNull(),
  channel: text('channel').notNull(),
  subject: text('subject'),
  body: text('body').notNull(),
  classification: text('classification'),
  sentAt: integer('sent_at'),
  createdAt: integer('created_at').notNull(),
})

export const followupTasks = sqliteTable('followup_tasks', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull().references(() => outreachThreads.id),
  dueAt: integer('due_at').notNull(),
  status: text('status').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const inboundInquiries = sqliteTable('inbound_inquiries', {
  id: text('id').primaryKey(),
  domainId: text('domain_id').references(() => domains.id),
  threadId: text('thread_id').references(() => outreachThreads.id),
  inquiryType: text('inquiry_type').notNull(),
  senderName: text('sender_name'),
  senderEmail: text('sender_email').notNull(),
  message: text('message').notNull(),
  offerAmount: integer('offer_amount'),
  status: text('status').notNull().default('new'),
  classification: text('classification'),
  classificationReason: text('classification_reason'),
  createdAt: integer('created_at').notNull(),
})

export const marketplaceListings = sqliteTable('marketplace_listings', {
  id: text('id').primaryKey(),
  domainId: text('domain_id').notNull().references(() => domains.id),
  afternicListed: integer('afternic_listed', { mode: 'boolean' }).notNull().default(false),
  sedoListed: integer('sedo_listed', { mode: 'boolean' }).notNull().default(false),
  marketplacePrice: integer('marketplace_price'),
  nameserverMode: text('nameserver_mode'),
  landerMode: text('lander_mode'),
  externalSaleReference: text('external_sale_reference'),
  platformStatus: text('platform_status'),
  expectedPayout: integer('expected_payout'),
  createdAt: integer('created_at').notNull(),
})

export const deals = sqliteTable('deals', {
  id: text('id').primaryKey(),
  domainId: text('domain_id').notNull().references(() => domains.id),
  leadId: text('lead_id').references(() => leads.id),
  closingMethod: text('closing_method').notNull(),
  status: text('status').notNull(),
  agreedPrice: integer('agreed_price'),
  paymentSecured: integer('payment_secured', { mode: 'boolean' }).notNull().default(false),
  buyerApprovalState: text('buyer_approval_state'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const dealEvents = sqliteTable('deal_events', {
  id: text('id').primaryKey(),
  dealId: text('deal_id').notNull().references(() => deals.id),
  eventType: text('event_type').notNull(),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
})

export const transferTasks = sqliteTable('transfer_tasks', {
  id: text('id').primaryKey(),
  dealId: text('deal_id').notNull().references(() => deals.id),
  registrar: text('registrar').notNull(),
  actionType: text('action_type').notNull(),
  status: text('status').notNull(),
  checklistJson: text('checklist_json').notNull(),
  deadlineAt: integer('deadline_at'),
  manualCheckpointRequired: integer('manual_checkpoint_required', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
})

export const providerTransactions = sqliteTable('provider_transactions', {
  id: text('id').primaryKey(),
  dealId: text('deal_id').notNull().references(() => deals.id),
  provider: text('provider').notNull(),
  providerReference: text('provider_reference').notNull(),
  status: text('status').notNull(),
  amount: integer('amount'),
  createdAt: integer('created_at').notNull(),
})

export const invoices = sqliteTable('invoices', {
  id: text('id').primaryKey(),
  dealId: text('deal_id').notNull().references(() => deals.id),
  stripeCustomerId: text('stripe_customer_id'),
  stripeInvoiceId: text('stripe_invoice_id'),
  invoiceStatus: text('invoice_status').notNull(),
  invoiceUrl: text('invoice_url'),
  invoiceSentAt: integer('invoice_sent_at'),
  paidAt: integer('paid_at'),
  createdAt: integer('created_at').notNull(),
})

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),
  actor: text('actor').notNull(),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at').notNull(),
})
