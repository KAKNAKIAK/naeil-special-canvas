const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { EventEmitter } = require('node:events')
const { execFile, spawn } = require('node:child_process')
const { promisify } = require('node:util')
const { startCliBridge, createRendererRelay } = require('./cli-bridge.cjs')
const { sendCommand } = require('./cli.cjs')

test('CLI reaches live state, preserves renderer errors, and cleans up discovery', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'naeil-cli-'))
  const connectionPath = path.join(directory, 'cli-connection.json')
  let name = 'Initial'
  const bridge = await startCliBridge({ connectionPath, handleRequest: async (command, payload) => {
    if (command === 'dispatch') {
      if (payload.action === 'export.html') return { revision: 1, result: '<!doctype html><title>Canvas export</title>' }
      if (payload.action !== 'project.rename') throw new Error('Unsupported action')
      name = payload.args[0]
    }
    return { name }
  } })
  try {
    const connection = JSON.parse(await fs.readFile(connectionPath, 'utf8'))
    assert.deepEqual(await sendCommand(connection, 'status'), { name: 'Initial' })
    assert.deepEqual(await sendCommand(connection, 'dispatch', { action: 'project.rename', args: ['Winter'] }), { name: 'Winter' })
    assert.deepEqual(await sendCommand(connection, 'get'), { name: 'Winter' })
    await assert.rejects(sendCommand(connection, 'dispatch', { action: 'eval' }), /Unsupported action/)
    const commandPath = path.join(directory, 'command.json')
    await fs.writeFile(commandPath, '\uFEFF' + JSON.stringify({ action: 'project.rename', args: ['CLI file'] }))
    const run = promisify(execFile)
    const result = await run(process.execPath, [path.join(__dirname, 'cli.cjs'), 'dispatch', '--file', commandPath, '--connection', connectionPath])
    assert.deepEqual(JSON.parse(result.stdout), { name: 'CLI file' })
    assert.equal(result.stderr, '')
    const stdinResult = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(__dirname, 'cli.cjs'), 'dispatch', '--file', '-', '--connection', connectionPath])
      let output = ''
      child.stdout.on('data', chunk => { output += chunk })
      child.on('error', reject)
      child.on('exit', code => code === 0 ? resolve(output) : reject(new Error(`CLI exited ${code}`)))
      child.stdin.end(JSON.stringify({ action: 'project.rename', args: ['CLI stdin'] }))
    })
    assert.deepEqual(JSON.parse(stdinResult), { name: 'CLI stdin' })
    const outputPath = path.join(directory, 'export.html')
    await fs.writeFile(commandPath, JSON.stringify({ action: 'export.html', args: [] }))
    const exported = await run(process.execPath, [path.join(__dirname, 'cli.cjs'), 'dispatch', '--file', commandPath, '--connection', connectionPath, '--out', outputPath])
    assert.deepEqual(JSON.parse(exported.stdout), { savedTo: outputPath })
    assert.equal(await fs.readFile(outputPath, 'utf8'), '<!doctype html><title>Canvas export</title>')
    await fs.writeFile(commandPath, JSON.stringify({ action: 'project.rename', args: ['JSON output'] }))
    await run(process.execPath, [path.join(__dirname, 'cli.cjs'), 'dispatch', '--file', commandPath, '--connection', connectionPath, '--out', outputPath])
    assert.deepEqual(JSON.parse(await fs.readFile(outputPath, 'utf8')), { name: 'JSON output' })
  } finally {
    await bridge.close()
    await assert.rejects(fs.access(connectionPath), { code: 'ENOENT' })
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('bridge rejects browser origins, missing credentials, unknown commands and malformed JSON', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'naeil-cli-'))
  const connectionPath = path.join(directory, 'connection.json')
  let calls = 0
  const bridge = await startCliBridge({ connectionPath, handleRequest: async () => { calls += 1 } })
  try {
    const connection = JSON.parse(await fs.readFile(connectionPath, 'utf8'))
    const request = (body, headers = {}) => new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: connection.port, method: 'POST', path: '/command', headers }, response => {
        response.resume()
        response.on('end', () => resolve(response.statusCode))
      })
      req.on('error', reject)
      req.end(body)
    })
    const auth = { Authorization: `Bearer ${connection.token}` }
    assert.equal(await request('{"command":"status"}'), 403)
    assert.equal(await request('{"command":"status"}', { ...auth, Origin: 'https://example.com' }), 403)
    assert.equal(await request('{"command":"status"}', { ...auth, Host: 'example.com' }), 403)
    assert.equal(await request('{"command":"eval"}', auth), 400)
    assert.equal(await request('{', auth), 400)
    assert.equal(calls, 0)
  } finally {
    await bridge.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('renderer relay accepts only the correct sender and times out or closes pending requests', async () => {
  const ipc = new EventEmitter()
  let lastRequest
  const sender = { isDestroyed: () => false, isLoadingMainFrame: () => false, send: (_channel, request) => { lastRequest = request } }
  const relay = createRendererRelay(ipc, () => sender, 30)
  const pending = relay.request('get')
  ipc.emit('naeil-special:cli-response', { sender: {} }, lastRequest.id, { result: 'spoofed' })
  ipc.emit('naeil-special:cli-response', { sender }, lastRequest.id, { result: 'live' })
  assert.equal(await pending, 'live')
  await assert.rejects(relay.request('get'), /timed out/)
  const closing = relay.request('get')
  relay.close()
  await assert.rejects(closing, /GUI closed/)
  assert.equal(ipc.listenerCount('naeil-special:cli-response'), 0)
})

test('bridge rejects oversized streaming bodies before calling the renderer', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'naeil-cli-'))
  const connectionPath = path.join(directory, 'connection.json')
  const bridge = await startCliBridge({ connectionPath, handleRequest: async () => assert.fail('Oversized body reached GUI') })
  try {
    const connection = JSON.parse(await fs.readFile(connectionPath, 'utf8'))
    const status = await new Promise((resolve, reject) => {
      const request = http.request({ hostname: '127.0.0.1', port: connection.port, method: 'POST', path: '/command',
        headers: { Authorization: `Bearer ${connection.token}` } }, response => {
        response.resume()
        response.on('end', () => resolve(response.statusCode))
      })
      request.on('error', reject)
      request.end(Buffer.alloc(50 * 1024 * 1024 + 1, ' '))
    })
    assert.equal(status, 413)
  } finally {
    await bridge.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
})
