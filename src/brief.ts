import { createCampaignData, makeSection, normalizeLayoutBoxes } from './catalog'
import { CURRENT_CATALOG_VERSION, CURRENT_SCHEMA_VERSION } from './migrations'
import type { BriefCompositionStrategy, BriefFact, BriefWorkspace, CanvasBrief, CanvasBriefBlock, GeneratableSectionType, Project, Section } from './types'

const GENERATABLE_TYPES = new Set<GeneratableSectionType>(['text', 'image', 'list', 'table', 'icon-card', 'menu-zigzag', 'timeline'])
const CATEGORY_LABEL: Record<Project['category'], string> = { 금까기: 'NAEIL GOLD', 우리만: 'NAEIL PRIVATE', 특별한: 'NAEIL SPECIAL', 골프: 'NAEIL GOLF' }
const CATEGORY_AUDIENCE: Record<Project['category'], string> = { 금까기: '자유롭지만 핵심 구성을 놓치고 싶지 않은 여행자', 우리만: '일행만의 여정을 원하는 소규모 고객', 특별한: '테마와 경험을 중심으로 여행을 고르는 고객', 골프: '라운드와 휴식을 함께 계획하는 골프 여행객' }

export function createBriefWorkspace(): BriefWorkspace {
  return { rawText: '', sourceUrls: [], facts: [], selectedImageIds: [] }
}

function plainLines(rawText: string) {
  return rawText.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
}

function draftLead(rawText: string) {
  const candidate = plainLines(rawText).find(line => line.length >= 12)
  return candidate ? candidate.slice(0, 180) : '확인된 정보로 기획 초안을 작성합니다.'
}

type ContentSignals = {
  sourceLines: string[]
  scheduleLines: string[]
  timedScheduleCount: number
  visualLines: string[]
  benefitCount: number
  confirmed: BriefFact[]
}

type CompositionPlan = { strategy: BriefCompositionStrategy; reason: string; order: GeneratableSectionType[] }

const schedulePattern = /(day\s*\d|\d\s*일차|일정|출발|도착|체크인|체크아웃|라운드|tee\s*time)/i
const timePattern = /\b\d{1,2}:\d{2}\b|오전|오후|am\b|pm\b/i
const visualPattern = /(객실|룸|리조트|호텔|수영장|워터파크|스파|레스토랑|조식|식당|메뉴|관광지|전망|해변|비치|골프장|코스|클럽하우스)/i
const benefitPattern = /(특전|포함|무료|전용|노쇼핑|업그레이드|혜택|할인|제공|추천|장점)/i

function contentSignals(rawText: string, facts: BriefFact[]): ContentSignals {
  const sourceLines = plainLines(rawText)
  const confirmed = facts.filter(fact => fact.status === 'confirmed' && fact.field.trim() && fact.value.trim())
  const factText = confirmed.map(fact => `${fact.field} ${fact.value}`)
  const allLines = [...sourceLines, ...factText]
  return {
    sourceLines,
    scheduleLines: sourceLines.filter(line => schedulePattern.test(line)),
    timedScheduleCount: sourceLines.filter(line => timePattern.test(line)).length,
    visualLines: allLines.filter(line => visualPattern.test(line)),
    benefitCount: allLines.filter(line => benefitPattern.test(line)).length,
    confirmed,
  }
}

function uniqueOrder(types: string[]): GeneratableSectionType[] {
  return [...new Set(types)].filter((type): type is GeneratableSectionType => GENERATABLE_TYPES.has(type as GeneratableSectionType))
}

