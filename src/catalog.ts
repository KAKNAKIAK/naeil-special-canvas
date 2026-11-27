import type { BlockBox, CampaignData, IconCardItem, Project, Section, SectionType } from './types'
import { CURRENT_CATALOG_VERSION, CURRENT_SCHEMA_VERSION, migrateProject } from './migrations'
import { normalizeContentGroups } from './content-groups'

export const SECTION_LABELS: Record<SectionType, string> = {
  text: '텍스트', image: '이미지', list: '목록', table: '간략 일정표', 'icon-card': '아이콘 카드', offer: '가격·특전',
  'caption-grid': '2행 이미지', 'menu-zigzag': '이미지·설명 카드', timeline: '상세 일정표',
  'hero-cover': '커버 히어로', 'route-bar': '가로 동선 바', 'option-grid': '원형 택1 그리드', 'vs-compare': 'VS 비교 카드', 'service-bar': '2단 서비스 바',
}

export const GROUPS = [
  { name: '기본 블록', types: ['text', 'image', 'list', 'icon-card', 'table', 'timeline', 'menu-zigzag', 'caption-grid'] },
  { name: '템플릿 특화', types: ['hero-cover', 'route-bar', 'option-grid', 'vs-compare', 'service-bar'] },
] as const

export type TemplatePresetId = 'theme-multi-city' | 'honeymoon-pick' | 'kids-vs' | 'golf-match'
export const TEMPLATE_PRESETS: Array<{ id: TemplatePresetId; label: string; category: Project['category']; summary: string }> = [
  { id: 'theme-multi-city', label: '테마 우리만 · 다도시', category: '우리만', summary: '모자이크 · 가로 동선 · 01~04 번호 특전 카드' },
  { id: 'honeymoon-pick', label: '허니문 · 택1 특전', category: '금까기', summary: '풀블리드 커버 · 원형 택1 · 공통 특전' },
  { id: 'kids-vs', label: '키즈·가족 비교(VS)', category: '우리만', summary: 'A vs B 비교 · 체험 스팟 · 2단 서비스 바' },
  { id: 'golf-match', label: '골프 대회 · 확장표', category: '골프', summary: '대회 커버 · 체크포인트 · 4열 시상표' },
]

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
  if (type === 'caption-grid' || type === 'menu-zigzag' || type === 'option-grid' || type === 'vs-compare') return itemIndex
  return -1
}

export function normalizeReferenceMediaSlots(type: SectionType, items: string[], mediaIds: string[]) {
  if (type === 'hero-cover' || type === 'route-bar') return [mediaIds[0] || '']
  if (type !== 'caption-grid' && type !== 'menu-zigzag' && type !== 'timeline' && type !== 'option-grid' && type !== 'vs-compare') return mediaIds
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
  if (isKnownSectionType(value)) return value
  if (legacyImageTypes.has(String(value))) return 'image'
  if (value === 'offer-price') return 'offer'
  if (legacyListTypes.has(String(value))) return 'list'
  return 'text'
}

function isKnownSectionType(value: unknown): value is SectionType {
  return value === 'text' || value === 'image' || value === 'list' || value === 'table' || value === 'icon-card' || value === 'offer' || value === 'caption-grid' || value === 'menu-zigzag' || value === 'timeline' || value === 'hero-cover' || value === 'route-bar' || value === 'option-grid' || value === 'vs-compare' || value === 'service-bar'
}

function isLegacySectionType(value: unknown) {
  return legacyImageTypes.has(String(value)) || legacyListTypes.has(String(value)) || value === 'offer-price'
}

