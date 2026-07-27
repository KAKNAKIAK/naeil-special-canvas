const { app, BrowserWindow, shell, ipcMain, net, dialog } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('node:path')
const fs = require('node:fs/promises')

const APP_ID = 'kr.co.naeiltour.specialcanvas'
let isInstallingUpdate = false
let autoUpdaterConfigured = false
const isPrimaryInstance = app.requestSingleInstanceLock()

if (!isPrimaryInstance) app.quit()

app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows()[0]
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
})

/**
 * Mirrors the skill bundled with this app to an app-owned user-data folder.
 * This deliberately never writes to the user's shared .agents/.codex folders.
 */
async function syncBundledSkill() {
  if (!app.isPackaged) return
  const skillName = 'naeil-special-canvas-writer'
  const source = path.join(process.resourcesPath, 'skills', skillName)
  const target = path.join(app.getPath('userData'), 'skills', skillName)
  const staging = `${target}.staging`
  try {
    await fs.access(path.join(source, 'SKILL.md'))
    await fs.rm(staging, { recursive: true, force: true })
    await fs.mkdir(path.dirname(staging), { recursive: true })
    await fs.cp(source, staging, { recursive: true, force: true })
    await fs.writeFile(path.join(staging, '.installed-by.json'), JSON.stringify({
      app: app.getName(),
      appVersion: app.getVersion(),
      syncedAt: new Date().toISOString(),
    }, null, 2), 'utf8')
    await fs.rm(target, { recursive: true, force: true })
    await fs.rename(staging, target)
    console.info(`[skill-sync] ${skillName} updated at ${target}`)
  } catch (error) {
    // A skill mirror must not prevent the canvas itself from launching.
    console.warn('[skill-sync]', error.message)
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {})
  }
}

