import { describe, expect, it } from 'vitest'
import { approveBrief, buildDraftBrief, buildProjectFromApprovedBrief, createBriefWorkspace } from './brief'
import { createSeedProject } from './catalog'
import { projectLoadJson } from './exporters'

function addAssets(project: ReturnType<typeof createSeedProject>, count: number) {
  for (let index = 0; index < count; index += 1) {
    project.assets.push({ id: `asset-${index + 1}`, name: `asset-${index + 1}.jpg`, src: 'data:image/jpeg;base64,AA==', provider: 'provided', sourceId: '', assetStage: 'original', usageScope: '상세페이지', rightsStatus: 'cleared', qualityGrade: 'A', approval: 'approved', evidence: '사용자 제공', alt: `이미지 ${index + 1}` })
  }
  return project.assets.map(asset => asset.id)
}

describe('brief studio flow', () => {
  it('keeps raw input separate while producing a reviewable draft brief', () => {
    const project = createSeedProject()
    project.name = '괌 가족여행 4박 5일'
    project.page.destination = '괌'
    project.assets.push({ id: 'hero', name: 'guam.jpg', src: 'data:image/jpeg;base64,AA==', provider: 'provided', sourceId: '', assetStage: 'original', usageScope: '상세페이지', rightsStatus: 'cleared', qualityGrade: 'A', approval: 'approved', evidence: '사용자 제공', alt: '괌 리조트' })
    const workspace = { ...createBriefWorkspace(), rawText: '1일차 인천 출발 후 괌 도착\n숙박: 리조트 4박', selectedImageIds: ['hero'], facts: [{ id: 'stay', field: '숙박', value: '4박', source: '사용자 일정표', status: 'confirmed' as const }, { id: 'flight', field: '항공편', value: '출발일별 확인 필요', source: '원본 상품 자료', status: 'needs-review' as const }] }
    const brief = buildDraftBrief(project, workspace)
    expect(brief.status).toBe('draft')
    expect(brief.blockOrder).toEqual(['text', 'image', 'list'])
    expect(brief.composition?.strategy).toBe('minimal')
    expect(brief.confirmedFacts).toEqual([{ field: '숙박', value: '4박', source: '사용자 일정표' }])
    expect(brief.needsReview.map(item => item.field)).toEqual(expect.arrayContaining(['항공편', '원본 상품 자료']))
    expect(workspace.rawText).toContain('인천 출발')
    expect(brief.imageIds).toEqual(['hero'])
  })

  it('selects different deterministic flows from material signals instead of category defaults', () => {
    const photoProject = createSeedProject()
    const photoAssets = addAssets(photoProject, 3)
    const photo = buildDraftBrief(photoProject, { ...createBriefWorkspace(), rawText: '리조트 객실은 바다 전망입니다.\n야외 수영장과 키즈 시설을 이용합니다.\n레스토랑 조식이 포함됩니다.', selectedImageIds: photoAssets })

    const scheduleProject = createSeedProject()
    const scheduleAssets = addAssets(scheduleProject, 1)
    const detailed = buildDraftBrief(scheduleProject, { ...createBriefWorkspace(), rawText: '09:00 인천 출발\n13:30 괌 도착\n15:00 호텔 체크인\n18:00 석식', selectedImageIds: scheduleAssets })

    const benefitProject = createSeedProject()
    const benefit = buildDraftBrief(benefitProject, { ...createBriefWorkspace(), facts: [
      { id: 'stay', field: '숙박', value: '리조트 4박', source: '상품 조건', status: 'confirmed' },
      { id: 'meal', field: '조식', value: '매일 제공', source: '상품 조건', status: 'confirmed' },
      { id: 'transfer', field: '공항 이동', value: '왕복 포함', source: '상품 조건', status: 'confirmed' },
    ] })

    const summaryProject = createSeedProject()
    const summaryAssets = addAssets(summaryProject, 2)
    const summary = buildDraftBrief(summaryProject, { ...createBriefWorkspace(), rawText: '1일차 인천 출발 후 괌 도착\n2일차 리조트 휴식\n3일차 자유 일정', selectedImageIds: summaryAssets })

    expect(photo.composition?.strategy).toBe('photo-led')
    expect(photo.blockOrder).toEqual(['image', 'menu-zigzag'])
    expect(detailed.composition?.strategy).toBe('detailed-schedule')
    expect(detailed.blockOrder).toEqual(['text', 'timeline', 'image'])
    expect(benefit.composition?.strategy).toBe('benefit-led')
    expect(benefit.blockOrder).toEqual(['text', 'icon-card', 'list'])
    expect(summary.composition?.strategy).toBe('summary-schedule')
    expect(summary.blockOrder).toEqual(['text', 'table', 'menu-zigzag'])
    expect(new Set([photo.blockOrder.join(','), detailed.blockOrder.join(','), benefit.blockOrder.join(','), summary.blockOrder.join(',')]).size).toBe(4)
  })

  it('honors a chosen composition direction while retaining deterministic output', () => {
    const project = createSeedProject()
    const assetIds = addAssets(project, 2)
    const workspace = { ...createBriefWorkspace(), rawText: '객실과 수영장 설명', selectedImageIds: assetIds, compositionHint: 'benefit-led' as const }
    const first = buildDraftBrief(project, workspace)
    const second = buildDraftBrief(project, workspace)
    expect(first.composition?.strategy).toBe('benefit-led')
    expect(first.blockOrder).toEqual(['text', 'icon-card', 'list', 'image'])
    expect(second.blockOrder).toEqual(first.blockOrder)
  })

  it('rejects draft brief application and applies only approved blocks and selected images', () => {
    const project = createSeedProject()
    project.assets.push({ id: 'selected', name: 'selected.jpg', src: 'data:image/jpeg;base64,AA==', provider: 'provided', sourceId: '', assetStage: 'original', usageScope: '상세페이지', rightsStatus: 'cleared', qualityGrade: 'A', approval: 'approved', evidence: '사용자 제공', alt: '선택 이미지' }, { id: 'unused', name: 'unused.jpg', src: 'data:image/jpeg;base64,AA==', provider: 'provided', sourceId: '', assetStage: 'reference', usageScope: '상세페이지', rightsStatus: 'unknown', qualityGrade: 'B', approval: 'pending', evidence: '', alt: '미선택 이미지' })
    const draft = buildDraftBrief(project, { ...createBriefWorkspace(), selectedImageIds: ['selected'], facts: [{ id: 'benefit', field: '특전', value: '조식 포함', source: '상품 조건', status: 'confirmed' }] })
    expect(() => buildProjectFromApprovedBrief(project, draft)).toThrow('승인된 brief')
    const approved = approveBrief(draft)
    const generated = buildProjectFromApprovedBrief(project, approved)
    expect(generated.schemaVersion).toBe('2.1.0')
    expect(generated.deliveryStage).toBe('internal-draft')
    expect(generated.sections.map(section => section.type)).toEqual(approved.blockOrder)
    expect(generated.assets.map(asset => asset.id)).toEqual(['selected'])
    expect(generated.extensions?.approvedBrief).toBeTruthy()
    expect(generated.briefWorkspace?.brief?.status).toBe('approved')
    expect(projectLoadJson(generated)).not.toContain('rawText')
  })
})
