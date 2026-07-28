import type { BlockBox, CampaignData, IconCardItem, MediaAsset, Project, Section, SectionType } from './types'
import { CURRENT_CATALOG_VERSION, CURRENT_SCHEMA_VERSION, migrateProject } from './migrations'
import { normalizeContentGroups } from './content-groups'

export const SECTION_LABELS: Record<SectionType, string> = {
  text: '텍스트', image: '이미지', list: '목록', table: '간략 일정표', 'icon-card': '아이콘 카드', offer: '가격·특전',
  'caption-grid': '2행 이미지', 'menu-zigzag': '이미지·설명 카드', timeline: '상세 일정표',
}

export const GROUPS = [
  { name: '', types: ['text', 'image', 'list', 'icon-card', 'table', 'timeline', 'menu-zigzag', 'caption-grid'] },
] as const

const legacyImageTypes = new Set(['media-full', 'media-pair', 'media-grid', 'media-mosaic', 'destination-chapter', 'hotel-showcase', 'resort-section', 'golf-course', 'facility-section', 'food-gallery'])
const legacyListTypes = new Set(['usp-list', 'checkpoint-list', 'numbered-benefits', 'common-benefits', 'route-map', 'route-timeline', 'itinerary-table', 'season-chart', 'comparison', 'faq'])

/**
 * Reference layouts keep one image slot per repeating card.  Timeline reserves
 * slot 0 for its hero image, then maps each schedule item to the following slot.
 * Empty strings are intentional placeholders: they preserve the card/image
 * relationship while the designer is still choosing images.
 */
export function referenceMediaSlot(type: SectionType, itemIndex: number) {
  if (type === 'timeline') return itemIndex + 1
  if (type === 'caption-grid' || type === 'menu-zigzag') return itemIndex
  return -1
}

export function normalizeReferenceMediaSlots(type: SectionType, items: string[], mediaIds: string[]) {
  if (type !== 'caption-grid' && type !== 'menu-zigzag' && type !== 'timeline') return mediaIds
  // The first revision of the 2행 이미지 preset used two images on the left
  // and one on the right. Preserve its right image (slot 2) when old work is
  // reopened, then normalize it into the current left/right two-image format.
  if (type === 'caption-grid') {
    const legacyNormalized = mediaIds.length >= 3 && items.length <= 2 ? [mediaIds[0] || '', mediaIds[2] || ''] : mediaIds
    return Array.from({ length: items.length }, (_, index) => legacyNormalized[index] || '')
  }
  const slotCount = items.length + (type === 'timeline' ? 1 : 0)
  return Array.from({ length: slotCount }, (_, index) => mediaIds[index] || '')
}

/** Keeps image-library cleanup from deleting assets rendered by a canvas block. */
export function canvasLinkedAssetIds(sections: Section[]) {
  return [...new Set(sections.flatMap(section => [
    ...section.mediaIds,
    ...normalizeLayoutBoxes(section).flatMap(box => box.assetIds || []),
  ]).filter(Boolean))]
}

/**
 * Timeline day markers are stored as item indexes. When one schedule item is
 * removed, later day indexes must move up as well. If that item was the only
 * item in a day, remove its empty day marker instead of leaving the next day
 * without a label.
 */
export function timelineDayStartsAfterItemRemoval(dayStarts: number[] | undefined, itemCount: number, removedIndex: number) {
  const starts = Array.from(new Set((dayStarts || []).filter(start => Number.isInteger(start) && start >= 0 && start < itemCount))).sort((a, b) => a - b)
  return starts.flatMap((start, index) => {
    if (start !== removedIndex) return [start > removedIndex ? start - 1 : start]
    const nextStart = starts[index + 1] ?? itemCount
    return nextStart > removedIndex + 1 ? [start] : []
  })
}

export function normalizeSectionType(value: unknown): SectionType {
  if (value === 'text' || value === 'image' || value === 'list' || value === 'table' || value === 'icon-card' || value === 'offer' || value === 'caption-grid' || value === 'menu-zigzag' || value === 'timeline') return value
  if (legacyImageTypes.has(String(value))) return 'image'
  if (value === 'offer-price') return 'offer'
  if (legacyListTypes.has(String(value))) return 'list'
  return 'text'
}

function isKnownSectionType(value: unknown): value is SectionType {
  return value === 'text' || value === 'image' || value === 'list' || value === 'table' || value === 'icon-card' || value === 'offer' || value === 'caption-grid' || value === 'menu-zigzag' || value === 'timeline'
}

