export function normalizeWebsiteKey(website: string) {
  const trimmed = website.trim()
  if (!trimmed) {
    return null
  }

  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    return url.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

export function canonicalizeWebsiteUrl(website: string) {
  const trimmed = website.trim()
  if (!trimmed) {
    return null
  }

  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    url.hash = ''
    url.search = ''
    url.pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}
