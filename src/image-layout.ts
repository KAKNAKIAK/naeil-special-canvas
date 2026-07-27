import type { ImageFocus, MediaLayoutItem } from './types'

export const GRID_COLUMNS = 12
export type ImageOrientation = 'portrait' | 'landscape' | 'square'
export interface LayoutPreset { id: string; label: string; detail: string; items: MediaLayoutItem[] }
export const FOCUS_OPTIONS: { value: ImageFocus; label: string }[] = [
  { value: 'left top', label: '좌상' }, { value: 'center top', label: '상단' }, { value: 'right top', label: '우상' },
  { value: 'left center', label: '좌측' }, { value: 'center center', label: '가운데' }, { value: 'right center', label: '우측' },
  { value: 'left bottom', label: '좌하' }, { value: 'center bottom', label: '하단' }, { value: 'right bottom', label: '우하' },
]

const center: ImageFocus = 'center center'
const item = (assetId: string, column: number, row: number, columnSpan: number, rowSpan: number): MediaLayoutItem => ({ assetId, column, row, columnSpan, rowSpan, focus: center })

export function createCustomLayout(assetIds: string[]): MediaLayoutItem[] {
  if (assetIds.length === 1) return [item(assetIds[0], 1, 1, 12, 3)]
  if (assetIds.length === 2) return [item(assetIds[0], 1, 1, 6, 3), item(assetIds[1], 7, 1, 6, 3)]
  if (assetIds.length === 3) return [item(assetIds[0], 1, 1, 7, 4), item(assetIds[1], 8, 1, 5, 2), item(assetIds[2], 8, 3, 5, 2)]
  return assetIds.map((assetId, index) => item(assetId, index % 2 === 0 ? 1 : 7, Math.floor(index / 2) * 2 + 1, 6, 2))
}

export function normalizeCustomLayout(assetIds: string[], items: MediaLayoutItem[] | undefined): MediaLayoutItem[] {
  const defaults = createCustomLayout(assetIds)
  const byId = new Map((items || []).map(entry => [entry.assetId, entry]))
  return defaults.map(entry => ({ ...entry, ...byId.get(entry.assetId), assetId: entry.assetId }))
}

export function patchLayoutItem(items: MediaLayoutItem[], assetId: string, patch: Partial<MediaLayoutItem>): MediaLayoutItem[] {
  return items.map(entry => {
    if (entry.assetId !== assetId) return entry
    const next = { ...entry, ...patch }
    next.columnSpan = Math.max(1, Math.min(GRID_COLUMNS, next.columnSpan))
    next.rowSpan = Math.max(1, Math.min(6, next.rowSpan))
    next.column = Math.max(1, Math.min(GRID_COLUMNS - next.columnSpan + 1, next.column))
    next.row = Math.max(1, Math.min(20, next.row))
    return next
  })
}

function arrange(ids: string[], placements: Array<[number, number, number, number]>): MediaLayoutItem[] {
  return ids.map((assetId, index) => { const [column, row, columnSpan, rowSpan] = placements[index] || [1 + (index % 2) * 6, 7 + Math.floor((index - placements.length) / 2) * 2, 6, 2]; return item(assetId, column, row, columnSpan, rowSpan) })
}
function preset(id: string, label: string, detail: string, ids: string[], placements: Array<[number, number, number, number]>): LayoutPreset { return { id, label, detail, items: arrange(ids, placements) } }

export function layoutPresetsFor(assetIds: string[], _orientationById: Record<string, ImageOrientation>): LayoutPreset[] {
  if (assetIds.length < 3) return []
  // Keep the choice set stable regardless of source ratio. The layout itself
  // controls cropping, so designers do not have to interpret different menus.
  return [
    preset('wide-top', '상단 와이드', '상단 대표 이미지 + 하단 2장', assetIds, [[1,1,12,2],[1,3,6,3],[7,3,6,3]]),
    preset('portrait-left', '세로 강조 왼쪽', '왼쪽 대표 이미지 + 우측 2장', assetIds, [[1,1,7,4],[8,1,5,2],[8,3,5,2]]),
    preset('portrait-right', '세로 강조 오른쪽', '오른쪽 대표 이미지 + 좌측 2장', assetIds, [[6,1,7,4],[1,1,5,2],[1,3,5,2]]),
  ]
}