function isLegacySectionType(value: unknown) {
  return legacyImageTypes.has(String(value)) || legacyListTypes.has(String(value)) || value === 'offer-price'
}

export function makeSection(type: SectionType): Section {
  const placeholder = { eyebrow: 'Category Label', title: '제목', body: '본문' }
  const iconCards: IconCardItem[] = [
    { id: crypto.randomUUID(), icon: 'calendar', title: '전문 가이드 동행', body: '여행의 핵심 순간을 더 편안하게 안내합니다.', tone: 'teal' },
    { id: crypto.randomUUID(), icon: 'hotel', title: '엄선한 숙소', body: '일정과 이동을 고려해 편안한 휴식을 준비합니다.', tone: 'orange' },
    { id: crypto.randomUUID(), icon: 'car', title: '전용 이동 서비스', body: '여행 흐름에 맞는 이동을 제공합니다.', tone: 'green' },
  ]
  const defaults: Record<SectionType, Pick<Section, 'eyebrow' | 'title' | 'body' | 'items'>> = {
    text: { ...placeholder, items: [] },
    image: { ...placeholder, items: [] },
    list: { ...placeholder, items: ['첫 번째 핵심 내용', '두 번째 핵심 내용', '세 번째 핵심 내용'] },
    table: { ...placeholder, items: [] },
    'icon-card': { ...placeholder, items: [] },
    offer: { ...placeholder, items: ['첫 번째 특전 또는 조건', '두 번째 특전 또는 조건', '세 번째 특전 또는 조건'] },
    'caption-grid': { ...placeholder, items: ['제목 | 설명', '제목 | 설명'] },
    'menu-zigzag': { ...placeholder, items: ['제목 | 본문'] },
    timeline: { eyebrow: '01. 골든패스 초콜릿 열차', title: '스위스 패밀리 금까기 상품 특전', body: 'The chocolate train\n매년 5월부터 9월까지 한시적 운행되는 골든패스 초콜릿 열차는 몽트뢰에서부터 밀크 초콜릿을 처음으로 만든 까이에 초콜릿 박물관과 그뤼에르 치즈 마을을 방문하는 세계 유일한 초콜릿 테마 열차', items: ['09:50 | 몽트뢰 출발 | 초콜릿 열차에서 제공하는 따뜻한 음료와 크루아상으로 간단한 아침 식사', '10:50 | 초콜릿 버스 환승 | 몽보봉 도착 후 초콜릿 버스로 환승', '11:10 | 그뤼에르 치즈 공장 | La Maison du Gruyère 방문', '12:10 | 그뤼에르 마을 | 자유시간(약 2시간)\\n* 추천 일정\\n- 그뤼에르 성 방문\\n- 퐁뒤, 라클렛 등 치즈 요리 점심'] },
  }
  defaults.timeline = { ...placeholder, items: ['00:00 | 일정 제목 | 일정 설명을 입력하세요.'] }
  const base = defaults[type]
  const section: Section = {
    id: crypto.randomUUID(), type, eyebrow: base.eyebrow, title: base.title,
    body: base.body,
    items: [...base.items],
    tableHeaders: type === 'table' ? ['구분', '내용'] : [],
    tableRows: type === 'table' ? [['DAY 1', '이동·체험 내용을 입력하세요.'], ['DAY 2', '다음 일정 또는 비교 정보를 입력하세요.']] : [],
    iconCards: type === 'icon-card' ? iconCards : [], listStyle: type === 'offer' ? 'offer' : 'list',
    mediaIds: [], mediaLayout: 'auto', contentLayout: 'text-top', layoutBoxes: createLayoutBoxes('text-top', []), note: '', background: 'white',
  }
  // The image block is a vertical content flow by default: text → image.
  // Extra text/image cards can be inserted and reordered without turning the block into a free grid.
  if (type === 'image') section.layoutBoxes = [
    { id: 'content', kind: 'content', column: 1, row: 1, columnSpan: 12, rowSpan: 4, zIndex: 1 },
    { id: 'media', kind: 'media', column: 1, row: 6, columnSpan: 12, rowSpan: 6, zIndex: 2, assetIds: [] },
  ]
  return section
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))

