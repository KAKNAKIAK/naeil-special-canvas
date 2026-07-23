import { describe, expect, it } from 'vitest'
import { approveBrief, buildDraftBrief, buildProjectFromApprovedBrief, createBriefWorkspace } from './brief'
import { createSeedProject } from './catalog'
import { projectLoadJson } from './exporters'

describe('brief studio flow', () => {
  it('keeps raw input separate while producing a reviewable draft brief', () => {
    const project = createSeedProject()
    project.name = '괌 가족여행 4박 5일'
    project.page.destination = '괌'
    project.assets.push({ id: 'hero', name: 'guam.jpg', src: 'data:image/jpeg;base64,AA==', provider: 'provided', sourceId: '', assetStage: 'original', usageScope: '상세페이지', rightsStatus: 'cleared', qualityGrade: 'A', approval: 'approved', evidence: '사용자 제공', alt: '괌 리조트' })
    const workspace = { ...createBriefWorkspace(), rawText: '1일차 인천 출발 후 괌 도착\n숙박: 리조트 4박', selectedImageIds: ['hero'], facts: [{ id: 'stay', field: '숙박', value: '4박', source: '사용자 일정표', status: 'confirmed' as const }, { id: 'flight', field: '항공편', value: '출발일별 확인 필요', source: '원본 상품 자료', status: 'needs-review' as const }] }
    const brief = buildDraftBrief(project, workspace)
    expect(brief.status).toBe('draft')
    expect(brief.blockOrder).toEqual(['text', 'image', 'list', 'table'])
    expect(brief.confirmedFacts).toEqual([{ field: '숙박', value: '4박', source: '사용자 일정표' }])
    expect(brief.needsReview.map(item => item.field)).toEqual(expect.arrayContaining(['항공편', '원본 상품 자료']))
    expect(workspace.rawText).toContain('인천 출발')
    expect(brief.imageIds).toEqual(['hero'])
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
