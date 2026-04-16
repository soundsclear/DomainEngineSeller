# A/B Testing & Pricing Intelligence — Design Spec

**Date:** 2026-04-16
**Status:** Approved
**Branch:** feature/inbox-reply-intelligence

---

## Doel

Bijhouden welke outreach-emailvarianten het beste presteren (toon, prijsvermelding, onderwerpregel, follow-up timing) en van verkoopdata leren wat kopers bereid zijn te betalen. Data wordt automatisch verzameld en zichtbaar in de admin UI.

---

## Scope

- Automatische A/B/C/... variant-rotatie bij outreach
- Outcome tracking over de volledige funnel (reply → positief → bod → deal)
- Pricing intelligence: bod vs. vraagprijs vs. slotprijs per categorie
- Admin UI: experiments pagina met resultaten en pricing blok

Buiten scope: automatische winnaar-selectie, statistische significantie-berekening (volume te laag voor domeinverkoop).

---

## Database

### `experiments`

| Kolom | Type | Omschrijving |
|---|---|---|
| `id` | text PK | |
| `name` | text | Bijv. "Eerste mail Q2 2026" |
| `status` | text | `active` / `paused` / `completed` |
| `created_at` | integer | Unix timestamp |

### `experiment_variants`

| Kolom | Type | Omschrijving |
|---|---|---|
| `id` | text PK | |
| `experiment_id` | text FK → experiments | |
| `label` | text | "A", "B", "C", etc. |
| `tone` | text | `concise` / `standard` / `detailed` |
| `has_price` | integer (boolean) | Prijs in eerste mail ja/nee |
| `subject_slot` | text | `default` / `question` / `benefit` |
| `followup_days_1` | integer | Dagen tot follow-up 1 (bijv. 3, 5, 7) |
| `followup_days_2` | integer | Dagen tot follow-up 2 |

### `experiment_assignments`

| Kolom | Type | Omschrijving |
|---|---|---|
| `id` | text PK | |
| `experiment_id` | text FK → experiments | |
| `variant_id` | text FK → experiment_variants | |
| `lead_id` | text FK → leads | |
| `thread_id` | text FK → outreach_threads | nullable, gezet bij verzending |
| `assigned_at` | integer | Unix timestamp |

### `experiment_outcomes`

| Kolom | Type | Omschrijving |
|---|---|---|
| `id` | text PK | |
| `assignment_id` | text FK → experiment_assignments | |
| `outcome_type` | text | `reply_received` / `reply_positive` / `offer_made` / `deal_closed` |
| `value` | integer | Bedrag in eurocenten bij `offer_made` en `deal_closed`, anders null |
| `occurred_at` | integer | Unix timestamp |

---

## Rotatie

Bij het aanmaken van een outreach draft:

1. Zoek het actieve experiment op (één actief experiment tegelijk).
2. Tel bestaande assignments per variant binnen dat experiment.
3. Wijs de lead toe aan de variant met de minste assignments (round-robin).
4. Sla de assignment op in `experiment_assignments`.
5. Gebruik de variant-configuratie (tone, has_price, followup_days) als parameters voor `generateOutreachDraft`.

Als er geen actief experiment is, valt het systeem terug op de handmatige instellingen uit de request.

---

## Outcome tracking

Outcomes worden automatisch gelogd vanuit bestaande worker endpoints — geen handmatig werk vereist.

| Trigger | Outcome type | Waarde |
|---|---|---|
| Inbound inquiry binnenkomt, thread matched aan assignment | `reply_received` | null |
| AI classificeert inquiry als `serious_offer` of `info_request` | `reply_positive` | null |
| Inquiry heeft `offerAmount` | `offer_made` | offerAmount in centen |
| Deal aangemaakt of status `closed` | `deal_closed` | agreedPrice in centen |

Matching: inquiry → thread_id → experiment_assignment.thread_id.

---

## Pricing intelligence

Aparte query over bestaande + nieuwe data:

- Per domein-categorie: gemiddeld eerste bod als % van vraagprijs
- Per domein-categorie: gemiddelde slotprijs vs. vraagprijs
- Aantal datapunten per categorie (betrouwbaarheid indicator)

Geen aparte tabel nodig — berekend uit `experiment_outcomes` (offer_made, deal_closed) gecombineerd met `domains` (targetPrice) en `deals` (agreedPrice).

---

## Admin UI

### Nieuwe pagina: `/admin/experiments`

**Experiment selector** — dropdown of tabs als er meerdere zijn.

**Variant-resultaten tabel:**

| Variant | Label | Verzonden | Replies | Reply rate | Biedingen | Gem. bod | Deals |
|---|---|---|---|---|---|---|---|
| A | concise, geen prijs | 12 | 3 | 25% | 1 | €1.800 | 0 |
| B | standard, geen prijs | 11 | 5 | 45% | 2 | €2.100 | 1 |

**Pricing intelligence blok** (onderaan):

| Categorie | Gem. eerste bod | Als % van vraagprijs | Gem. slotprijs | Datapunten |
|---|---|---|---|---|
| Energy | €1.850 | 74% | €2.400 | 8 |
| Real estate | €3.200 | 64% | €4.100 | 3 |

### Experiment beheer

- Nieuw experiment aanmaken met naam en varianten
- Experiment pauzeren / afsluiten
- Winnende variant instellen als nieuwe standaard (handmatig)

---

## API endpoints

| Method | Path | Omschrijving |
|---|---|---|
| `GET` | `/api/experiments` | Lijst van experimenten |
| `POST` | `/api/experiments` | Nieuw experiment aanmaken |
| `PATCH` | `/api/experiments/:id` | Status wijzigen |
| `GET` | `/api/experiments/:id/results` | Variant-resultaten + pricing intelligence |
| `POST` | `/api/experiments/:id/variants` | Variant toevoegen |

---

## Integratie met bestaande flow

- `generateOutreachDraft` krijgt variant-config als input in plaats van handmatige tone/has_price
- `has_price` wordt een nieuw parameter in `outreachDraftInputSchema` — als `false`, wordt prijs weggelaten uit de initial mail (al geïmplementeerd als gedrag, nu formeel configureerbaar)
- Follow-up timing (`followup_days_1`, `followup_days_2`) vervangt de hardcoded waarden in `outreach-draft.ts`

---

## Fasering

**Fase 1:** Database schema + rotatie-logica + automatische outcome tracking
**Fase 2:** Admin UI experiments pagina
**Fase 3:** Pricing intelligence blok in UI
