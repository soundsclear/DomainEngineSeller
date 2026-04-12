import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SectionCard } from '@/components/SectionCard'
import {
  classifyInquiryApi,
  draftInquiryReplyApi,
  fetchInquiryThread,
  markInquiryRead,
  negotiateInquiryCounterApi,
  type InquiryThreadMessage,
  type InquiryWithThreadRecord,
  type NegotiationDraftRecord,
} from '@/lib/api'
import { formatCurrency } from '@/lib/formatters'

const CLASSIFICATION_LABELS: Record<string, string> = {
  serious_offer: 'Serious offer',
  info_request: 'Info request',
  lowball: 'Lowball',
  spam: 'Spam',
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  serious_offer: 'bg-emerald-100 text-emerald-800',
  info_request: 'bg-blue-100 text-blue-800',
  lowball: 'bg-yellow-100 text-yellow-800',
  spam: 'bg-red-100 text-red-800',
}

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-slate-900 text-white',
  read: 'bg-slate-100 text-slate-700',
  replied: 'bg-emerald-100 text-emerald-800',
}

function parseNegotiationDraft(message: InquiryThreadMessage): NegotiationDraftRecord | null {
  if (message.classification !== 'negotiation_draft') {
    return null
  }

  try {
    const parsed = JSON.parse(message.body) as Partial<NegotiationDraftRecord>
    if (
      typeof parsed.suggestedPrice === 'number' &&
      typeof parsed.reasoning === 'string' &&
      typeof parsed.draftSubject === 'string' &&
      typeof parsed.draftBody === 'string'
    ) {
      return {
        suggestedPrice: parsed.suggestedPrice,
        reasoning: parsed.reasoning,
        draftSubject: parsed.draftSubject,
        draftBody: parsed.draftBody,
      }
    }
  } catch {
    return null
  }

  return null
}