function routeFor(rawText: string, facts: BriefFact[], imageIds: string[], hint: BriefWorkspace['compositionHint'] = 'auto'): CompositionPlan {
  const signals = contentSignals(rawText, facts)
  const withImage = imageIds.length > 0
  const withList = signals.confirmed.length > 0
  const build = (strategy: BriefCompositionStrategy): CompositionPlan => {
    if (strategy === 'detailed-schedule') return {
      strategy,
      reason: `시간 정보 ${signals.timedScheduleCount}건과 일정 행 ${signals.scheduleLines.length}건을 중심으로 구성했습니다.`,
      order: uniqueOrder(['text', 'timeline', ...(withImage ? ['image'] : []), ...(signals.benefitCount >= 2 ? ['list'] : [])]),
    }
    if (strategy === 'summary-schedule') return {
      strategy,
      reason: `날짜·이동 중심 일정 행 ${signals.scheduleLines.length}건을 한눈에 보이도록 구성했습니다.`,
      order: uniqueOrder(['text', 'table', ...(imageIds.length >= 2 ? ['menu-zigzag'] : withImage ? ['image'] : []), ...(withList ? ['list'] : [])]),
    }
    if (strategy === 'photo-led') return {
      strategy,
      reason: `선택 이미지 ${imageIds.length}장과 공간·시설 정보 ${signals.visualLines.length}건을 먼저 보여 주도록 구성했습니다.`,
      order: uniqueOrder(['image', 'menu-zigzag', ...(signals.benefitCount >= 2 ? ['icon-card'] : withList ? ['list'] : []), ...(signals.scheduleLines.length >= 2 ? ['table'] : [])]),
    }
    if (strategy === 'benefit-led') return {
      strategy,
      reason: `확인된 구성·특전 정보 ${Math.max(signals.benefitCount, signals.confirmed.length)}건을 비교하기 쉽게 구성했습니다.`,
      order: uniqueOrder(['text', 'icon-card', 'list', ...(withImage ? ['image'] : [])]),
    }
    if (strategy === 'story-led') return {
      strategy,
      reason: `이미지 ${imageIds.length}장과 설명 자료를 번갈아 보여 주도록 구성했습니다.`,
      order: uniqueOrder(['image', 'text', ...(imageIds.length >= 2 ? ['menu-zigzag'] : []), ...(withList ? ['list'] : [])]),
    }
    return {
      strategy: 'minimal',
      reason: '현재 확인된 자료량에 맞춰 필요한 블록만 최소 구성으로 만들었습니다.',
      order: uniqueOrder(['text', ...(withImage ? ['image'] : []), ...(withList ? ['list'] : [])]),
    }
  }
  if (hint && hint !== 'auto') return build(hint)
  if (signals.timedScheduleCount >= 2 || signals.scheduleLines.length >= 4) return build('detailed-schedule')
  if (imageIds.length >= 3 && (signals.visualLines.length >= 1 || signals.scheduleLines.length === 0)) return build('photo-led')
  if (signals.benefitCount >= 2 || signals.confirmed.length >= 3) return build('benefit-led')
  if (signals.scheduleLines.length >= 2) return build('summary-schedule')
  if (imageIds.length >= 2 && (signals.visualLines.length >= 1 || signals.sourceLines.length >= 3)) return build('story-led')
  return build('minimal')
}

function scheduleRows(signals: ContentSignals) {
  return signals.scheduleLines.slice(0, 5).map((line, index) => [`DAY ${index + 1}`, line])
}

function titleAndBody(line: string) {
  const [head, ...rest] = line.split(/\s*[:：]\s*/)
  const title = head.trim().slice(0, 38) || line.slice(0, 38)
  const body = rest.join(' ').trim() || '원본 자료의 상세 설명을 확인하세요.'
  return { title, body }
}

