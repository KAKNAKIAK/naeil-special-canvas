const GETTY_ORIGIN = 'https://www.gettyimagesbank.com'

function decodeHtml(value = '') {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function textOnly(value = '') {
  return decodeHtml(String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
}

function attribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const quoted = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'))
  if (quoted) return decodeHtml(quoted[2].trim())
  const bare = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*([^\\s>]+)`, 'i'))
  return bare ? decodeHtml(bare[1].trim()) : ''
}

function metaContent(html, key) {
  const tags = String(html).match(/<meta\b[^>]*>/gi) || []
  const wanted = key.toLowerCase()
  for (const tag of tags) {
    const property = attribute(tag, 'property').toLowerCase()
    const name = attribute(tag, 'name').toLowerCase()
    if (property === wanted || name === wanted) return attribute(tag, 'content')
  }
  return ''
}

function contentIdFromUrl(rawUrl) {
  try {
    const url = new URL(rawUrl, GETTY_ORIGIN)
    const match = url.pathname.match(/\/view\/[^/]+\/(\d+)\/?$/i)
    return match ? match[1] : ''
  } catch {
    return ''
  }
}

function exactDetailUrl(searchHtml, contentId) {
  const pattern = /href\s*=\s*(["'])([^"']*\/view\/[^"'#?<>\s]+\/\d+[^"']*)\1/gi
  let match
  while ((match = pattern.exec(String(searchHtml)))) {
    const candidate = decodeHtml(match[2])
    if (contentIdFromUrl(candidate) !== contentId) continue
    try { return new URL(candidate, GETTY_ORIGIN).href } catch { /* continue */ }
  }
  return ''
}

function pageTitle(html) {
  const description = metaContent(html, 'og:description')
  if (description) return description
  const title = metaContent(html, 'og:title') || (String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
  return textOnly(title).replace(/\s*이미지\s*\(\d+\).*$/i, '').trim()
}

function searchUrl(contentId) {
  const query = new URLSearchParams({ st: 'union', lv: 'si', mi: '2', q: contentId, ssi: 'go', sort: 'bm', rows: '20', zm: 'on' })
  return `${GETTY_ORIGIN}/s/?${query}`
}

function validHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
}

/**
 * Resolves only public Getty Images Bank metadata. It never logs in, retains a
 * session, downloads originals, or derives a URL from an ID without verifying
 * the exact matching search result and detail page.
 */
async function lookupGettyContent(rawContentId, fetchHtml) {
  const contentId = String(rawContentId || '').trim()
  if (!/^\d+$/.test(contentId)) return { contentId, title: '', pageUrl: '', thumbUrl: '', status: 'error', errorMessage: '콘텐츠 번호는 숫자만 입력할 수 있습니다.' }
  if (typeof fetchHtml !== 'function') return { contentId, title: '', pageUrl: '', thumbUrl: '', status: 'error', errorMessage: '조회 기능을 준비하지 못했습니다.' }

  try {
    const searchHtml = await fetchHtml(searchUrl(contentId))
    const searchDetailUrl = exactDetailUrl(searchHtml, contentId)
    if (!searchDetailUrl) return { contentId, title: '', pageUrl: '', thumbUrl: '', status: 'not_found', errorMessage: '공개 검색 결과에서 일치하는 콘텐츠 번호를 찾지 못했습니다.' }

    const detailHtml = await fetchHtml(searchDetailUrl)
    const canonicalUrl = validHttpUrl(metaContent(detailHtml, 'og:url')) || searchDetailUrl
    if (contentIdFromUrl(canonicalUrl) !== contentId) return { contentId, title: '', pageUrl: '', thumbUrl: '', status: 'error', errorMessage: '상세 페이지의 콘텐츠 번호가 입력값과 다릅니다.' }

    return {
      contentId,
      title: pageTitle(detailHtml),
      pageUrl: canonicalUrl,
      thumbUrl: validHttpUrl(metaContent(detailHtml, 'og:image')),
      status: 'found',
      errorMessage: '',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { contentId, title: '', pageUrl: '', thumbUrl: '', status: 'error', errorMessage: `공개 페이지 조회 중 오류가 발생했습니다. ${message}` }
  }
}

module.exports = { contentIdFromUrl, exactDetailUrl, lookupGettyContent, metaContent, pageTitle, searchUrl }
