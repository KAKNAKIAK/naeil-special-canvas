const COLOR_VALUES = new Set(['#172326', '#07858b', '#e46555', '#ff5a00'])
const SIZE_VALUES = new Set(['0.78em', '1em', '1.32em'])
const COLOR_ALIASES: Record<string, string> = {
  'rgb(23,35,38)': '#172326',
  'rgb(7,133,139)': '#07858b',
  'rgb(228,101,85)': '#e46555',
  'rgb(255,90,0)': '#ff5a00',
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!)
}

function normalizeLineBreakMarkup(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/<(div|p|li|blockquote|h[1-6])\b[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/\1>/gi, '<br>')
    .replace(/<(div|p|li|blockquote|h[1-6])\b[^>]*>/gi, '<br>')
    .replace(/<\/(div|p|li|blockquote|h[1-6])>/gi, '')
    .replace(/^(?:<br\s*\/?>)+/i, '')
    .replace(/(?:<br\s*\/?>)+(?:\s|&nbsp;)*$/i, '')
}

function fontSize(size: string | null) {
  if (size === '2') return '0.78em'
  if (size === '5') return '1.32em'
  return '1em'
}

function normalizeColor(value: string) {
  const compact = value.replace(/\s+/g, '').toLowerCase()
  return COLOR_ALIASES[compact] || compact
}

/** Keeps only the minimal inline formatting supported by the common-text editor. */
export function sanitizeRichText(value: string) {
  const normalized = normalizeLineBreakMarkup(value)
  if (typeof document === 'undefined') {
    const breakToken = '\uE000'
    return escapeHtml(normalized.replace(/<br\s*\/?>/gi, breakToken)).replace(/\n/g, '<br>').replaceAll(breakToken, '<br>')
  }
  const source = document.createElement('div')
  const output = document.createElement('div')
  source.innerHTML = normalized.replace(/\n/g, '<br>')
  const copyChildren = (from: Node, to: HTMLElement | DocumentFragment) => {
    from.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) { to.append(document.createTextNode(node.textContent || '')); return }
      if (node.nodeType !== Node.ELEMENT_NODE) return
      const element = node as HTMLElement
      if (element.tagName === 'BR') { to.append(document.createElement('br')); return }
      const fragment = document.createDocumentFragment()
      copyChildren(element, fragment)
      if (element.tagName === 'STRONG' || element.tagName === 'B') {
        const strong = document.createElement('strong'); strong.append(fragment); to.append(strong); return
      }
      if (element.tagName === 'SPAN' || element.tagName === 'FONT') {
        const color = normalizeColor(element.style.color || element.getAttribute('color') || '')
        const size = element.style.fontSize || fontSize(element.getAttribute('size'))
        const span = document.createElement('span')
        if (COLOR_VALUES.has(color)) span.style.color = color
        if (SIZE_VALUES.has(size)) span.style.fontSize = size
        if (span.style.length) { span.append(fragment); to.append(span) } else to.append(fragment)
        return
      }
      to.append(fragment)
    })
  }
  copyChildren(source, output)
  return output.innerHTML
}

/** True when text or supported inline markup has no visible characters. */
export function isRichTextEmpty(value: string | undefined | null) {
  if (!value) return true
  const visible = value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .trim()
  return !visible
}

/** Returns readable text for compact UI labels while keeping the rich HTML source untouched. */
export function richTextToPlainText(value: string | undefined | null) {
  if (!value) return ''
  return value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:div|p|li|blockquote|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export const RICH_TEXT_COLORS = [
  { value: '#172326', label: '기본색' },
  { value: '#07858b', label: '청록' },
  { value: '#e46555', label: '코랄' },
  { value: '#ff5a00', label: '주황' },
] as const

export const RICH_TEXT_SIZES = [
  { value: '0.78em', label: '소', command: '2' },
  { value: '1em', label: '기본', command: '3' },
  { value: '1.32em', label: '크게', command: '5' },
] as const