function configureAutoUpdater(window) {
  if (!app.isPackaged || autoUpdaterConfigured) return
  autoUpdaterConfigured = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('error', error => {
    // 업데이트 확인 실패는 네트워크 단절 등 일반적인 상황에서도 발생하므로 작업을 방해하지 않는다.
    console.warn('[auto-update]', error.message)
  })
  autoUpdater.on('update-downloaded', info => {
    const answer = dialog.showMessageBoxSync(window, {
      type: 'info',
      title: '업데이트 준비 완료',
      message: `새 버전 ${info.version}이 다운로드되었습니다.`,
      detail: '지금 재시작하면 업데이트가 설치됩니다. 나중에를 선택하면 다음 앱 종료 시 설치됩니다.',
      buttons: ['지금 재시작', '나중에'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })
    if (answer === 0) {
      isInstallingUpdate = true
      setImmediate(() => autoUpdater.quitAndInstall())
    }
  })
  autoUpdater.checkForUpdates().catch(error => console.warn('[auto-update]', error.message))
}

app.setAppUserModelId(APP_ID)
app.setPath('userData', path.join(app.getPath('appData'), 'NaeilSpecialCanvas'))

ipcMain.handle('naeil-special:save-project-file', async (event, payload = {}) => {
  const owner = BrowserWindow.fromWebContents(event.sender)
  const contents = typeof payload.contents === 'string' ? payload.contents : ''
  if (!contents) throw new Error('저장할 프로젝트 내용이 없습니다.')
  const fallbackName = String(payload.filename || 'naeil-special.json').replace(/[\\/:*?"<>|]/g, '-')
  let filePath = typeof payload.path === 'string' && payload.path ? payload.path : ''
  if (!filePath) {
    const result = await dialog.showSaveDialog(owner, {
      title: '내일스패셜 기획안 저장',
      defaultPath: fallbackName.endsWith('.json') ? fallbackName : `${fallbackName}.json`,
      filters: [{ name: '내일스패셜 프로젝트 JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    filePath = result.filePath
  }
  if (path.extname(filePath).toLowerCase() !== '.json') filePath += '.json'
  await fs.writeFile(filePath, contents, 'utf8')
  return { canceled: false, path: filePath }
})

ipcMain.on('naeil-special:request-close', event => {
  const owner = BrowserWindow.fromWebContents(event.sender)
  owner?.close()
})

function createWindow() {
  let allowClose = false
  let waitingForSave = false
  let saveTimeout
  const window = new BrowserWindow({
    title: '내일스패셜 메이킹 스튜디오',
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: '#eef1f2',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: true,
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault()
  })

  let rendererRecoveryOpen = false
  const recoverRenderer = detail => {
    if (rendererRecoveryOpen || window.isDestroyed() || isInstallingUpdate) return
    rendererRecoveryOpen = true
    const answer = dialog.showMessageBoxSync(window, {
      type: 'error',
      title: '캔버스 화면을 다시 열어야 합니다',
      message: '작업 화면이 예기치 않게 중단되었습니다.',
      detail: `${detail}\n파일 메뉴로 저장한 JSON은 유지됩니다. 다시 열기를 누르면 현재 창을 복구합니다.`,
      buttons: ['다시 열기', '종료'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })
    if (answer === 0) {
      rendererRecoveryOpen = false
      window.webContents.reloadIgnoringCache()
      return
    }
    allowClose = true
    window.close()
  }
  window.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') recoverRenderer(`중단 사유: ${details.reason}`)
  })
  window.webContents.on('did-fail-load', (_event, _code, description, _url, isMainFrame) => {
    if (isMainFrame) recoverRenderer(`화면을 불러오지 못했습니다: ${description}`)
  })

  window.once('ready-to-show', () => {
    window.show()
    configureAutoUpdater(window)
  })
  const finishClose = () => {
    clearTimeout(saveTimeout)
    waitingForSave = false
    allowClose = true
    window.close()
  }
  const saveBeforeCloseComplete = (event, saved) => {
    if (!waitingForSave || event.sender !== window.webContents) return
    if (saved) finishClose()
    else waitingForSave = false
  }
  ipcMain.on('naeil-special:save-before-close-complete', saveBeforeCloseComplete)
  window.on('close', event => {
    if (allowClose || waitingForSave || isInstallingUpdate) return
    event.preventDefault()
    const answer = dialog.showMessageBoxSync(window, {
      type: 'question',
      title: '작업 저장',
      message: '현재 작업을 저장하고 종료할까요?',
      detail: '저장은 연결된 JSON 파일에 덮어쓰며, 처음 저장하거나 다른 이름으로 저장하면 위치를 선택합니다.',
      buttons: ['저장 후 종료', '다른 이름으로 저장 후 종료', '저장하지 않고 종료', '취소'],
      defaultId: 0,
      cancelId: 3,
      noLink: true,
    })
    if (answer === 3) return
    if (answer === 2) { allowClose = true; window.close(); return }
    waitingForSave = true
    window.webContents.send('naeil-special:save-before-close', answer === 1 ? 'save-as' : 'save')
  })
  window.on('closed', () => {
    clearTimeout(saveTimeout)
    ipcMain.removeListener('naeil-special:save-before-close-complete', saveBeforeCloseComplete)
  })
  window.loadFile(path.join(__dirname, 'dist', 'index.html'))
}

if (isPrimaryInstance) {
  app.whenReady().then(async () => {
    await syncBundledSkill()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

ipcMain.handle('naeil-special:download-image', async (_event, rawUrl) => {
  let url
  try {
    url = new URL(rawUrl)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('지원하지 않는 URL입니다.')
  } catch {
    throw new Error('http 또는 https 이미지 URL만 받을 수 있습니다.')
  }
  const response = await net.fetch(url.href, { headers: { 'User-Agent': app.userAgentFallback } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > 30 * 1024 * 1024) throw new Error('이미지 파일이 30MB를 초과합니다.')
  return { bytes, contentType: response.headers.get('content-type') || 'application/octet-stream' }
})

app.on('window-all-closed', () => app.quit())