export function makeSection(type: SectionType): Section {
  const placeholder = { title: '제목', body: '본문' }
  const iconCards: IconCardItem[] = [
    { id: crypto.randomUUID(), icon: 'calendar', title: '전문 가이드 동행', body: '여행의 핵심 순간을 더 편안하게 안내합니다.', tone: 'teal' },
    { id: crypto.randomUUID(), icon: 'hotel', title: '엄선한 숙소', body: '일정과 이동을 고려해 편안한 휴식을 준비합니다.', tone: 'orange' },
    { id: crypto.randomUUID(), icon: 'car', title: '전용 이동 서비스', body: '여행 흐름에 맞는 이동을 제공합니다.', tone: 'green' },
  ]
  const defaults: Record<SectionType, Pick<Section, 'title' | 'body' | 'items'>> = {
    text: { ...placeholder, items: [] },
    image: { ...placeholder, items: [] },
    list: { ...placeholder, items: ['첫 번째 핵심 내용', '두 번째 핵심 내용', '세 번째 핵심 내용'] },
    table: { ...placeholder, items: [] },
    'icon-card': { ...placeholder, items: [] },
    offer: { ...placeholder, items: ['첫 번째 특전 또는 조건', '두 번째 특전 또는 조건', '세 번째 특전 또는 조건'] },
    'caption-grid': { ...placeholder, items: ['제목 | 설명', '제목 | 설명'] },
    'menu-zigzag': { ...placeholder, items: ['제목 | 본문'] },
    timeline: { title: '스위스 패밀리 금까기 상품 특전', body: 'The chocolate train\n매년 5월부터 9월까지 한시적 운행되는 골든패스 초콜릿 열차는 몽트뢰에서부터 밀크 초콜릿을 처음으로 만든 까이에 초콜릿 박물관과 그뤼에르 치즈 마을을 방문하는 세계 유일한 초콜릿 테마 열차', items: ['09:50 | 몽트뢰 출발 | 초콜릿 열차에서 제공하는 따뜻한 음료와 크루아상으로 간단한 아침 식사', '10:50 | 초콜릿 버스 환승 | 몽보봉 도착 후 초콜릿 버스로 환승', '11:10 | 그뤼에르 치즈 공장 | La Maison du Gruyère 방문', '12:10 | 그뤼에르 마을 | 자유시간(약 2시간)\\n* 추천 일정\\n- 그뤼에르 성 방문\\n- 퐁뒤, 라클렛 등 치즈 요리 점심'] },
    'hero-cover': { title: '상품 대표 제목', body: '고객의 시선을 끄는 핵심 소개 문장을 입력하세요.', items: ['NO쇼핑 · NO옵션', '단독 가이드', '특급 호텔'] },
    'route-bar': { title: '한눈에 보는 황금 동선', body: '주요 방문 도시와 이동 흐름을 간결하게 보여 줍니다.', items: ['출발 도시', '핵심 경유지', '주요 관광지', '도착 도시'] },
    'option-grid': { title: '원데이 프로그램 택 1', body: '원하는 체험을 선택해 즐기는 맞춤 특전입니다.', items: ['선택 체험 1', '선택 체험 2', '선택 체험 3', '선택 체험 4'] },
    'vs-compare': { title: '두 가지 스타일 비교', body: '여행 취향에 맞는 구성을 한눈에 비교해 보세요.', items: ['포인트 A | 옵션 A 제목 | 첫 번째 구성의 장점을 입력하세요.', '포인트 B | 옵션 B 제목 | 두 번째 구성의 장점을 입력하세요.'] },
    'service-bar': { title: '내일투어 스페셜 서비스', body: '예약 고객께 기본 제공되는 핵심 케어입니다.', items: ['항공·호텔 조율로 쉽고 빠른 여행 준비 | 개별 맞춤 케어', '지역별 교통패스·입장권 추천 및 예약대행 | 패스·티켓 대행', '여행자보험 가입 및 현지 비상연락망 지원 | 안심 여행 케어'] },
  }
  defaults.timeline = { ...placeholder, items: ['00:00 | 일정 제목 | 일정 설명을 입력하세요.'] }
  const base = defaults[type]
  const section: Section = {
    id: crypto.randomUUID(), type, title: base.title,
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

export function withoutCategoryLabel<T extends object>(value: T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('콘텐츠는 JSON 객체여야 합니다.')
  const clean = { ...value } as T & { eyebrow?: unknown; categoryLabel?: unknown }
  delete clean.eyebrow
  delete clean.categoryLabel
  return clean
}

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
    return { ...withoutCategoryLabel(box), column: clamp(Number(box.column) || 1, 1, 13 - columnSpan), row: clamp(Number(box.row) || 1, 1, 80), columnSpan, rowSpan, zIndex: Number.isFinite(box.zIndex) ? clamp(box.zIndex, 1, 99) : index + 1 }
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
  const sections: Section[] = (current.sections || []).map(rawSection => {
    const section = withoutCategoryLabel(rawSection)
    const preserved = section.extensions?.unsupportedBlock
    const rawType = preserved?.type || String(section.type)
    const unsupported = !isKnownSectionType(rawType) && !isLegacySectionType(rawType)
    const type = unsupported ? 'text' : normalizeSectionType(rawType)
    const columnCount = Math.max(2, Math.min(5, section.tableHeaders?.length || 2))
    const iconCards = (section.iconCards || []).map(card => ({ id: card.id || crypto.randomUUID(), icon: card.icon || 'sparkles', title: card.title || '', body: card.body || '', tone: card.tone || 'teal' }))
    const contentLayout = section.contentLayout || 'text-top'
    const background: Section['background'] = section.background === 'mist' || section.background === 'teal' || section.background === 'sand' ? section.background : 'white'
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
    return { ...section, type, title, body, items, mediaIds, menuItemReversed, timelineDayStarts, timelineHeroVisible, listStyle: section.listStyle || (type === 'offer' ? 'offer' : 'list'), background, mediaLayout: section.mediaLayout || 'auto', contentLayout, layoutBoxes: normalizeLayoutBoxes({ contentLayout, mediaIds, layoutBoxes: section.layoutBoxes, removedLayoutBoxIds: section.removedLayoutBoxIds }), tableHeaders: type === 'table' ? Array.from({ length: columnCount }, (_, index) => section.tableHeaders?.[index] || (index === 0 ? '구분' : index === 1 ? '내용' : `항목 ${index + 1}`)) : section.tableHeaders || [], tableRows: type === 'table' ? (section.tableRows || []).map(row => Array.from({ length: columnCount }, (_, index) => row[index] || '')) : section.tableRows || [], iconCards: type === 'icon-card' ? iconCards : section.iconCards || [], extensions }
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
  const workspace = current.briefWorkspace
  const brief = workspace?.brief
  const briefWorkspace = workspace && { ...workspace, ...(brief ? { brief: { ...brief, common: withoutCategoryLabel(brief.common), blocks: brief.blocks.map(block => ({ ...withoutCategoryLabel(block), ...(block.layoutBoxes ? { layoutBoxes: block.layoutBoxes.map(withoutCategoryLabel) } : {}) })) } } : {}) }
  return { ...current, id, name, campaign, sections, briefWorkspace, contentGroups: normalizeContentGroups(current.contentGroups, sections), assets: current.assets || [] }
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

/** A safe, editable practice project. It never overwrites the user's current draft. */
export function createSampleProject(): Project {
  const project = createSeedProject()
  const text = makeSection('text')
  text.title = '괌 가족 휴양 4박 5일'
  text.body = '샘플 문구를 더블클릭해 바로 수정해 보세요. 여행지와 상품 성격에 맞춰 블록 순서를 바꾸고, 필요한 블록만 남기면 됩니다.'
  const image = makeSection('image')
  image.title = '바다 가까이에서 보내는 여유로운 하루'
  image.body = '가운데 이미지 박스를 클릭하면 왼쪽 이미지 탭으로 이동합니다. 라이브러리의 사진을 눌러 이 자리에 연결해 보세요.'
  image.layoutBoxes = createLayoutBoxes('text-top', image.mediaIds)
  const list = makeSection('list')
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
  }
}

/** Creates a pre-structured starter project based on verified Naeil Special patterns. */
export function createTemplateProject(templateId: TemplatePresetId): Project {
  const project = createSeedProject()
  if (templateId === 'theme-multi-city') {
    const hero = makeSection('image')
    hero.title = '유럽 맥주 기행 테마 우리만'
    hero.body = '체코·독일·벨기에·네덜란드 브루어리와 소도시를 전용 동선으로 연결합니다.'
    hero.mediaLayout = 'mosaic-left'
    hero.layoutBoxes = createLayoutBoxes('text-top', hero.mediaIds)
    const route = makeSection('route-bar')
    route.title = '한눈에 보는 황금 동선'
    route.body = '도시간 고속열차와 전용 픽업으로 이동 피로를 줄였습니다.'
    route.items = ['암스테르담', '브뤼셀', '플젠', '프라하']
    const benefits = makeSection('caption-grid')
    benefits.title = '우리만 상품 특전'
    benefits.body = '핵심 양조장 투어와 도시간 교통편을 모두 포함했습니다.'
    benefits.background = 'sand'
    benefits.listStyle = 'offer'
    benefits.items = ['암스테르담 브루어리 투어 | 라거 제조 과정 체험과 생맥주 시음', '브뤼셀 양조장 투어 | 벨기에 대표 에일·수도원 맥주 테이스팅', '플젠 오리지널 지하 저장고 | 오크통 무여과 맥주 직추출 시음', '프라하 코젤 & 고속열차 | 좌석 사전 예약 및 현지 픽업 연계']
    return { ...project, name: '테마 우리만 · 다도시 특전 기획안', category: '우리만', layout: 'theme-package', page: { title: '유럽 맥주 기행 테마 우리만', subtitle: '4개국 브루어리 & 소도시 일주', destination: '유럽', internalMemo: '' }, campaign: createCampaignData(project.id, '테마 우리만 · 다도시 특전 기획안'), sections: [hero, route, benefits] }
  }
  if (templateId === 'honeymoon-pick') {
    const cover = makeSection('hero-cover')
    cover.title = '발리 프라이빗 허니문'
    cover.body = '럭셔리 풀빌라 휴양과 원데이 액티비티, 데일리 마사지까지 둘만의 속도로 고르는 맞춤 허니문'
    cover.items = ['NO쇼핑 · NO옵션', '단독 가이드', '풀빌라 4박']
    const pick = makeSection('option-grid')
    pick.title = '원데이 프로그램 택 1'
    pick.body = '2일차·3일차 원하는 체험을 각각 1개씩 자유롭게 선택할 수 있습니다.'
    pick.items = ['발리스윙', '아융강 래프팅', '우붓 투어', '허니문 스냅']
    const common = makeSection('caption-grid')
    common.title = '허니문 예약 시 공통 특전'
    common.body = '두 분의 휴식을 완성하는 기본 포함 혜택입니다.'
    common.background = 'sand'
    common.listStyle = 'offer'
    common.items = ['데일리 마사지 2시간 | 매일 피로를 풀어주는 프라이빗 스파', '발리 선셋 스페셜 디너 | 해변 로맨틱 디너 1회 제공']
    return { ...project, name: '허니문 · 선택형 특전 기획안', category: '금까기', layout: 'hotel-sales', page: { title: '발리 프라이빗 허니문', subtitle: '풀빌라 4박 + 선택형 액티비티', destination: '발리', internalMemo: '' }, campaign: createCampaignData(project.id, '허니문 · 선택형 특전 기획안'), sections: [cover, pick, common] }
  }
  if (templateId === 'kids-vs') {
    const vs = makeSection('vs-compare')
    vs.title = '우리 아이 EQ & IQ 올려보자!'
    vs.body = '감성 체험과 역사 배움을 균형 있게 담아낸 가족 맞춤 일정입니다.'
    vs.background = 'mist'
    vs.items = ['감성 · 자연 체험 | EQ 여행이란? | 아이와 함께 새로운 자연과 문화를 몸으로 체험하며 감수성을 넓히는 여행', '역사 · 배움 체험 | IQ 여행이란? | 박물관·역사 현장을 직접 보고 만들며 호기심과 시야를 키우는 배움 여행']
    const spots = makeSection('caption-grid')
    spots.title = '주제별 핵심 체험 스팟'
    spots.body = '아이 눈높이에 맞춘 대표 체험지를 담았습니다.'
    spots.items = ['유니버셜 스튜디오 | 가족 모두가 즐기는 대표 테마파크', '오사카성 & 컵라면 박물관 | 역사 탐방과 나만의 컵라면 만들기']
    const svc = makeSection('service-bar')
    svc.title = '내일투어 스페셜 서비스'
    svc.body = '가족 여행 준비부터 현지 케어까지 함께합니다.'
    return { ...project, name: '키즈·가족 비교(VS) 기획안', category: '우리만', layout: 'theme-package', page: { title: '우리 아이 EQ & IQ 가족여행', subtitle: '체험과 배움이 함께하는 우리만', destination: '오사카', internalMemo: '' }, campaign: createCampaignData(project.id, '키즈·가족 비교(VS) 기획안'), sections: [vs, spots, svc] }
  }
  const cover = makeSection('hero-cover')
  cover.title = '중국 위해 유공도 국제 파크골프 대회'
  cover.body = '해안 도시 위해에서 펼쳐지는 36홀 개인 타수 경기와 휴양 일정'
  cover.items = ['주관 · 위해시 체육국', '기간 · 4월 14일~16일', '방식 · 36홀 스트로크']
  const chk = makeSection('list')
  chk.title = '골프 GMT 체크포인트'
  chk.body = '대회 참가와 이동·숙박 핵심 조건을 한눈에 확인하세요.'
  chk.items = ['인천 ↔ 위해 왕복 교통 및 대회 참가권·연습 라운딩 포함', '시내 준5성급 호텔 숙박 + 전 일정 식사 및 시상 만찬 제공', '노팁 · 노옵션 · 노쇼핑, 전용 차량 및 한국어 가이드 동행']
  const prize = makeSection('table')
  prize.title = '시상 내역 및 상금'
  prize.body = '남녀부 부문별 상금과 푸짐한 경품이 준비되어 있습니다.'
  prize.background = 'sand'
  prize.tableHeaders = ['NO', '시상 내용', '남자부 상금/상품', '여자부 상금/상품']
  prize.tableRows = [
    ['1', '총성적 우승', '상금 500만 + 고급클럽', '상금 500만 + 고급클럽'],
    ['2', '총성적 2등', '상금 300만 + 고급클럽', '상금 300만 + 고급클럽'],
    ['3', '총성적 3등', '상금 100만 + 고급클럽', '상금 100만 + 고급클럽'],
    ['4', '행운상 추첨', '파크골프채·볼 파우치 등', '파크골프채·볼 파우치 등'],
  ]
  const info = makeSection('service-bar')
  info.title = '참가 및 유의 안내'
  info.body = '대회 규정과 취소 규정을 미리 확인해 주세요.'
  info.items = ['대회 규정집 및 홀별 코스맵 출발 전 제공 | 사전 자료 안내', '현지 기상 상황에 따라 티오프 시간 조정 가능 | 대회 운영 규정']
  return { ...project, name: '골프 대회 · 확장표 기획안', category: '골프', layout: 'golf-standard', page: { title: '중국 위해 유공도 국제 파크골프 대회', subtitle: '5박 6일 대회 참가 & 휴양', destination: '위해', internalMemo: '' }, campaign: createCampaignData(project.id, '골프 대회 · 확장표 기획안'), sections: [cover, chk, prize, info] }
}
