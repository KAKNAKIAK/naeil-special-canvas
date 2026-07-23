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

export function layoutPresetsFor(assetIds: string[], orientationById: Record<string, ImageOrientation>): LayoutPreset[] {
  if (assetIds.length < 3) return []
  const portrait = assetIds.filter(id => orientationById[id] === 'portrait')
  const landscape = assetIds.filter(id => orientationById[id] === 'landscape')
  const square = assetIds.filter(id => !orientationById[id] || orientationById[id] === 'square')
  const other = (primary: string) => assetIds.filter(id => id !== primary)

  if (assetIds.length === 3 && portrait.length === 1 && landscape.length >= 2) {
    const hero = portrait[0], rest = other(hero)
    return [
      preset('portrait-left', '세로 강조 왼쪽', '세로 1장 + 가로 2장', [hero, ...rest], [[1,1,7,4],[8,1,5,2],[8,3,5,2]]),
      preset('portrait-right', '세로 강조 오른쪽', '세로 1장 + 가로 2장', [hero, ...rest], [[6,1,7,4],[1,1,5,2],[1,3,5,2]]),
    ]
  }
  if (assetIds.length === 3 && landscape.length === 1 && portrait.length >= 2) {
    const hero = landscape[0], rest = other(hero)
    return [
      preset('landscape-top', '가로 강조 위', '가로 1장 + 세로 2장', [hero, ...rest], [[1,1,12,2],[1,3,6,3],[7,3,6,3]]),
      preset('landscape-bottom', '가로 강조 아래', '가로 1장 + 세로 2장', [...rest, hero], [[1,1,6,3],[7,1,6,3],[1,4,12,2]]),
    ]
  }
  if (assetIds.length === 3 && portrait.length >= 3) {
    return [
      preset('portrait-triptych', '세로 3단', '세로 이미지 3장', assetIds, [[1,1,4,4],[5,1,4,4],[9,1,4,4]]),
      preset('portrait-center', '가운데 강조', '가운데 이미지를 크게', assetIds, [[1,1,3,4],[4,1,6,4],[10,1,3,4]]),
    ]
  }
  if (assetIds.length === 3 && landscape.length >= 3) {
    return [
      preset('landscape-hero-top', '상단 와이드', '가로 이미지 3장', assetIds, [[1,1,12,2],[1,3,6,2],[7,3,6,2]]),
      preset('landscape-triptych', '가로 3단', '균등한 가로 이미지', assetIds, [[1,1,12,1],[1,2,12,1],[1,3,12,1]]),
    ]
  }

  const hero = portrait[0] || landscape[0] || square[0] || assetIds[0]
  const rest = other(hero)
  const isPortraitHero = orientationById[hero] === 'portrait'
  return isPortraitHero
    ? [
      preset('gallery-portrait-left', '세로 대표 왼쪽', '다중 이미지 갤러리', [hero, ...rest], [[1,1,7,5],[8,1,5,2],[8,3,5,2],[8,5,5,1]]),
      preset('gallery-portrait-right', '세로 대표 오른쪽', '다중 이미지 갤러리', [hero, ...rest], [[6,1,7,5],[1,1,5,2],[1,3,5,2],[1,5,5,1]]),
    ]
    : [
      preset('gallery-landscape-top', '가로 대표 위', '다중 이미지 갤러리', [hero, ...rest], [[1,1,12,2],[1,3,6,3],[7,3,6,3],[1,6,12,1]]),
      preset('gallery-landscape-left', '대표 + 우측 그리드', '다중 이미지 갤러리', [hero, ...rest], [[1,1,7,4],[8,1,5,2],[8,3,5,2],[1,5,12,1]]),
    ]
}