export function createLayoutBoxes(layout: Section['contentLayout'], mediaIds: string[]): BlockBox[] {
  const horizontal = layout === 'media-left' || layout === 'media-right'
  const mediaFirst = layout === 'media-top' || layout === 'media-left'
  const content: BlockBox = horizontal
    ? { id: 'content', kind: 'content', column: mediaFirst ? 7 : 1, row: 1, columnSpan: 6, rowSpan: 9, zIndex: 1 }
    : { id: 'content', kind: 'content', column: 1, row: mediaFirst ? 7 : 1, columnSpan: 12, rowSpan: 5, zIndex: 1 }
  const media: BlockBox = horizontal
    ? { id: 'media', kind: 'media', column: mediaFirst ? 1 : 7, row: 1, columnSpan: 6, rowSpan: 9, zIndex: 2, assetIds: [...mediaIds] }
    : { id: 'media', kind: 'media', column: 1, row: mediaFirst ? 1 : 6, columnSpan: 12, rowSpan: 6, zIndex: 2, assetIds: [...mediaIds] }
  return [content, media]
}

export function normalizeLayoutBoxes(section: Pick<Section, 'contentLayout' | 'mediaIds' | 'layoutBoxes' | 'removedLayoutBoxIds'>): BlockBox[] {
  const removed = new Set(section.removedLayoutBoxIds || [])
  const defaults = createLayoutBoxes(section.contentLayout || 'text-top', section.mediaIds || []).filter(box => !removed.has(box.id))
  const byId = new Map((section.layoutBoxes || []).map(box => [box.id, box]))
  const normalized = defaults.map(fallback => { const saved = byId.get(fallback.id); const assetIds = fallback.kind === 'media' ? (saved?.assetIds?.length ? saved.assetIds : section.mediaIds || []) : undefined; return { ...fallback, ...saved, assetIds: assetIds ? [...new Set(assetIds.filter(Boolean))] : undefined } })
  const extras = (section.layoutBoxes || []).filter(box => box.id !== 'content' && box.id !== 'media').map((box, index) => ({
    ...box,
    id: box.id || crypto.randomUUID(),
    kind: (box.kind === 'image' ? 'image' : 'text') as 'image' | 'text',
    text: box.kind === 'text' ? (box.text || '') : undefined,
    assetIds: box.kind === 'image' ? [...new Set((box.assetIds || []).filter(Boolean))] : undefined,
    zIndex: Number.isFinite(box.zIndex) ? clamp(box.zIndex, 1, 99) : index + 3,
  }))
  return [...normalized, ...extras].map((box, index) => {
    const columnSpan = clamp(Number(box.columnSpan) || 4, 2, 12)
    const rowSpan = clamp(Number(box.rowSpan) || 3, 2, 18)
    return { ...box, column: clamp(Number(box.column) || 1, 1, 13 - columnSpan), row: clamp(Number(box.row) || 1, 1, 80), columnSpan, rowSpan, zIndex: Number.isFinite(box.zIndex) ? clamp(box.zIndex, 1, 99) : index + 1 }
  })
}

export function createCampaignData(id: string, name: string): CampaignData {
  return {
    schema_version: '1.0.0', campaign_id: id, product_name: name, campaign_type: 'travel-promotion', status: 'draft', render_mode: 'review', output_mode: 'standalone', canonical_url: '',
    source: { erp_good_cd: '', source_url: '', verified_at: null, verified_by: '' },
    period: { starts_at: null, ends_at: null, departure_from: null, departure_to: null, expiry_action: 'block_publish' },
    facts: { normal_price: null, sale_price: null, discount_amount: null, discount_formula: '', travel_days: null, country_count: null, local_flight_count: null, availability_status: 'unverified', availability_text: '', urgency_text: '', conditions: [] },
    benefits: [], links: [], tabs: [],
    metadata: { title: name, description: '', h1: name, canonical_url: '', og_title: name },
    tracking: { promotion_id: id, events: ['view_promotion', 'click_primary_cta'] },
    performance: { image_warning_bytes: 750000, image_max_bytes: 1500000, eager_image_budget_bytes: 3000000, image_exceptions: [] },
  }
}

