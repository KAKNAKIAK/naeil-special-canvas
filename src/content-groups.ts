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

/**
 * Moves one layer unit across another. A content group is always one unit, so
 * an unrelated block can never be inserted between its member blocks.
 */
export function moveSectionUnit(sections: Section[], groups: ContentGroup[] | undefined, sectionId: string, direction: -1 | 1): Section[] {
  const normalizedGroups = normalizeContentGroups(groups, sections)
  const sourceGroup = normalizedGroups.find(group => group.sectionIds.includes(sectionId))
  const sourceIds = sourceGroup?.sectionIds || [sectionId]
  const sourceIndexes = sourceIds.map(id => sections.findIndex(section => section.id === id))
  const first = Math.min(...sourceIndexes)
  const last = Math.max(...sourceIndexes)
  if (!Number.isFinite(first) || !Number.isFinite(last)) return sections

  const adjacentIndex = direction < 0 ? first - 1 : last + 1
  if (adjacentIndex < 0 || adjacentIndex >= sections.length) return sections
  const adjacentId = sections[adjacentIndex].id
  const targetGroup = normalizedGroups.find(group => group.sectionIds.includes(adjacentId))
  const targetIds = targetGroup?.sectionIds || [adjacentId]
  const moving = new Set(sourceIds)
  const remaining = sections.filter(section => !moving.has(section.id))
  const targetFirst = remaining.findIndex(section => section.id === targetIds[0])
  if (targetFirst < 0) return sections
  const insertAt = direction < 0 ? targetFirst : targetFirst + targetIds.length
  const sourceSections = sections.filter(section => moving.has(section.id))
  return [...remaining.slice(0, insertAt), ...sourceSections, ...remaining.slice(insertAt)]
}
