import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = fileURLToPath(new URL('.', import.meta.url))
const projectDir = resolve(scriptDir, '..')
const appVersionPath = resolve(projectDir, 'src', 'app-version.ts')
const rootPackagePath = resolve(projectDir, 'package.json')
const desktopPackagePath = resolve(projectDir, 'desktop', 'package.json')
const mode = process.argv[2] || 'check'

const [rootPackage, desktopPackage, appVersionSource] = await Promise.all([
  readFile(rootPackagePath, 'utf8').then(JSON.parse),
  readFile(desktopPackagePath, 'utf8').then(JSON.parse),
  readFile(appVersionPath, 'utf8'),
])

if (rootPackage.version !== desktopPackage.version) {
  throw new Error(`버전 불일치: package.json(${rootPackage.version}) / desktop/package.json(${desktopPackage.version})`)
}

const appVersion = appVersionSource.match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1]
if (mode === 'sync') {
  if (appVersion !== rootPackage.version) {
    await writeFile(appVersionPath, `// Keep this in sync with package.json and desktop/package.json when releasing.\n// The standalone runtime copies only src/, so importing package.json would show\n// the runtime package version instead of the shipped app version.\nexport const APP_VERSION = '${rootPackage.version}'\n`, 'utf8')
    console.log(`화면 버전 동기화: ${appVersion || '없음'} → ${rootPackage.version}`)
  } else console.log(`버전 일치: ${rootPackage.version}`)
} else {
  if (appVersion !== rootPackage.version) throw new Error(`버전 불일치: src/app-version.ts(${appVersion || '없음'}) / package.json(${rootPackage.version})`)
  console.log(`버전 검사 통과: ${rootPackage.version}`)
}
