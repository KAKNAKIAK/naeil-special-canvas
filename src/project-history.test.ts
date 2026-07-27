import { describe, expect, it } from 'vitest'
import { createSeedProject } from './catalog'
import { collectAssetSources, historySnapshot, restoreHistorySnapshot } from './project-history'

describe('project history', () => {
  it('does not duplicate local image bytes in undo snapshots and restores them by asset id', () => {
    const project = createSeedProject()
    project.assets = [{ id: 'photo', name: 'photo.jpg', src: 'data:image/jpeg;base64,VERY_LARGE_IMAGE', provider: 'provided', sourceId: '', assetStage: 'original', usageScope: '', rightsStatus: 'unknown', qualityGrade: 'B', approval: 'pending', evidence: '', alt: '' }]

    const sources = collectAssetSources(project, {})
    const snapshot = historySnapshot(project)

    expect(snapshot.assets[0].src).toBe('')
    expect(restoreHistorySnapshot(snapshot, sources).assets[0].src).toBe('data:image/jpeg;base64,VERY_LARGE_IMAGE')
  })
})