export function InquiryThreadPage() {
  const { inquiryId } = useParams<{ inquiryId: string }>()
  const [data, setData] = useState<InquiryWithThreadRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [classifying, setClassifying] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [negotiating, setNegotiating] = useState(false)
  const [draftResult, setDraftResult] = useState<{ subject: string; body: string } | null>(null)
  const [negotiationResult, setNegotiationResult] = useState<NegotiationDraftRecord | null>(null)
  const [dealState, setDealState] = useState<{ dealId: string; created: boolean } | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!inquiryId) return

    let cancelled = false

    const loadThread = async () => {
      try {
        const result = await fetchInquiryThread(inquiryId)
        if (cancelled) return

        setData(result)

        const latestDraft = [...result.messages]
          .reverse()
          .find((message) => message.classification === 'draft_reply')
        setDraftResult(
          latestDraft && latestDraft.subject
            ? { subject: latestDraft.subject, body: latestDraft.body }
            : null,
        )

        const latestNegotiation = [...result.messages]
          .reverse()
          .map(parseNegotiationDraft)
          .find((item): item is NegotiationDraftRecord => item != null)
        setNegotiationResult(latestNegotiation ?? null)

        if (result.inquiry.status === 'new') {
          void markInquiryRead(inquiryId).catch(() => {
            // non-critical
          })
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load thread.')
        }
      }
    }

    void loadThread()

    return () => {
      cancelled = true
    }
  }, [inquiryId])

  if (error) {
    return <SectionCard title="Error loading thread">{error}</SectionCard>
  }

  if (!data) {
    return <SectionCard title="Loading" subtitle="Thread ophalen...">Even geduld.</SectionCard>
  }

  const { inquiry, messages } = data

  return (
    <div className="space-y-6">
      <SectionCard
        title={`Inquiry from ${inquiry.senderName ?? inquiry.senderEmail}`}
        subtitle={inquiry.domainName ?? 'Unknown domain'}
      >
        <div className="flex flex-wrap gap-2 text-sm">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[inquiry.status] ?? STATUS_COLORS.read}`}
          >
            {inquiry.status}
          </span>
          {inquiry.classification ? (
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${CLASSIFICATION_COLORS[inquiry.classification] ?? 'bg-slate-100 text-slate-700'}`}
            >
              {CLASSIFICATION_LABELS[inquiry.classification] ?? inquiry.classification}
            </span>
          ) : null}
          {inquiry.offerAmount ? (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">
              {formatCurrency(inquiry.offerAmount)}
            </span>
          ) : null}
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-700">{inquiry.message}</p>

        {inquiry.classificationReason ? (
          <p className="mt-2 text-xs italic text-slate-400">{inquiry.classificationReason}</p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={classifying}
            onClick={async () => {
              setClassifying(true)
              setActionMessage(null)
              try {
                const result = await classifyInquiryApi(inquiryId!)
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        inquiry: {
                          ...prev.inquiry,
                          classification: result.classification,
                          classificationReason: result.reason,
                        },
                      }
                    : prev,
                )
                setActionMessage(
                  `Classified as: ${CLASSIFICATION_LABELS[result.classification] ?? result.classification}`,
                )
              } catch (err) {
                setActionMessage(err instanceof Error ? err.message : 'Classification failed.')
              } finally {
                setClassifying(false)
              }
            }}
            className="rounded-lg bg-emerald-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {classifying ? 'Classifying...' : 'Classify'}
          </button>

          <button
            type="button"
            disabled={drafting}
            onClick={async () => {
              setDrafting(true)
              setActionMessage(null)
              try {
                const result = await draftInquiryReplyApi(inquiryId!)
                setDraftResult(result.draft)
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        messages: [
                          ...prev.messages,
                          {
                            id: result.draft.id,
                            direction: 'outbound',
                            channel: 'email',
                            subject: result.draft.subject,
                            body: result.draft.body,
                            classification: 'draft_reply',
                            sentAt: null,
                            createdAt: Date.now(),
                          },
                        ],
                      }
                    : prev,
                )
              } catch (err) {
                setActionMessage(err instanceof Error ? err.message : 'Draft generation failed.')
              } finally {
                setDrafting(false)
              }
            }}
            className="rounded-lg border border-emerald-900 px-4 py-2 text-sm text-emerald-900 disabled:opacity-50"
          >
            {drafting ? 'Generating...' : 'Draft reply'}
          </button>

          {inquiry.classification === 'serious_offer' ? (
            <button
              type="button"
              disabled={negotiating}
              onClick={async () => {
                setNegotiating(true)
                setActionMessage(null)
                try {
                  const result = await negotiateInquiryCounterApi(inquiryId!)
                  setNegotiationResult(result.negotiation)
                  setDealState(result.deal)
                  setData((prev) =>
                    prev
                      ? {
                          ...prev,
                          messages: [
                            ...prev.messages,
                            {
                              id: result.draft.id,
                              direction: 'outbound',
                              channel: 'email',
                              subject: result.negotiation.draftSubject,
                              body: JSON.stringify(result.negotiation),
                              classification: 'negotiation_draft',
                              sentAt: null,
                              createdAt: Date.now(),
                            },
                          ],
                        }
                      : prev,
                  )
                  setActionMessage(
                    result.deal.created
                      ? `Deal ${result.deal.dealId} started. Counter-offer draft saved to the thread.`
                      : `Counter-offer draft saved to existing deal ${result.deal.dealId}.`,
                  )
                } catch (err) {
                  setActionMessage(err instanceof Error ? err.message : 'Negotiation draft failed.')
                } finally {
                  setNegotiating(false)
                }
              }}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 disabled:opacity-50"
            >
              {negotiating ? 'Thinking...' : 'Suggest counter-offer'}
            </button>
          ) : null}

          <Link
            to="/admin/inbox"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {'<- Terug naar inbox'}
          </Link>
        </div>

        {actionMessage ? (
          <p className="mt-3 text-sm text-slate-600">{actionMessage}</p>
        ) : null}
      </SectionCard>

      {draftResult ? (
        <SectionCard
          title="Draft reply"
          subtitle="Bekijk en verstuur handmatig via je e-mailclient - nooit automatisch verzonden."
        >
          <p className="text-sm font-medium text-slate-900">Subject: {draftResult.subject}</p>
          <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            {draftResult.body}
          </pre>
          <p className="mt-2 text-xs text-slate-400">
            Dit concept is opgeslagen in de thread. Kopieer en verstuur via je e-mailclient.
          </p>
        </SectionCard>
      ) : null}

      {negotiationResult ? (
        <SectionCard
          title="Counter-offer suggestion"
          subtitle="Draft-only voorstel op basis van de prijsbanden van dit domein."
        >
          <div className="rounded-2xl bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Suggested counter-offer
            </p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">
              {formatCurrency(negotiationResult.suggestedPrice)}
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-700">{negotiationResult.reasoning}</p>
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-900">
              Subject: {negotiationResult.draftSubject}
            </p>
            <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {negotiationResult.draftBody}
            </pre>
          </div>

          {dealState ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white p-4">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {dealState.created ? 'Deal gestart' : 'Bestaande deal gekoppeld'}
                </p>
                <p className="mt-1 text-sm text-slate-600">{dealState.dealId}</p>
              </div>
              <Link
                to="/admin/deals"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
              >
                Open deals
              </Link>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      <SectionCard
        title="Berichtenhistorie"
        subtitle={`${messages.length} bericht${messages.length !== 1 ? 'en' : ''} in deze thread`}
      >
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500">Geen berichten gevonden in deze thread.</p>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => {
              const negotiationDraft = parseNegotiationDraft(msg)

              return (
                <div
                  key={msg.id}
                  className={`rounded-xl p-4 text-sm ${
                    msg.direction === 'inbound' ? 'bg-slate-50' : 'bg-emerald-50'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      {msg.direction === 'inbound'
                        ? 'Inbound'
                        : msg.classification === 'negotiation_draft'
                          ? 'Negotiation draft'
                          : msg.classification === 'draft_reply'
                            ? 'Concept (niet verzonden)'
                            : 'Outbound'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {msg.sentAt ? new Date(msg.sentAt).toLocaleString('nl-NL') : 'Niet verzonden'}
                    </span>
                  </div>

                  {negotiationDraft ? (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-slate-900">
                        Counter-offer: {formatCurrency(negotiationDraft.suggestedPrice)}
                      </p>
                      <p className="leading-6 text-slate-700">{negotiationDraft.reasoning}</p>
                      <div className="rounded-lg bg-white/70 p-3">
                        <p className="font-medium text-slate-800">{negotiationDraft.draftSubject}</p>
                        <p className="mt-2 whitespace-pre-wrap leading-6 text-slate-700">
                          {negotiationDraft.draftBody}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {msg.subject ? (
                        <p className="mb-1 font-medium text-slate-800">{msg.subject}</p>
                      ) : null}
                      <p className="whitespace-pre-wrap leading-6 text-slate-700">{msg.body}</p>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
