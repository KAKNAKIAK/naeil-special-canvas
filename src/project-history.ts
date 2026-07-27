import type { Project } from './types'

/**
 * Keeps undo/redo lightweight. Image data URLs can be tens of megabytes, so a
 * history entry retains the asset record and ID but never duplicates its bytes.
 */
export function historySnapshot(project: Project): Project {
  return JSON.parse(JSON.stringify({
    ...project,
    assets: project.assets.map(asset => ({ ...asset, src: '' })),
  })) as Project
}

/** Restores asset data from the in-session asset cache when an undo state is opened. */
export function restoreHistorySnapshot(snapshot: Project, assetSources: Record<string, string>): Project {
  const restored = JSON.parse(JSON.stringify(snapshot)) as Project
  restored.assets = restored.assets.map(asset => ({
    ...asset,
    src: asset.src || assetSources[asset.id] || '',
  }))
  return restored
}

/** Preserve every known image source once per session, without copying it into history entries. */
export function collectAssetSources(project: Project, current: Record<string, string>): Record<string, string> {
  const next = { ...current }
  project.assets.forEach(asset => {
    if (asset.src) next[asset.id] = asset.src
  })
  return next
}
