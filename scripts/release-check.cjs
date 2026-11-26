// Verify the Setup payload and launch the packaged app with isolated user data.
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { execFileSync, spawn } = require('node:child_process')
const { sendCommand } = require('../desktop/cli.cjs')

async function main() {
  const root = path.resolve(__dirname, '..')
  const version = require('../desktop/package.json').version
  const runtime = path.join(process.env.LOCALAPPDATA, 'NaeilSpecialCanvasDesktopBuild')
  const unpacked = path.join(runtime, 'release', 'win-unpacked')
  const setup = path.join(root, 'release', `naeil-special-canvas-Setup-${version}.exe`)
  const cache = path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache', '7zip@1.0.0')
  const sevenDir = (await fs.readdir(cache)).find(name => name.startsWith('7zip-win-x64-') && !name.endsWith('.state'))
  const seven = path.join(cache, sevenDir, 'bin', '7za.exe')
  const setupBytes = await fs.readFile(setup)
  const metadata = await fs.readFile(path.join(root, 'release', 'latest.yml'), 'utf8')
  const sha512 = createHash('sha512').update(setupBytes).digest('base64')
  const sha256 = createHash('sha256').update(setupBytes).digest('hex').toUpperCase()
  assert.ok(metadata.includes(`version: ${version}`) && metadata.includes(`path: ${path.basename(setup)}`))
  assert.ok(metadata.includes(`sha512: ${sha512}`))
  assert.ok((await fs.stat(`${setup}.blockmap`)).size > 0)
  const listing = execFileSync(seven, ['l', setup], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  assert.ok(listing.includes('resources\\cli\\cli.cjs'))
  assert.ok(listing.includes('resources\\skills\\naeil-special-canvas-writer\\SKILL.md'))
  const rootJson = listing.split('\n').filter(line => /resources\\skills\\naeil-special-canvas-writer\\[^\\]+\.json/.test(line))
  assert.ok(rootJson.every(line => line.includes('skill-manifest.json')), 'Product JSON must not ship')
  const packagedAsar = execFileSync(seven, ['e', '-so', setup, 'resources/app.asar'], { maxBuffer: 20 * 1024 * 1024 })
  assert.deepEqual(packagedAsar, await fs.readFile(path.join(unpacked, 'resources', 'app.asar')))
  const updateConfig = await fs.readFile(path.join(unpacked, 'resources', 'app-update.yml'), 'utf8')
  for (const expected of ['provider: github', 'owner: KAKNAKIAK', 'repo: naeil-special-canvas', 'releaseType: release']) assert.ok(updateConfig.includes(expected))

  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'naeil-release-smoke-'))
  const appData = path.join(profile, 'NaeilSpecialCanvas')
  const child = spawn(path.join(unpacked, '내일스패셜 메이킹 스튜디오.exe'), [`--user-data-dir=${appData}`], {
    env: { ...process.env, APPDATA: profile }, stdio: 'ignore', windowsHide: true,
  })
  try {
    let status
    const end = Date.now() + 25000
    while (Date.now() < end) {
      try {
        const connection = JSON.parse(await fs.readFile(path.join(appData, 'cli-connection.json'), 'utf8'))
        status = await sendCommand(connection, 'status')
        if (status.actions['project.refresh'] && status.actions['project.autoRefresh']) break
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    assert.ok(status?.actions['project.refresh'] && status?.actions['project.autoRefresh'], 'Packaged CLI actions unavailable')
    assert.ok(status.actions['asset.addGetty'], 'Packaged Getty action unavailable')
    const skillDir = path.join(appData, 'skills', 'naeil-special-canvas-writer')
    assert.equal(await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8'), await fs.readFile(path.join(unpacked, 'resources', 'skills', 'naeil-special-canvas-writer', 'SKILL.md'), 'utf8'))
    assert.equal(JSON.parse(await fs.readFile(path.join(skillDir, '.installed-by.json'), 'utf8')).appVersion, version)
    console.log(JSON.stringify({ version, sha256, setupPayload: 'verified', packagedLaunch: 'passed', skillSync: 'passed', profile }))
  } finally { child.kill() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