export function normalizeProject(project: Project): Project {
  const current = migrateProject(project).project
  const id = current.id || crypto.randomUUID()
  const name = current.name || '내일스패셜 기획안'
  const sections: Section[] = (current.sections || []).map(section => {
    const preserved = section.extensions?.unsupportedBlock
    const rawType = preserved?.type || String(section.type)
    const unsupported = !isKnownSectionType(rawType) && !isLegacySectionType(rawType)
    const type = unsupported ? 'text' : normalizeSectionType(rawType)
    const columnCount = Math.max(2, Math.min(3, section.tableHeaders?.length || 2))
    const iconCards = (section.iconCards || []).map(card => ({ id: card.id || crypto.randomUUID(), icon: card.icon || 'sparkles', title: card.title || '', body: card.body || '', tone: card.tone || 'teal' }))
    const contentLayout = section.contentLayout || 'text-top'
    const eyebrow = unsupported ? 'UNSUPPORTED BLOCK' : section.eyebrow === 'NAEIL SPECIAL' ? 'Category Label' : section.eyebrow
    const title = unsupported ? `지원하지 않는 블록: ${rawType}` : [SECTION_LABELS.text, SECTION_LABELS.image, SECTION_LABELS.list, SECTION_LABELS.table, SECTION_LABELS['icon-card'], SECTION_LABELS.offer].includes(section.title) ? '제목' : section.title
    const body = unsupported ? '현재 앱에서는 이 블록을 편집할 수 없습니다. 저장 시 원본 데이터는 보존됩니다.' : section.body === '고객이 한눈에 이해할 수 있도록 핵심 내용을 입력하세요.' ? '본문' : section.body
    const rawItems = section.items || []
    const menuItems = type === 'menu-zigzag'
      ? rawItems.map(item => item === '메뉴 제목 | 메뉴 설명을 입력하세요.' || item === '새 추천 | 설명을 입력하세요.' ? '제목 | 본문' : item)
      : rawItems
    // Earlier menu-zigzag defaults contained the same placeholder twice.
    // Collapse only that untouched pair so authored two-item menus stay intact.
    const items = type === 'menu-zigzag' && menuItems.length === 2 && menuItems.every(item => item === '제목 | 본문') ? menuItems.slice(0, 1) : menuItems
    const mediaIds = normalizeReferenceMediaSlots(type, items, section.mediaIds || [])
    const menuItemReversed = type === 'menu-zigzag' ? items.map((_, index) => Boolean(section.menuItemReversed?.[index])) : section.menuItemReversed
    const timelineDayStarts = type === 'timeline' ? Array.from(new Set((section.timelineDayStarts || []).filter(index => Number.isInteger(index) && index >= 0 && index < items.length))).sort((a, b) => a - b) : section.timelineDayStarts
    const importedTimelineHeroVisible = (section as Section & { timeline_hero_visible?: boolean }).timeline_hero_visible
    const timelineHeroVisible = type === 'timeline' ? section.timelineHeroVisible !== false && importedTimelineHeroVisible !== false : section.timelineHeroVisible
    const extensions = unsupported
      ? { ...section.extensions, unsupportedBlock: preserved || { type: rawType, data: section as unknown as Record<string, unknown> } }
      : section.extensions
    return { ...section, type, eyebrow, title, body, items, mediaIds, menuItemReversed, timelineDayStarts, timelineHeroVisible, listStyle: section.listStyle || (type === 'offer' ? 'offer' : 'list'), background: 'white', mediaLayout: section.mediaLayout || 'auto', contentLayout, layoutBoxes: normalizeLayoutBoxes({ contentLayout, mediaIds, layoutBoxes: section.layoutBoxes }), tableHeaders: type === 'table' ? Array.from({ length: columnCount }, (_, index) => section.tableHeaders?.[index] || (index === 0 ? '구분' : index === 1 ? '내용' : '비고')) : section.tableHeaders || [], tableRows: type === 'table' ? (section.tableRows || []).map(row => Array.from({ length: columnCount }, (_, index) => row[index] || '')) : section.tableRows || [], iconCards: type === 'icon-card' ? iconCards : section.iconCards || [], extensions }
  })
  const defaultCampaign = createCampaignData(id, name)
  const rawCampaign = current.campaign || defaultCampaign
  const campaign = {
    ...defaultCampaign,
    ...rawCampaign,
    metadata: { ...defaultCampaign.metadata, ...(rawCampaign.metadata || {}) },
    tracking: { ...defaultCampaign.tracking, ...(rawCampaign.tracking || {}) },
    performance: { ...defaultCampaign.performance, ...(rawCampaign.performance || {}) },
  }
  return { ...current, id, name, campaign, sections, contentGroups: normalizeContentGroups(current.contentGroups, sections), assets: current.assets || [] }
}

