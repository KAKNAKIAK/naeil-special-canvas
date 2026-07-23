import type { MediaAsset } from './types'

export type SplitLayout = 'horizontal-2' | 'vertical-2' | 'grid-4'

type Crop = { x: number; y: number; width: number; height: number; index: number }

const layoutSize: Record<SplitLayout, { columns: number; rows: number }> = {
  'horizontal-2': { columns: 2, rows: 1 },
  'vertical-2': { columns: 1, rows: 2 },
  'grid-4': { columns: 2, rows: 2 },
}

export function splitLayoutLabel(layout: SplitLayout) {
  return { 'horizontal-2': '가로 2분할', 'vertical-2': '세로 2분할', 'grid-4': '2 × 2 분할' }[layout]
}

export function buildSplitPlan(width: number, height: number, layout: SplitLayout): Crop[] {
  const { columns, rows } = layoutSize[layout]
  const crops: Crop[] = []
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const x = Math.floor(width * column / columns)
    const y = Math.floor(height * row / rows)
    const right = Math.floor(width * (column + 1) / columns)
    const bottom = Math.floor(height * (row + 1) / rows)
    crops.push({ x, y, width: right - x, height: bottom - y, index: row * columns + column + 1 })
  }
  return crops
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'))
    image.src = src
  })
}

export async function splitImageAsset(asset: MediaAsset, layout: SplitLayout): Promise<MediaAsset[]> {
  if (!asset.src) throw new Error('IMAGE_SOURCE_EMPTY')
  const image = await loadImage(asset.src)
  const plan = buildSplitPlan(image.naturalWidth, image.naturalHeight, layout)
  const baseName = asset.name.replace(/\.[^.]+$/, '') || 'image'
  const total = plan.length
  return plan.map(crop => {
    const canvas = document.createElement('canvas')
    canvas.width = crop.width
    canvas.height = crop.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('CANVAS_UNAVAILABLE')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, crop.width, crop.height)
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
    return {
      ...asset,
      id: crypto.randomUUID(),
      name: `${baseName}-분할-${String(crop.index).padStart(2, '0')}-${total}.jpg`,
      src: canvas.toDataURL('image/jpeg', 0.92),
      sourceId: asset.id,
      assetStage: 'candidate',
      approval: 'pending',
      evidence: `원본 이미지 분할 · ${splitLayoutLabel(layout)}`,
      alt: asset.alt ? `${asset.alt} ${crop.index}/${total}` : `${baseName} ${crop.index}/${total}`,
    }
  })
}
