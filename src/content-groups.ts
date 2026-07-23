import type { ContentGroup, Section } from './types'

/** Keeps editor groups valid, unique, and aligned to consecutive canvas blocks. */
export function normalizeContentGroups(groups: ContentGroup[] | undefined, sections: Section[]): ContentGroup[] {
  const positions = new Map(sections.map((section, index) => [section.id, index]))
  const assigned = new Set<string>()
  const normalized: ContentGroup[] = []
  for (const group of groups || []) {
    const sectionIds = sections
      .map(section => section.id)
      .filter(id => (group.sectionIds || []).includes(id) && !assigned.has(id))
    const positionsInOrder = sectionIds.map(id => positions.get(id)!)
    const consecutive = positionsInOrder.every((position, index) => index === 0 || position === positionsInOrder[index - 1] + 1)
    if (sectionIds.length < 2 || !consecutive) continue
    sectionIds.forEach(id => assigned.add(id))
    normalized.push({
      id: group.id || crypto.randomUUID(),
      name: group.name?.trim() || '콘텐츠 그룹',
      sectionIds,
      collapsed: Boolean(group.collapsed),
    })
  }
  return normalized
}

export function removeSectionsFromGroups(groups: ContentGroup[] | undefined, sectionIds: string[], sections: Section[]) {
  const removed = new Set(sectionIds)
  return normalizeContentGroups((groups || []).map(group => ({ ...group, sectionIds: group.sectionIds.filter(id => !removed.has(id)) })), sections)
}