export function isLegacyBaliSeed(project: Project): boolean {
  const legacyTitles = ['시간이 천천히 흐르는\n발리의 프라이빗 휴식', '내일투어가 고른 세 가지 이유', '숲과 바다가 만나는 프라이빗 풀빌라', '내일투어 단독 혜택', '여행 전 자주 묻는 질문']
  return project.name === '발리 프라이빗 리조트 기획안'
    && project.page.title === '발리, 둘만의 속도로'
    && project.page.subtitle === '프라이빗 풀빌라 5일'
    && project.page.destination === '인도네시아 · 발리'
    && project.assets.length === 0
    && project.sections.length === 5
    && project.sections.every((section, index) => section.title === legacyTitles[index])
}

export function createSeedProject(): Project {
  const id = crypto.randomUUID()
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION, catalogVersion: CURRENT_CATALOG_VERSION, id, name: '새 내일스패셜 기획안', layout: 'hotel-sales', category: '금까기', deliveryStage: 'internal-draft', updatedAt: new Date().toISOString(),
    page: { title: '', subtitle: '', destination: '', internalMemo: '' },
    campaign: createCampaignData(id, '새 내일스패셜 기획안'),
    sections: [], contentGroups: [], assets: [],
  }
}

function sampleImage(id: string, name: string, label: string, colors: [string, string]): MediaAsset {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900" viewBox="0 0 1440 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs><rect width="1440" height="900" fill="url(#g)"/><circle cx="1180" cy="150" r="190" fill="rgba(255,255,255,.16)"/><path d="M0 650 C220 540 390 760 620 640 S1030 510 1440 680 V900 H0Z" fill="rgba(255,255,255,.17)"/><text x="100" y="690" fill="white" font-family="sans-serif" font-size="66" font-weight="700">${label}</text><text x="104" y="752" fill="white" fill-opacity=".78" font-family="sans-serif" font-size="27">SAMPLE IMAGE · REPLACE WITH YOUR PHOTO</text></svg>`
  return { id, name, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, provider: 'generated', sourceId: 'studio-sample', assetStage: 'reference', usageScope: '내일스패셜 메이킹 스튜디오 샘플', rightsStatus: 'cleared', qualityGrade: 'B', approval: 'approved', evidence: '앱 내 연습용 SVG', alt: label }
}

/** A safe, editable practice project. It never overwrites the user's current draft. */
export function createSampleProject(): Project {
  const project = createSeedProject()
  const beach = sampleImage(crypto.randomUUID(), 'sample-guam-beach.svg', 'GUAM BEACH', ['#0a8c96', '#45b9cb'])
  const stay = sampleImage(crypto.randomUUID(), 'sample-guam-stay.svg', 'RESORT STAY', ['#d88a52', '#f0bd76'])
  const text = makeSection('text')
  text.eyebrow = 'SAMPLE PROJECT'
  text.title = '괌 가족 휴양 4박 5일'
  text.body = '샘플 문구를 더블클릭해 바로 수정해 보세요. 여행지와 상품 성격에 맞춰 블록 순서를 바꾸고, 필요한 블록만 남기면 됩니다.'
  const image = makeSection('image')
  image.eyebrow = 'RESORT HIGHLIGHT'
  image.title = '바다 가까이에서 보내는 여유로운 하루'
  image.body = '가운데 이미지 박스를 클릭하면 왼쪽 이미지 탭으로 이동합니다. 라이브러리의 사진을 눌러 이 자리에 연결해 보세요.'
  image.mediaIds = [beach.id, stay.id]
  image.layoutBoxes = createLayoutBoxes('text-top', image.mediaIds)
  const list = makeSection('list')
  list.eyebrow = 'WHY THIS TRIP'
  list.title = '가족 여행에 맞춘 핵심 포인트'
  list.body = '목록을 선택한 뒤 가운데 항목을 눌러 내용을 편집합니다.'
  list.items = ['공항 왕복 이동으로 도착부터 편안하게', '리조트 중심 일정으로 여유 있게', '가족 구성에 맞춰 선택 가능한 체험']
  return {
    ...project,
    name: '샘플 · 괌 가족 휴양 기획안',
    category: '우리만',
    layout: 'hotel-sales',
    page: { title: '괌 가족 휴양', subtitle: '바다 가까이에서 보내는 4박 5일', destination: '괌', internalMemo: '연습용 샘플입니다. 자유롭게 수정하거나 삭제해 보세요.' },
    campaign: createCampaignData(project.id, '샘플 · 괌 가족 휴양 기획안'),
    sections: [text, image, list],
    assets: [beach, stay],
  }
}
