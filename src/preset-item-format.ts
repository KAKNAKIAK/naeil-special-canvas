/**
 * Preserves user-entered whitespace in the compact item values used by the
 * reference-layout presets. Only the separator's own single padding space is
 * removed while parsing.
 */
function withoutSeparatorPadding(value: string, leading = false, trailing = false) {
  let next = value
  if (leading && next.startsWith(' ')) next = next.slice(1)
  if (trailing && next.endsWith(' ')) next = next.slice(0, -1)
  return next
}

export function joinPair(title: string, body: string) { return `${title} | ${body}` }

export function splitPair(value: string) {
  const parts = value.split('|')
  return {
    title: withoutSeparatorPadding(parts[0] || '', false, parts.length > 1),
    body: withoutSeparatorPadding(parts.slice(1).join('|'), parts.length > 1),
  }
}

export function joinTimeline(time: string, title: string, body: string) { return `${time} | ${title} | ${body}` }

export function splitTimeline(value: string) {
  const parts = value.split('|')
  return {
    time: withoutSeparatorPadding(parts[0] || '', false, parts.length > 1),
    title: withoutSeparatorPadding(parts[1] || '', parts.length > 1, parts.length > 2),
    body: withoutSeparatorPadding(parts.slice(2).join('|'), parts.length > 2),
  }
}