function blockFor(type: GeneratableSectionType, common: CanvasBrief['common'], imageIds: string[], facts: BriefFact[], rawText: string, plan: CompositionPlan): CanvasBriefBlock {
  const signals = contentSignals(rawText, facts)
  const factItems = signals.confirmed.slice(0, 5).map(fact => `${fact.field} · ${fact.value}`)
  const visualItems = [...signals.visualLines, ...signals.confirmed.map(fact => `${fact.field}: ${fact.value}`)]
  const focus = signals.confirmed[0]?.field || '상품 구성'
  if (type === 'text') return { type, ...common }
  if (type === 'image') return {
    type, categoryLabel: common.categoryLabel, title: `${focus} 이미지`, body: '사진과 설명을 함께 배치해 보세요.', mediaIds: imageIds,
    mediaLayout: imageIds.length >= 4 ? 'grid-3' : imageIds.length >= 2 ? 'grid-2' : 'auto',
    contentLayout: plan.strategy === 'photo-led' ? 'media-top' : plan.strategy.includes('schedule') ? 'media-right' : 'text-top',
  }
  if (type === 'list') return {
    type, categoryLabel: common.categoryLabel, title: plan.strategy === 'benefit-led' ? '포함 사항과 특전' : '확인된 포인트',
    body: '확인된 내용입니다.', items: factItems.length ? factItems : ['확인된 상품 정보를 추가하세요.'], listStyle: plan.strategy === 'benefit-led' ? 'offer' : 'list',
  }
  if (type === 'table') {
    const rows = scheduleRows(signals)
    return { type, categoryLabel: common.categoryLabel, title: '일정 한눈에 보기', body: '원본 일정에서 확인한 이동과 체험을 정리했습니다.', tableHeaders: ['구분', '내용'], tableRows: rows.length ? rows : [['DAY 1', '일정 원문을 확인한 뒤 입력하세요.']] }
  }
  if (type === 'timeline') {
    const timelineItems = signals.scheduleLines.slice(0, 8).map((line, index) => {
      const time = line.match(/\b\d{1,2}:\d{2}\b/)?.[0] || `${String(index + 9).padStart(2, '0')}:00`
      const copy = titleAndBody(line)
      return `${time} | ${copy.title} | ${copy.body}`
    })
    return { type, categoryLabel: common.categoryLabel, title: '시간별 일정', body: '시간 정보가 있는 원본 일정부터 배치했습니다.', items: timelineItems.length ? timelineItems : ['00:00 | 일정 제목 | 원본 일정표를 확인한 뒤 입력하세요.'], timelineDayStarts: [0], timelineHeroVisible: true, mediaIds: ['', ...imageIds.slice(0, Math.max(1, timelineItems.length))] }
  }
  if (type === 'icon-card') {
    const cards = (signals.confirmed.length ? signals.confirmed : [{ field: '확인 포인트', value: '상품 정보를 추가하세요.' }]).slice(0, 6).map((fact, index) => ({ id: `brief-card-${index + 1}`, icon: index % 3 === 0 ? 'calendar' : index % 3 === 1 ? 'hotel' : 'car', title: fact.field, body: fact.value, tone: index % 3 === 0 ? 'teal' as const : index % 3 === 1 ? 'orange' as const : 'green' as const }))
    return { type, categoryLabel: common.categoryLabel, title: '선택 이유', body: '핵심 조건을 카드로 나눠 확인하세요.', iconCards: cards }
  }
  const pairs = visualItems.slice(0, Math.max(1, Math.min(imageIds.length || 1, 4))).map(titleAndBody)
  return { type, categoryLabel: common.categoryLabel, title: '공간과 경험', body: '이미지와 연결할 설명을 원본 자료에서 골랐습니다.', items: pairs.length ? pairs.map(pair => `${pair.title} | ${pair.body}`) : ['제목 | 원본 자료의 설명을 입력하세요.'], mediaIds: imageIds.slice(0, Math.max(1, pairs.length)), menuItemReversed: pairs.map((_, index) => index % 2 === 1) }
}

export function buildDraftBrief(project: Project, workspace: BriefWorkspace): CanvasBrief {
  const product = { name: project.name.trim() || '새 내일스패셜 기획안', category: project.category, layout: project.layout, destination: project.page.destination.trim(), subtitle: project.page.subtitle.trim() }
  const lead = draftLead(workspace.rawText)
  const common = { categoryLabel: CATEGORY_LABEL[product.category], title: product.name, body: lead }
  const imageIds = workspace.selectedImageIds.filter(id => project.assets.some(asset => asset.id === id))
  const plan = routeFor(workspace.rawText, workspace.facts, imageIds, workspace.compositionHint)
  const blockOrder = plan.order
  const confirmedFacts = workspace.facts.filter(fact => fact.status === 'confirmed' && fact.field.trim() && fact.value.trim()).map(fact => ({ field: fact.field.trim(), value: fact.value.trim(), source: fact.source.trim() || '사용자 입력' }))
  const needsReview = [
    ...workspace.facts.filter(fact => fact.status === 'needs-review' && (fact.field.trim() || fact.value.trim())).map(fact => ({ field: fact.field.trim() || '확인 필요 정보', reason: fact.value.trim() || '원본 자료 확인 필요' })),
    ...(workspace.rawText.trim() ? [{ field: '원본 상품 자료', reason: '원문은 보존했으며 가격·일정·포함 조건은 확인된 사실 목록에서만 확정하세요.' }] : []),
    ...(!imageIds.length ? [{ field: '이미지', reason: '캔버스에 사용할 이미지를 선택하세요.' }] : []),
  ]
  return {
    status: 'draft', approvedAt: '', updatedAt: new Date().toISOString(), product, common,
    audience: CATEGORY_AUDIENCE[product.category], message: lead, composition: { strategy: plan.strategy, reason: plan.reason },
    blockOrder, blocks: blockOrder.map(type => blockFor(type, common, imageIds, workspace.facts, workspace.rawText, plan)), imageIds,
    confirmedFacts, needsReview, imageDirections: imageIds.map((assetId, index) => ({ assetId, role: index === 0 ? '대표 이미지 후보' : `보조 이미지 ${index}` })),
  }
}

