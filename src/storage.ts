import { del, get, set } from 'idb-keyval'
import type { Project } from './types'
import { normalizeProject } from './catalog'
import { migrateProject, type MigrationResult } from './migrations'

const LEGACY_KEY = 'naeil-special-canvas:project:v1'
const WORKSPACE_KEY = 'naeil-special-canvas:workspace:v2'
const MIGRATION_BACKUP_KEY = 'naeil-special-canvas:migration-backups:v1'
export interface WorkspaceState { activeId: string; projects: Project[]; projectFiles?: Record<string, string> }
export interface MigrationBackup { id: string; projectId: string; migratedAt: string; sourceSchemaVersion: string; project: unknown }

/** Chromium's IndexedDB can occasionally stall instead of rejecting. Never let it hold the editor loading screen forever. */
export function loadWorkspaceWithTimeout(timeoutMs = 3500): Promise<WorkspaceState | undefined> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('WORKSPACE_LOAD_TIMEOUT')), timeoutMs)
    loadWorkspace().then(value => {
      window.clearTimeout(timer)
      resolve(value)
    }).catch(error => {
      window.clearTimeout(timer)
      reject(error)
    })
  })
}

export async function saveMigrationBackup(result: MigrationResult): Promise<void> {
  if (!result.migrated || !result.backup) return
  const backups = await get<MigrationBackup[]>(MIGRATION_BACKUP_KEY) || []
  const next: MigrationBackup = { id: crypto.randomUUID(), projectId: result.project.id || 'unknown', migratedAt: new Date().toISOString(), sourceSchemaVersion: result.sourceSchemaVersion, project: result.backup }
  await set(MIGRATION_BACKUP_KEY, [...backups.slice(-19), next])
}

export async function loadWorkspace(): Promise<WorkspaceState | undefined> {
  const workspace = await get<WorkspaceState>(WORKSPACE_KEY)
  if (workspace?.projects?.length) {
    const results = workspace.projects.map(project => migrateProject(project))
    await Promise.all(results.map(saveMigrationBackup))
    return { activeId: workspace.activeId, projects: results.map(result => normalizeProject(result.project)), projectFiles: workspace.projectFiles || {} }
  }
  const legacy = await get<Project>(LEGACY_KEY)
  if (!legacy) return undefined
  const result = migrateProject(legacy)
  await saveMigrationBackup(result)
  const project = normalizeProject(result.project)
  const migrated = { activeId: project.id, projects: [project] }
  await set(WORKSPACE_KEY, migrated); await del(LEGACY_KEY)
  return migrated
}
export async function saveWorkspace(workspace: WorkspaceState): Promise<void> { await set(WORKSPACE_KEY, workspace) }
