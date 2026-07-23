import { describe, expect, it } from 'vitest'
import currentAllBlocks from '../../fixtures/current-all-blocks.json'
import legacyTwo from '../../fixtures/legacy-2.0.json'
import legacyUnversioned from '../../fixtures/legacy-unversioned.json'
import generatedHotel from '../../fixtures/generated-hotel-project.json'
import { normalizeProject } from '../catalog'
import { projectLoadJson, standaloneHtml } from '../exporters'
import { CURRENT_CATALOG_VERSION, CURRENT_SCHEMA_VERSION, migrateProject } from './index'

describe('Project migration fixtures', () => {
  it('keeps every current and compatibility block when normalized and saved', () => {
    const project = normalizeProject(migrateProject(currentAllBlocks).project)
    expect(project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(project.sections.map(section => section.type)).toEqual(['text', 'image', 'list', 'icon-card', 'table', 'timeline', 'menu-zigzag', 'offer', 'caption-grid'])
  })

  it('migrates the 2.0 fixture and preserves unknown root and section fields', () => {
    const result = migrateProject(legacyTwo)
    const project = normalizeProject(result.project)
    expect(result.migrated).toBe(true)
    expect(project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(project.catalogVersion).toBe(CURRENT_CATALOG_VERSION)
    expect((project as unknown as { futureRootField: { keep: boolean } }).futureRootField.keep).toBe(true)
    expect((project.sections[0] as unknown as { futureSectionField: string }).futureSectionField).toBe('보존')
  })

  it('migrates an unversioned direct project before rendering it', () => {
    const result = migrateProject(legacyUnversioned)
    expect(result.sourceSchemaVersion).toBe('unversioned')
    expect(result.project.migrationLog?.[0]?.from).toBe('unversioned')
  })

  it('renders an unsupported future block as a placeholder but re-saves its raw payload', () => {
    const source = { ...legacyUnversioned, sections: [{ ...legacyUnversioned.sections[0], type: 'future-gallery', futureData: { accent: 'violet' } }] }
    const normalized = normalizeProject(migrateProject(source).project)
    expect(normalized.sections[0].title).toContain('future-gallery')
    const restored = JSON.parse(projectLoadJson(normalized))
    expect(restored.sections[0].type).toBe('future-gallery')
    expect(restored.sections[0].futureData).toEqual({ accent: 'violet' })
  })

  it('opens approved-brief generated JSON in the app model and export renderer', () => {
    const project = normalizeProject(migrateProject(generatedHotel).project)
    expect(project.generator?.name).toBe('naeil-special-canvas-writer')
    expect(project.extensions?.approvedBrief).toBeTruthy()
    expect(project.assets[0].download?.status).toBe('pending')
    expect(standaloneHtml(project)).toContain('https://example.com/dusit-thani-guam.jpg')
    expect(JSON.parse(projectLoadJson(project)).generator.contractHash).toBeTruthy()
  })
})
