import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectDir = resolve(scriptDir, '..')
const schemaDir = resolve(projectDir, 'schema')
const skillContractDir = resolve(projectDir, '..', '.agents', 'skills', 'naeil-special-canvas-writer', 'references', 'canvas-contract')
const contractFiles = ['project.schema.json', 'approved-brief.schema.json', 'schema-version.json', 'block-catalog.json']
const manifestFile = 'contract-manifest.json'

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch (error) { throw new Error(`${path}: JSON을 읽을 수 없습니다. ${error instanceof Error ? error.message : String(error)}`) }
}

async function sourceContracts() {
  const entries = await Promise.all(contractFiles.map(async file => [file, await readFile(resolve(schemaDir, file), 'utf8')]))
  const files = Object.fromEntries(entries)
  for (const [file, text] of Object.entries(files)) JSON.parse(text)
  const versions = JSON.parse(files['schema-version.json'])
  const catalog = JSON.parse(files['block-catalog.json'])
  if (!versions.schemaVersion || !versions.catalogVersion) throw new Error('schema-version.json에 schemaVersion과 catalogVersion이 필요합니다.')
  if (catalog.catalogVersion !== versions.catalogVersion) throw new Error('block-catalog.json의 catalogVersion이 schema-version.json과 다릅니다.')
  if (!Array.isArray(catalog.blocks) || !catalog.blocks.length) throw new Error('block-catalog.json에 blocks가 필요합니다.')
  const names = new Set()
  for (const block of catalog.blocks) {
    if (!block.type || names.has(block.type)) throw new Error('block-catalog.json의 block type은 비어 있거나 중복될 수 없습니다.')
    names.add(block.type)
  }
  return { files, versions, catalog }
}

function contractHash(files) {
  const source = contractFiles.map(file => `${file}\n${files[file].replace(/\r\n/g, '\n')}`).join('\n---\n')
  return createHash('sha256').update(source, 'utf8').digest('hex')
}

async function buildManifest() {
  const { files, versions } = await sourceContracts()
  return {
    canvasAppVersion: JSON.parse(await readFile(resolve(projectDir, 'package.json'), 'utf8')).version,
    schemaVersion: versions.schemaVersion,
    catalogVersion: versions.catalogVersion,
    contractHash: contractHash(files),
    contractFiles,
    syncedAt: new Date().toISOString(),
  }
}

async function writeSourceManifest(manifest) {
  await writeFile(resolve(schemaDir, manifestFile), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

async function sync() {
  const manifest = await buildManifest()
  await writeSourceManifest(manifest)
  const stage = `${skillContractDir}.staging-${randomUUID()}`
  await rm(stage, { recursive: true, force: true })
  await mkdir(stage, { recursive: true })
  for (const file of [...contractFiles, manifestFile]) await cp(resolve(schemaDir, file), resolve(stage, file))
  await rm(skillContractDir, { recursive: true, force: true })
  await mkdir(dirname(skillContractDir), { recursive: true })
  await rename(stage, skillContractDir)
  console.log(`계약 동기화 완료: ${manifest.schemaVersion} / ${manifest.contractHash}`)
}

async function check() {
  const expected = await buildManifest()
  const sourceManifest = await readJson(resolve(schemaDir, manifestFile))
  if (sourceManifest.contractHash !== expected.contractHash || sourceManifest.schemaVersion !== expected.schemaVersion || sourceManifest.catalogVersion !== expected.catalogVersion) throw new Error('앱 원본 계약 manifest가 최신이 아닙니다. npm run contract:sync를 실행하세요.')
  const targetManifest = await readJson(resolve(skillContractDir, manifestFile))
  if (targetManifest.contractHash !== expected.contractHash || targetManifest.schemaVersion !== expected.schemaVersion || targetManifest.catalogVersion !== expected.catalogVersion) throw new Error('Skill 계약 사본이 앱 원본과 다릅니다. npm run contract:sync를 실행하세요.')
  for (const file of contractFiles) {
    const source = await readFile(resolve(schemaDir, file), 'utf8')
    const target = await readFile(resolve(skillContractDir, file), 'utf8')
    if (source !== target) throw new Error(`Skill 계약 파일이 다릅니다: ${file}`)
  }
  console.log(`계약 검사 통과: ${expected.schemaVersion} / ${expected.contractHash}`)
}

const command = process.argv[2]
try {
  if (command === 'sync') await sync()
  else if (command === 'check') await check()
  else throw new Error('사용법: node scripts/contracts.mjs <sync|check>')
} catch (error) {
  console.error(`계약 처리 실패: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
