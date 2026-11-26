import { describe, expect, it } from 'vitest'
import { createSeedProject } from './catalog'
import { applyProjectPatch, dispatchEditorAction, projectPatch, sectionPatch } from './cli-commands'

describe('shared GUI and CLI editing', () => {
  it('renames the matching page title and retains other page fields', () => {
    const project = createSeedProject()
    project.page.destination = '다낭'
    applyProjectPatch(project, projectPatch({ name: '겨울 여행', page: { subtitle: '함께 떠나요' } }))
    expect(project.name).toBe('겨울 여행')
    expect(project.page.title).toBe('겨울 여행')
    expect(project.page.destination).toBe('다낭')
    expect(project.page.subtitle).toBe('함께 떠나요')
    applyProjectPatch(project, projectPatch({ name: '새 이름', page: { title: '별도 제목' } }))
    expect(project.page.title).toBe('별도 제목')
  })

  it('rejects invalid input before dispatching any edit', () => {
    let calls = 0
    const actions = { edit: { params: ['patch'], run: ([patch]: unknown[]) => { sectionPatch(patch); calls++ } } }
    expect(() => dispatchEditorAction(actions, { action: 'edit', args: [{ items: [42] }] }, 1, false)).toThrow()
    expect(() => dispatchEditorAction(actions, { action: 'edit', args: [{}], expectedRevision: 0 }, 1, false)).toThrow('REVISION_CONFLICT')
    expect(() => dispatchEditorAction(actions, { action: 'edit', args: [{}] }, 1, true)).toThrow('읽기 전용')
    expect(() => dispatchEditorAction(actions, { action: 'edit', args: [] }, 1, false)).toThrow()
    expect(() => dispatchEditorAction(actions, { action: 'toString', args: [] }, 1, false)).toThrow()
    expect(calls).toBe(0)
    dispatchEditorAction(actions, { action: 'edit', args: [{ title: '새 제목' }], expectedRevision: 1 }, 1, false)
    expect(calls).toBe(1)
  })

  it('allows safe reads on read-only projects and rejects unsafe patches', () => {
    expect(dispatchEditorAction({ get: { params: [], readOnly: true, run: () => '현재 내용' } }, { action: 'get', args: [] }, 0, true)).toBe('현재 내용')
    expect(() => projectPatch(JSON.parse('{"__proto__":{}}'))).toThrow()
    expect(() => projectPatch({ page: { title: 42 } })).toThrow()
    expect(() => sectionPatch({ id: 'replace-existing-id' })).toThrow()
    expect(() => sectionPatch({ mediaLayout: 'invalid' })).toThrow()
    expect(sectionPatch({ tableRows: [['날짜', '일정']], hidden: false })).toEqual({ tableRows: [['날짜', '일정']], hidden: false })
  })
})
