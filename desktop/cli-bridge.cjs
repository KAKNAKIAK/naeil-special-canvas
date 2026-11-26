const http = require('node:http')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomBytes, randomUUID, timingSafeEqual } = require('node:crypto')

const MAX_BODY = 50 * 1024 * 1024

function createRendererRelay(ipcMain, getWebContents, timeoutMs = 15_000) {
  const pending = new Map()
  const receive = (event, id, response) => {
    const request = pending.get(id)
    if (!request || event.sender !== request.sender) return
    clearTimeout(request.timer)
    pending.delete(id)
    if (response?.error) request.reject(new Error(String(response.error)))
    else request.resolve(response?.result)
  }
  ipcMain.on('naeil-special:cli-response', receive)
  return {
    request(command, payload) {
      const sender = getWebContents()
      if (!sender || sender.isDestroyed() || sender.isLoadingMainFrame()) {
        return Promise.reject(new Error('GUI is not ready. Open the canvas and retry.'))
      }
      return new Promise((resolve, reject) => {
        const id = randomUUID()
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error('GUI response timed out. Check the canvas before retrying a mutation.'))
        }, timeoutMs)
        pending.set(id, { sender, timer, resolve, reject })
        try {
          sender.send('naeil-special:cli-request', { id, command, payload })
        } catch (error) {
          clearTimeout(timer)
          pending.delete(id)
          reject(error)
        }
      })
    },
    close() {
      ipcMain.removeListener('naeil-special:cli-response', receive)
      for (const request of pending.values()) {
        clearTimeout(request.timer)
        request.reject(new Error('GUI closed.'))
      }
      pending.clear()
    },
  }
}

async function startCliBridge({ connectionPath, handleRequest }) {
  const token = randomBytes(32).toString('hex')
  const server = http.createServer(async (request, response) => {
    const reply = (status, data) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify(data))
    }
    const authorization = Buffer.from(request.headers.authorization || '')
    const expected = Buffer.from(`Bearer ${token}`)
    if (request.headers.origin || request.headers.host !== `127.0.0.1:${server.address().port}` ||
        authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) {
      reply(403, { ok: false, error: 'Unauthorized local CLI request.' })
      request.resume()
      return
    }
    if (request.method !== 'POST' || request.url !== '/command') {
      reply(404, { ok: false, error: 'Unknown CLI endpoint.' })
      request.resume()
      return
    }
    try {
      const chunks = []
      let size = 0
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        size += chunk.length
        if (size > MAX_BODY) {
          reply(413, { ok: false, error: 'CLI payload exceeds 50 MB.' })
          request.resume()
          return
        }
        chunks.push(chunk)
      }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (!input || !['status', 'get', 'dispatch'].includes(input.command)) {
        reply(400, { ok: false, error: 'Expected status, get, or dispatch command.' })
        return
      }
      const result = await handleRequest(input.command, input.payload)
      reply(200, { ok: true, result })
    } catch (error) {
      reply(error instanceof SyntaxError ? 400 : 422, { ok: false, error: error.message })
    }
  })
  server.requestTimeout = 20_000
  server.headersTimeout = 10_000
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const connection = { protocolVersion: 1, port: server.address().port, token, pid: process.pid }
  try {
    await fs.mkdir(path.dirname(connectionPath), { recursive: true })
    await fs.writeFile(connectionPath, JSON.stringify(connection), { encoding: 'utf8', mode: 0o600 })
  } catch (error) {
    server.close()
    throw error
  }
  return {
    async close() {
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
      try {
        const current = JSON.parse(await fs.readFile(connectionPath, 'utf8'))
        if (current.token === token) await fs.unlink(connectionPath)
      } catch (error) {
        if (error.code !== 'ENOENT') console.warn('[cli-bridge] Could not remove connection file.')
      }
    },
  }
}

module.exports = { createRendererRelay, startCliBridge }
