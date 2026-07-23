import type { MigrationLogEntry, Project } from '../types'

export const CURRENT_SCHEMA_VERSION = '2.1.0' as const
export const CURRENT_CATALOG_VERSION = '1.0.0'

export interface MigrationResult {
  project: Project
  migrated: boolean
  sourceSchemaVersion: string
  backup?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
type MutableProject = Record<string, unknown>
type Migration = { to: string; run: (project: MutableProject) => string[] }

/** Add every future schema change here; migration always walks one version at a time. */
export const migrationRegistry: Record<string, Migration> = {
  unversioned: {
    to: '2.0',
    run: project => { project.schemaVersion = '2.0'; return ['무버전 Project에 schemaVersion 2.0 부여'] },
  },
  '2.0': {
    to: '2.0.0',
    run: project => { project.schemaVersion = '2.0.0'; return ['schemaVersion 2.0 → 2.0.0'] },
  },
  '2.0.0': {
    to: CURRENT_SCHEMA_VERSION,
    run: project => { project.schemaVersion = CURRENT_SCHEMA_VERSION; return [`schemaVersion 2.0.0 → ${CURRENT_SCHEMA_VERSION} (brief workspace 추가)`] },
  },
}

/** True for the application's raw load JSON, including pre-versioned saved projects. */
export function isDirectProjectPayload(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
    && Array.isArray(value.sections)
    && (Array.isArray(value.assets) || 'schemaVersion' in value || 'page' in value || 'campaign' in value)
}

function sourceVersion(value: Record<string, unknown>): string {
  const version = value.schemaVersion
  return typeof version === 'string' && version.trim() ? version.trim() : 'unversioned'
}

function appendLog(project: Record<string, unknown>, from: string, changes: string[]) {
  const entries = Array.isArray(project.migrationLog) ? project.migrationLog as MigrationLogEntry[] : []
  const entry: MigrationLogEntry = { id: crypto.randomUUID(), migratedAt: new Date().toISOString(), from, to: CURRENT_SCHEMA_VERSION, changes }
  project.migrationLog = [...entries, entry]
}

/**
 * Convert only known legacy root versions. The function clones its input so the
 * caller can store the original object as a migration backup before saving.
 */
export function migrateProject(input: unknown): MigrationResult {
  if (!isDirectProjectPayload(input)) throw new Error('캔버스 Project JSON 구조가 아닙니다.')
  const backup = clone(input)
  const project = clone(input)
  const from = sourceVersion(project)

  const changes: string[] = []
  let version = from
  while (version !== CURRENT_SCHEMA_VERSION) {
    const migration = migrationRegistry[version]
    if (!migration) throw new Error(`지원하지 않는 Project schemaVersion입니다: ${version}`)
    changes.push(...migration.run(project))
    version = migration.to
  }
  if (project.catalogVersion !== CURRENT_CATALOG_VERSION) {
    project.catalogVersion = CURRENT_CATALOG_VERSION
    changes.push(`catalogVersion → ${CURRENT_CATALOG_VERSION}`)
  }
  if (!Array.isArray(project.migrationLog)) {
    project.migrationLog = []
    if (from !== CURRENT_SCHEMA_VERSION) changes.push('migrationLog 초기화')
  }
  if (changes.length) appendLog(project, from, changes)

  return { project: project as unknown as Project, migrated: changes.length > 0, sourceSchemaVersion: from, backup: changes.length ? backup : undefined }
}
