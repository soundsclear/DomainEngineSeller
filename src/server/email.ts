export interface InquiryNotificationParams {
  domainName: string
  senderName: string
  senderEmail: string
  message: string
  offerAmount: number | null
  inquiryId: string
  threadId: string
}

function buildInquiryHtml(params: InquiryNotificationParams): string {
  const { domainName, senderName, senderEmail, message, offerAmount, inquiryId, threadId } = params

  const offerRow = offerAmount
    ? `<tr><td style="padding:4px 0;color:#666">Offer amount</td><td style="padding:4px 0;font-weight:600">€${offerAmount}</td></tr>`
    : ''

  return `
    <div style="font-family:sans-serif;max-width:560px;color:#1a1a1a">
      <h2 style="margin:0 0 16px">New ${offerAmount ? 'offer' : 'inquiry'} for <strong>${domainName}</strong></h2>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:4px 0;color:#666">From</td><td style="padding:4px 0">${senderName} &lt;${senderEmail}&gt;</td></tr>
        ${offerRow}
        <tr><td style="padding:4px 0;color:#666;vertical-align:top">Message</td><td style="padding:4px 0">${message}</td></tr>
      </table>
      <hr style="margin:16px 0;border:none;border-top:1px solid #e5e5e5" />
      <p style="margin:0;font-size:12px;color:#999">Inquiry ID: ${inquiryId} · Thread ID: ${threadId}</p>
    </div>
  `
}

async function resendSend(apiKey: string, payload: { from: string; to: string; subject: string; html: string }): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...payload, to: [payload.to] }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Resend ${response.status}: ${body}`)
  }
}

export async function sendInquiryNotification(
  params: InquiryNotificationParams & { apiKey: string; from: string; to: string },
): Promise<void> {
  const { apiKey, from, to, domainName, senderName, offerAmount } = params

  const subject = offerAmount
    ? `New offer for ${domainName}: €${offerAmount} from ${senderName}`
    : `New inquiry for ${domainName} from ${senderName}`

  await resendSend(apiKey, { from, to, subject, html: buildInquiryHtml(params) })
}

export async function sendTestEmail(params: { apiKey: string; from: string; to: string }): Promise<void> {
  await resendSend(params.apiKey, {
    from: params.from,
    to: params.to,
    subject: 'Domain Seller Engine: test email',
    html: '<p>This is a test email from <strong>Domain Seller Engine</strong>. Email sending is configured correctly.</p>',
  })
}
