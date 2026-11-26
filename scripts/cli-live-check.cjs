// Run with Electron after building the web app. Uses an isolated temporary workspace.
const { app, BrowserWindow, dialog } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { sendCommand } = require('../desktop/cli.cjs')

const testRoot = path.join(os.tmpdir(), `naeil-canvas-cli-check-${process.pid}`)
app.setPath('appData', testRoot)
app.setPath('userData', path.join(testRoot, 'NaeilSpecialCanvas'))
const watchdog = setTimeout(() => { console.error('LIVE CHECK TIMEOUT'); app.exit(1) }, 60_000)
const linkedFile = path.join(testRoot, 'linked-project.json')
dialog.showSaveDialog = async () => ({ canceled: false, filePath: linkedFile })
let window
app.on('browser-window-created', (_event, created) => { window = created })
require('../desktop/main.cjs')

async function waitFor(check) {
  const end = Date.now() + 12_000
  while (Date.now() < end) {
    try { const result = await check(); if (result) return result } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('Expected GUI state did not appear')
}

app.whenReady().then(async () => {
  const connectionPath = path.join(testRoot, 'NaeilSpecialCanvas', 'cli-connection.json')
  const connection = await waitFor(async () => JSON.parse(await fs.readFile(connectionPath, 'utf8')))
  const get = () => sendCommand(connection, 'get')
  const dispatch = (action, args = [], expectedRevision) => sendCommand(connection, 'dispatch', { action, args, expectedRevision })
  const writeExternal = async name => {
    const project = JSON.parse(await fs.readFile(linkedFile, 'utf8'))
    project.name = name
    project.page.title = name
    await fs.writeFile(linkedFile, JSON.stringify(project), 'utf8')
    return project
  }
  await waitFor(async () => (await get()).project)
  const evaluate = expression => window.webContents.executeJavaScript(expression)
  await evaluate('localStorage.setItem("naeil-special-canvas:onboarding-v1", "done")')
  await evaluate('document.querySelector(".onboarding-hide")?.click()')
  for (let presetIndex = 0; presetIndex < 4; presetIndex++) {
    await evaluate(`document.querySelectorAll('.template-preset-card')[${presetIndex}].click()`)
    const preset = await get()
    assert.ok(preset.project.sections.length > 0)
    assert.equal(preset.project.assets.length, 0)
    assert.ok(preset.project.sections.every(section => section.mediaIds.every(id => !id)))
    const loaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve))
    window.webContents.reload()
    await loaded
    await waitFor(async () => (await get()).project.sections.length === 0)
  }
  await dispatch('project.rename', ['CLI live title'])
  assert.equal(await evaluate('document.querySelector(".project-title input").value'), 'CLI live title')
  await dispatch('section.add', ['text'])
  let state = await get()
  const id = state.project.sections[0].id
  await dispatch('section.update', [id, { title: 'Live block', body: 'CLI to GUI' }], state.revision)
  assert.ok(await evaluate('document.querySelector(".artboard").textContent.includes("CLI to GUI")'))
  await dispatch('history.undo')
  assert.notEqual((await get()).project.sections[0].body, 'CLI to GUI')
  await dispatch('history.redo')
  assert.equal((await get()).project.sections[0].body, 'CLI to GUI')
  await evaluate(`(() => {
    const input = document.querySelector('.project-title input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'GUI edited title');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  state = await get()
  assert.equal(state.project.name, 'GUI edited title')
  const results = await Promise.allSettled([
    dispatch('project.rename', ['Concurrent A'], state.revision),
    dispatch('project.rename', ['Concurrent B'], state.revision),
  ])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.match(results.find(result => result.status === 'rejected').reason.message, /REVISION_CONFLICT/)
  const before = await get()
  await assert.rejects(dispatch('section.update', [id, { items: [42] }]))
  assert.equal((await get()).revision, before.revision)
  const html = await dispatch('export.html')
  assert.match(html.result, /CLI to GUI/)
  const finalName = (await get()).project.name
  await waitFor(() => evaluate(`new Promise((resolve, reject) => {
    const request = indexedDB.open('keyval-store');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction('keyval').objectStore('keyval').get('naeil-special-canvas:workspace:v2');
      read.onsuccess = () => { resolve(read.result?.projects?.some(project => project.name === ${JSON.stringify(finalName)})); db.close(); };
      read.onerror = () => { reject(read.error); db.close(); };
    };
  })`))
  // Exercise the real file IPC using a test-only save-dialog destination.
  await dispatch('project.save')
  assert.equal((await get()).refresh.linkedPath, linkedFile)
  await dispatch('project.autoRefresh', [false])
  await writeExternal('Manual CLI refresh')
  await dispatch('project.refresh', [false])
  assert.equal((await get()).project.name, 'Manual CLI refresh')
  assert.ok((await get()).refresh.lastAppliedAt)
  assert.match(await evaluate('document.querySelector(".refresh-status").textContent'), /\d{2}(?:시 |:)\d{2}(?:분 |:)\d{2}/)
  await writeExternal('Manual GUI refresh')
  await evaluate(`document.querySelector('[aria-label="연결 JSON 새로고침"]').click()`)
  await waitFor(async () => (await get()).project.name === 'Manual GUI refresh')
  assert.equal(await evaluate('document.querySelector(".project-title input").value'), 'Manual GUI refresh')

  await dispatch('project.autoRefresh', [true])
  await writeExternal('Automatic file refresh')
  await waitFor(async () => (await get()).project.name === 'Automatic file refresh')
  assert.equal(await evaluate('document.querySelector(".project-title input").value'), 'Automatic file refresh')
  const validContents = await fs.readFile(linkedFile, 'utf8')
  await fs.writeFile(linkedFile, '{"incomplete":', 'utf8')
  await waitFor(async () => (await get()).refresh.error)
  assert.equal((await get()).project.name, 'Automatic file refresh')
  assert.equal(await fs.readFile(linkedFile, 'utf8'), '{"incomplete":')
  await fs.writeFile(linkedFile, validContents, 'utf8')
  await dispatch('project.refresh', [false])
  await dispatch('project.autoRefresh', [false])
  const validProject = JSON.parse(validContents)
  for (const invalid of [
    { ...validProject, id: 'different-project' },
    { ...validProject, schemaVersion: '999.0.0' },
    { ...validProject, sections: [null] },
    { ...validProject, name: { invalid: true } },
  ]) {
    await fs.writeFile(linkedFile, JSON.stringify(invalid), 'utf8')
    await assert.rejects(dispatch('project.refresh', [false]))
    assert.equal((await get()).project.name, 'Automatic file refresh')
  }
  await fs.writeFile(linkedFile, validContents, 'utf8')
  await dispatch('project.refresh', [false])

  // A local edit and an external edit must both survive until the user resolves them.
  await dispatch('project.autoRefresh', [false])
  await dispatch('project.rename', ['Unsaved GUI content'])
  await writeExternal('External conflicting content')
  await dispatch('project.autoRefresh', [true])
  await waitFor(async () => (await get()).refresh.error)
  await new Promise(resolve => setTimeout(resolve, 1400))
  await dispatch('project.autoRefresh', [false])
  await assert.rejects(dispatch('project.refresh', [false]), /LOCAL_CHANGES/)
  assert.equal((await get()).project.name, 'Unsaved GUI content')
  assert.equal(JSON.parse(await fs.readFile(linkedFile, 'utf8')).name, 'External conflicting content')
  await evaluate(`window.confirm = () => false; document.querySelector('[aria-label="연결 JSON 새로고침"]').click()`)
  assert.equal((await get()).project.name, 'Unsaved GUI content')
  await evaluate(`window.confirm = () => true; document.querySelector('[aria-label="연결 JSON 새로고침"]').click()`)
  await waitFor(async () => (await get()).project.name === 'External conflicting content')
  await dispatch('history.undo')
  assert.equal((await get()).project.name, 'Unsaved GUI content')
  await dispatch('project.refresh', [true])

  await fs.rename(linkedFile, `${linkedFile}.previous`)
  await dispatch('project.autoRefresh', [true])
  await waitFor(async () => (await get()).refresh.error)
  assert.equal((await get()).project.name, 'External conflicting content')
  await fs.writeFile(linkedFile, validContents, 'utf8')
  await writeExternal('Replaced file detected')
  await waitFor(async () => (await get()).project.name === 'Replaced file detected')
  await dispatch('project.rename', ['GUI autosave after refresh'])
  await waitFor(async () => JSON.parse(await fs.readFile(linkedFile, 'utf8')).name === 'GUI autosave after refresh')
  const savedRevision = (await get()).revision
  await new Promise(resolve => setTimeout(resolve, 2200))
  assert.equal((await get()).revision, savedRevision, 'Own writes must not create a refresh loop')
  await evaluate(`document.querySelector('[aria-label="외부 JSON 자동 감지"]').click()`)
  assert.equal((await get()).refresh.autoRefresh, false)
  await evaluate(`document.querySelector('[aria-label="외부 JSON 자동 감지"]').click()`)
  assert.equal((await get()).refresh.autoRefresh, true)
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  const png = await window.webContents.capturePage()
  const screenshot = path.join(testRoot, 'live-gui.png')
  await fs.writeFile(screenshot, png.toPNG())
  console.log(JSON.stringify({ passed: ['GUI presets without default images', 'CLI to GUI', 'GUI to CLI', 'undo/redo', 'concurrent revision conflict', 'invalid input atomicity', 'HTML export', 'IndexedDB autosave', 'CLI file refresh and timestamp', 'GUI file refresh', 'automatic external refresh', 'invalid JSON preservation', 'local/external conflict and cancel', 'confirmed refresh and undo', 'deleted/replaced file recovery', 'autosave without refresh loop'], screenshot }))
}).then(() => {
  clearTimeout(watchdog)
  // Exit the test process without triggering the interactive save dialog.
  app.exit(0)
}).catch(error => {
  console.error(error)
  clearTimeout(watchdog)
  app.exit(1)
})
