import { SECTION_LABELS } from './catalog'
import type { Project, Section } from './types'

export interface CliRequest { id: string; command: string; payload?: unknown }
export interface EditorAction {
  params: string[]
  readOnly?: boolean
  run: (args: unknown[]) => unknown
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON 객체가 필요합니다.')
  for (const key of Object.keys(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('허용하지 않는 필드입니다.')
  }
  return value as Record<string, unknown>
}

export function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('문자열이 필요합니다.')
  return value
}

export function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('boolean 값이 필요합니다.')
  return value
}

export function index(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error('0 이상의 정수 인덱스가 필요합니다.')
  return Number(value)
}

export function direction(value: unknown): -1 | 1 {
  if (value !== -1 && value !== 1) throw new Error('방향은 -1 또는 1이어야 합니다.')
  return value
}

export function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (!choices.includes(value as T)) throw new Error(`허용값 ${choices.join(', ')}`)
  return value as T
}

const stringList = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === 'string')

export function sectionPatch(value: unknown): Partial<Section> {
  const patch = record(value)
  const enums: Record<string, string[]> = {
    mediaLayout: ['auto', 'mosaic-left', 'mosaic-right', 'equal', 'stack', 'grid-2', 'grid-3', 'custom'],
    contentLayout: ['text-top', 'media-top', 'media-left', 'media-right'],
    background: ['white', 'mist', 'teal', 'sand'], listStyle: ['list', 'offer'],
  }
  for (const [key, item] of Object.entries(patch)) {
    if (enums[key]) choice(item, enums[key])
    else if (['eyebrow', 'title', 'body', 'note'].includes(key)) text(item)
    else if (['items', 'mediaIds', 'tableHeaders'].includes(key)) {
      if (!stringList(item)) throw new Error(`${key}는 문자열 배열이어야 합니다.`)
    } else if (key === 'tableRows') {
      if (!Array.isArray(item) || !item.every(stringList)) throw new Error('tableRows는 문자열 행 배열이어야 합니다.')
    } else if (['hidden', 'timelineHeroVisible'].includes(key)) {
      if (typeof item !== 'boolean') throw new Error(`${key}는 boolean이어야 합니다.`)
    } else throw new Error(`section.update에서 지원하지 않는 필드 ${key}`)
  }
  return patch as Partial<Section>
}

export function projectPatch(value: unknown): Partial<Project> {
  const patch = record(value)
  for (const [key, item] of Object.entries(patch)) {
    if (key === 'name') text(item)
    else if (key === 'page') {
      for (const [field, content] of Object.entries(record(item))) {
        choice(field, ['title', 'subtitle', 'destination', 'internalMemo'])
        text(content)
      }
    } else if (key === 'category') choice(item, ['금까기', '우리만', '특별한', '골프'])
    else if (key === 'deliveryStage') choice(item, ['internal-draft', 'customer-final'])
    else if (key === 'layout') choice(item, ['destination-catalog', 'hotel-detail', 'hotel-sales', 'theme-package', 'journey-longform', 'golf-standard', 'offer-promotion'])
    else throw new Error(`project.patch에서 지원하지 않는 필드 ${key}`)
  }
  return patch as Partial<Project>
}

export function applyProjectPatch(draft: Project, patch: Partial<Project>) {
  const previousName = draft.name
  const page = { ...draft.page, ...patch.page }
  Object.assign(draft, patch, { page })
  if (patch.name !== undefined && patch.page?.title === undefined && (!page.title.trim() || page.title === previousName)) {
    page.title = patch.name
  }
}

export function dispatchEditorAction(
  actions: Record<string, EditorAction>, payload: unknown, revision: number, readOnly: boolean,
) {
  const command = record(payload)
  const action = typeof command.action === 'string' && Object.hasOwn(actions, command.action) ? actions[command.action] : undefined
  if (!action) throw new Error('지원하지 않는 action입니다. status에서 actions를 확인하세요.')
  if (!Array.isArray(command.args) || command.args.length !== action.params.length) {
    throw new Error(`args 순서 ${action.params.join(', ')}`)
  }
  if (!action.readOnly && readOnly) throw new Error('읽기 전용 공유본입니다.')
  if (command.expectedRevision !== undefined && command.expectedRevision !== revision) {
    throw new Error('REVISION_CONFLICT 현재 GUI를 다시 조회한 뒤 실행하세요.')
  }
  return action.run(command.args)
}

export const sectionTypes = Object.keys(SECTION_LABELS) as Section['type'][]
