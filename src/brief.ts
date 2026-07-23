import { createCampaignData, makeSection, normalizeLayoutBoxes } from './catalog'
import { CURRENT_CATALOG_VERSION, CURRENT_SCHEMA_VERSION } from './migrations'
import type { BriefFact, BriefWorkspace, CanvasBrief, CanvasBriefBlock, GeneratableSectionType, MediaAsset, Project, Section } from './types'

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
  return candidate ? candidate.slice(0, 180) : '상품의 핵심 가치와 확인된 정보를 바탕으로 기획 초안을 작성합니다.'
}

function scheduleRows(rawText: string) {
  const lines = plainLines(rawText).filter(line => /(day\s*\d|\d\s*일차|일정|출발|도착|체크인|라운드)/i.test(line))
  return lines.slice(0, 5).map((line, index) => [`DAY ${index + 1}`, line])
}

function routeFor(category: Project['category'], rawText: string): GeneratableSectionType[] {
  const hasDetailedSchedule = /(시간|\d{1,2}:\d{2}|체크인|라운드|일정)/.test(rawText)
  if (category === '특별한') return hasDetailedSchedule ? ['text', 'image', 'timeline'] : ['text', 'image', 'list']
  if (category === '골프') return ['text', 'image', 'list', 'table']
  return ['text', 'image', 'list', 'table']
}

function blockFor(type: GeneratableSectionType, common: CanvasBrief['common'], imageIds: string[], facts: BriefFact[], rawText: string): CanvasBriefBlock {
  const confirmed = facts.filter(fact => fact.status === 'confirmed' && fact.field.trim() && fact.value.trim())
  const factItems = confirmed.slice(0, 4).map(fact => `${fact.field} · ${fact.value}`)
  if (type === 'text') return { type, ...common }
  if (type === 'image') return { type, categoryLabel: common.categoryLabel, title: '여행의 주요 장면', body: '이미지와 함께 보여 줄 핵심 장면을 정리한 초안입니다.', mediaIds: imageIds, mediaLayout: imageIds.length >= 3 ? 'custom' : 'auto', contentLayout: 'text-top' }
  if (type === 'list') return { type, categoryLabel: common.categoryLabel, title: '핵심 포인트', body: '확인된 정보부터 우선 반영했습니다.', items: factItems.length ? factItems : ['확인된 상품 핵심 정보를 추가하세요.'], listStyle: 'list' }
  if (type === 'table') {
    const rows = scheduleRows(rawText)
    return { type, categoryLabel: common.categoryLabel, title: '간략 일정표', body: '원본 일정표를 확인한 뒤 세부 내용을 보완하세요.', tableHeaders: ['구분', '내용'], tableRows: rows.length ? rows : [['DAY 1', '일정 원문을 확인한 뒤 입력하세요.']] }
  }
  if (type === 'timeline') return { type, categoryLabel: common.categoryLabel, title: '상세 일정표', body: '시간과 장소는 원본 일정표 확인 후 보완하세요.', items: ['00:00 | 일정 제목 | 원본 일정표를 확인한 뒤 입력하세요.'], timelineDayStarts: [0], timelineHeroVisible: true, mediaIds: ['', imageIds[0] || ''] }
  if (type === 'icon-card') return { type, categoryLabel: common.categoryLabel, title: '선택 포인트', body: '아이콘 카드로 정리할 핵심 가치를 입력하세요.', iconCards: [] }
  return { type, categoryLabel: common.categoryLabel, title: '이미지·설명 카드', body: '이미지와 설명을 한 쌍으로 정리하세요.', items: ['제목 | 본문'], mediaIds: [imageIds[0] || ''], menuItemReversed: [false] }
}

export function buildDraftBrief(project: Project, workspace: BriefWorkspace): CanvasBrief {
  const product = { name: project.name.trim() || '새 내일스패셜 기획안', category: project.category, layout: project.layout, destination: project.page.destination.trim(), subtitle: project.page.subtitle.trim() }
  const lead = draftLead(workspace.rawText)
  const common = { categoryLabel: CATEGORY_LABEL[product.category], title: product.name, body: lead }
  const imageIds = workspace.selectedImageIds.filter(id => project.assets.some(asset => asset.id === id))
  const blockOrder = routeFor(product.category, workspace.rawText)
  const confirmedFacts = workspace.facts.filter(fact => fact.status === 'confirmed' && fact.field.trim() && fact.value.trim()).map(fact => ({ field: fact.field.trim(), value: fact.value.trim(), source: fact.source.trim() || '사용자 입력' }))
  const needsReview = [
    ...workspace.facts.filter(fact => fact.status === 'needs-review' && (fact.field.trim() || fact.value.trim())).map(fact => ({ field: fact.field.trim() || '확인 필요 정보', reason: fact.value.trim() || '원본 자료 확인 필요' })),
    ...(workspace.rawText.trim() ? [{ field: '원본 상품 자료', reason: '원문은 보존했으며 가격·일정·포함 조건은 확인된 사실 목록에서만 확정하세요.' }] : []),
    ...(!imageIds.length ? [{ field: '이미지', reason: '캔버스에 사용할 이미지를 선택하세요.' }] : []),
  ]
  return {
    status: 'draft', approvedAt: '', updatedAt: new Date().toISOString(), product, common,
    audience: CATEGORY_AUDIENCE[product.category], message: lead,
    blockOrder, blocks: blockOrder.map(type => blockFor(type, common, imageIds, workspace.facts, workspace.rawText)), imageIds,
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
    extensions: { ...(current.extensions || {}), approvedBrief: { approvedAt: brief.approvedAt, confirmedFacts: brief.confirmedFacts, needsReview: brief.needsReview, imageDirections: brief.imageDirections } },
  }
  project.campaign.campaign_id = project.id
  project.campaign.product_name = project.name
  project.campaign.tracking.promotion_id = project.id
  return project
}
