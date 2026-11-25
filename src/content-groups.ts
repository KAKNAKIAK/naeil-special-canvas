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

/**
 * Reorders a section or content group to before/after a target via drag-and-drop.
 * Dragging between two members of the same group reorders them inside that group;
 * otherwise groups always move and accept drops as indivisible units.
 */
export function reorderSectionUnit(
  sections: Section[],
  groups: ContentGroup[] | undefined,
  sourceSectionId: string,
  targetSectionId: string,
  placement: 'before' | 'after',
  forceGroupUnit = false,
): Section[] {
  if (!sourceSectionId || !targetSectionId || sourceSectionId === targetSectionId) return sections
  const normalizedGroups = normalizeContentGroups(groups, sections)
  const sourceGroup = normalizedGroups.find(group => group.sectionIds.includes(sourceSectionId))
  const targetGroup = normalizedGroups.find(group => group.sectionIds.includes(targetSectionId))

  if (!forceGroupUnit && sourceGroup && targetGroup && sourceGroup.id === targetGroup.id) {
    const sourceSection = sections.find(section => section.id === sourceSectionId)
    if (!sourceSection) return sections
    const remaining = sections.filter(section => section.id !== sourceSectionId)
    const targetIndex = remaining.findIndex(section => section.id === targetSectionId)
    if (targetIndex < 0) return sections
    const insertAt = placement === 'before' ? targetIndex : targetIndex + 1
    return [...remaining.slice(0, insertAt), sourceSection, ...remaining.slice(insertAt)]
  }

  if (sourceGroup && targetGroup && sourceGroup.id === targetGroup.id) return sections
  const sourceIds = sourceGroup?.sectionIds || [sourceSectionId]
  const targetIds = targetGroup?.sectionIds || [targetSectionId]
  const moving = new Set(sourceIds)
  if (targetIds.some(id => moving.has(id))) return sections
  const remaining = sections.filter(section => !moving.has(section.id))
  const targetFirst = remaining.findIndex(section => section.id === targetIds[0])
  if (targetFirst < 0) return sections
  const insertAt = placement === 'before' ? targetFirst : targetFirst + targetIds.length
  const sourceSections = sections.filter(section => moving.has(section.id))
  return [...remaining.slice(0, insertAt), ...sourceSections, ...remaining.slice(insertAt)]
}