export function updateBrief(brief: CanvasBrief, patch: Partial<CanvasBrief>): CanvasBrief {
  return { ...brief, ...patch, status: 'draft', approvedAt: '', updatedAt: new Date().toISOString() }
}

export function approveBrief(brief: CanvasBrief): CanvasBrief {
  if (!brief.product.name.trim()) throw new Error('상품명을 입력하세요.')
  if (!brief.blocks.length || brief.blocks.length !== brief.blockOrder.length) throw new Error('블록 구성을 확인하세요.')
  if (!brief.blocks.every((block, index) => block.type === brief.blockOrder[index] && GENERATABLE_TYPES.has(block.type))) throw new Error('현재 계약에서 생성할 수 없는 블록이 포함되어 있습니다.')
  return { ...brief, status: 'approved', approvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
}

function applyBlock(block: CanvasBriefBlock): Section {
  const section = makeSection(block.type)
  section.eyebrow = block.categoryLabel || ''
  section.title = block.title || ''
  section.body = block.body || ''
  section.items = [...(block.items || section.items)]
  section.mediaIds = [...(block.mediaIds || [])]
  section.mediaLayout = block.mediaLayout || section.mediaLayout
  section.contentLayout = block.contentLayout || section.contentLayout
  section.layoutBoxes = block.layoutBoxes?.length ? block.layoutBoxes : normalizeLayoutBoxes(section)
  section.tableHeaders = block.tableHeaders || section.tableHeaders
  section.tableRows = block.tableRows || section.tableRows
  section.iconCards = block.iconCards || section.iconCards
  section.listStyle = block.listStyle || section.listStyle
  section.menuItemReversed = block.menuItemReversed || section.menuItemReversed
  section.timelineDayStarts = block.timelineDayStarts || section.timelineDayStarts
  section.timelineHeroVisible = block.timelineHeroVisible ?? section.timelineHeroVisible
  section.note = block.note || ''
  return section
}

/** Build the same loadable Project shape as the external writer Skill, but only after explicit approval. */
export function buildProjectFromApprovedBrief(current: Project, brief: CanvasBrief): Project {
  if (brief.status !== 'approved') throw new Error('승인된 brief만 캔버스에 반영할 수 있습니다.')
  if (!brief.blocks.every((block, index) => block.type === brief.blockOrder[index] && GENERATABLE_TYPES.has(block.type))) throw new Error('brief 블록 구성이 현재 계약과 다릅니다.')
  const now = new Date().toISOString()
  const assets = current.assets.filter(asset => brief.imageIds.includes(asset.id))
  const project: Project = {
    schemaVersion: CURRENT_SCHEMA_VERSION, catalogVersion: CURRENT_CATALOG_VERSION, id: current.id, name: brief.product.name,
    layout: brief.product.layout, category: brief.product.category, deliveryStage: 'internal-draft', updatedAt: now,
    page: { title: brief.product.name, subtitle: brief.product.subtitle, destination: brief.product.destination, internalMemo: 'AI 작성 초안 · 승인 brief 기반' },
    campaign: createCampaignData(current.id, brief.product.name), sections: brief.blocks.map(applyBlock), contentGroups: [], assets,
    generator: { name: 'naeil-special-canvas-brief-studio', version: '1.0.0', generatedAt: now },
    briefWorkspace: { ...(current.briefWorkspace || createBriefWorkspace()), brief },
    extensions: { ...(current.extensions || {}), approvedBrief: { approvedAt: brief.approvedAt, composition: brief.composition, confirmedFacts: brief.confirmedFacts, needsReview: brief.needsReview, imageDirections: brief.imageDirections } },
  }
  project.campaign.campaign_id = project.id
  project.campaign.product_name = project.name
  project.campaign.tracking.promotion_id = project.id
  return project
}
