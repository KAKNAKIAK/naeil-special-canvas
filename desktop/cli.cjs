#!/usr/bin/env node
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')

const HELP = `Naeil Special Canvas CLI — live GUI connection

node desktop/cli.cjs status
node desktop/cli.cjs get
node desktop/cli.cjs dispatch --file command.json
node desktop/cli.cjs dispatch --file - < command.json
node desktop/cli.cjs dispatch --file export-command.json --out output.html

dispatch JSON: {"action":"project.rename","args":["Winter travel"],"expectedRevision":0}
Run the desktop GUI first. get returns the current project and revision.
status lists the available shared GUI actions. Mutations appear immediately in the GUI.
project.refresh args:[false] reloads the linked JSON; true explicitly discards local edits.
project.autoRefresh args:[true] enables external file detection (false disables it).
status.refresh reports lastAppliedAt, autoRefresh, linkedPath, busy and any error.
Use --connection FILE to connect to a separate app user-data directory.
Use dispatch --out FILE to write an export result as UTF-8 text, or the full JSON response.
`

function sendCommand(connection, command, payload) {
  if (connection.protocolVersion !== 1 || !Number.isInteger(connection.port) || connection.port < 1 ||
      connection.port > 65535 || typeof connection.token !== 'string' || !/^[a-f0-9]{64}$/.test(connection.token)) {
    return Promise.reject(new Error('Invalid CLI connection file. Restart the desktop app.'))
  }
  const body = JSON.stringify({ command, payload })
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1', port: connection.port, path: '/command', method: 'POST',
      headers: { Authorization: `Bearer ${connection.token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('error', reject)
      response.on('end', () => {
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          if (!result.ok) throw new Error(result.error || `CLI request failed (HTTP ${response.statusCode}).`)
          resolve(result.result)
        } catch (error) { reject(error) }
      })
    })
    const timeout = setTimeout(() => request.destroy(new Error('GUI request timed out. Inspect the canvas before retrying.')), 20_000)
    request.on('close', () => clearTimeout(timeout))
    request.on('error', error => reject(error.code === 'ECONNREFUSED'
      ? new Error('Desktop GUI is not running. Open the app and retry.') : error))
    request.end(body)
  })
}

async function main(args = process.argv.slice(2)) {
  const command = args.shift()
  if (!command || ['help', '--help', '-h'].includes(command)) { process.stdout.write(HELP); return }
  if (!['status', 'get', 'dispatch'].includes(command)) throw new Error('Unknown command. Run help for usage.')
  const options = {}
  while (args.length) {
    const option = args.shift()
    if (!['--file', '--connection', '--out'].includes(option) || !args.length || options[option]) throw new Error('Invalid CLI options. Run help for usage.')
    options[option] = args.shift()
  }
  if (command === 'dispatch' && !options['--file']) throw new Error('dispatch requires --file JSON_PATH (or --file - for stdin).')
  if (command !== 'dispatch' && options['--file']) throw new Error('--file is supported by dispatch only.')
  if (command !== 'dispatch' && options['--out']) throw new Error('--out is supported by dispatch only.')
  const appData = process.env.APPDATA || path.join(process.env.HOME || process.cwd(), '.config')
  const connectionPath = options['--connection'] || path.join(appData, 'NaeilSpecialCanvas', 'cli-connection.json')
  let connection
  try { connection = JSON.parse(await fs.readFile(connectionPath, 'utf8')) }
  catch { throw new Error('CLI connection is unavailable. Open the desktop GUI and retry.') }
  let payload
  if (command === 'dispatch') {
    let contents
    if (options['--file'] === '-') {
      const chunks = []
      for await (const chunk of process.stdin) chunks.push(chunk)
      contents = Buffer.concat(chunks).toString('utf8')
    } else contents = await fs.readFile(options['--file'], 'utf8')
    payload = JSON.parse(contents.replace(/^\uFEFF/, ''))
  }
  const result = await sendCommand(connection, command, payload)
  if (options['--out']) {
    const outputPath = path.resolve(options['--out'])
    const contents = typeof result?.result === 'string' ? result.result : JSON.stringify(result, null, 2)
    await fs.writeFile(outputPath, contents, 'utf8')
    process.stdout.write(`${JSON.stringify({ savedTo: outputPath })}\n`)
    return
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (require.main === module) main().catch(error => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})

module.exports = { sendCommand, main }
