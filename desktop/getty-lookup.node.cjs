const test = require('node:test')
const assert = require('node:assert/strict')
const { lookupGettyContent, searchUrl } = require('./getty-lookup.cjs')

const contentId = '475042204'
const searchHtml = `<a class="w_photo" href="/view/entrance-to-am-phu-cave-with-bridge-and-statues-danang/${contentId}"><img class="imgThumb" id="${contentId}"></a>`
const detailHtml = [
  '<meta property="og:description" content="Entrance to Am Phu Cave with bridge and statues Danang">',
  `<meta property="og:url" content="https://www.gettyimagesbank.com/view/entrance-to-am-phu-cave-with-bridge-and-statues-danang/${contentId}">`,
  `<meta property="og:image" content="https://preview.gettyimagesbank.com/1/2015/05/42/204/${contentId}.jpg?s=1024">`,
].join('\n')

test('finds an exact public Getty result and reads its detail metadata', async () => {
  const result = await lookupGettyContent(contentId, async url => url === searchUrl(contentId) ? searchHtml : detailHtml)
  assert.deepEqual(result, {
    contentId,
    title: 'Entrance to Am Phu Cave with bridge and statues Danang',
    pageUrl: `https://www.gettyimagesbank.com/view/entrance-to-am-phu-cave-with-bridge-and-statues-danang/${contentId}`,
    thumbUrl: `https://preview.gettyimagesbank.com/1/2015/05/42/204/${contentId}.jpg?s=1024`,
    status: 'found',
    errorMessage: '',
  })
})

test('separates an absent ID as not_found', async () => {
  const result = await lookupGettyContent('999999999999999', async () => '<main>검색 결과 없음</main>')
  assert.equal(result.status, 'not_found')
  assert.equal(result.pageUrl, '')
})

test('rejects punctuation in content IDs before requesting Getty', async () => {
  const result = await lookupGettyContent('4750-42204', async () => { throw new Error('should not request') })
  assert.equal(result.status, 'error')
  assert.match(result.errorMessage, /영문과 숫자/)
})

test('finds alphanumeric codes and verifies the exact detail code', async () => {
  const id = 'AbC123xy'
  const link = `https://www.gettyimagesbank.com/view/photo/${id}`
  const result = await lookupGettyContent(id, async url => url === searchUrl(id)
    ? `<a href="/view/photo/${id}9">other</a><a href="${link}">match</a>`
    : `<meta property="og:url" content="${link}"><meta property="og:image" content="https://preview.gettyimagesbank.com/${id}.jpg">`)
  assert.equal(result.status, 'found')
  assert.equal(result.contentId, id)
  assert.equal(result.pageUrl, link)
  const mismatch = await lookupGettyContent(id, async url => url === searchUrl(id)
    ? `<a href="${link}">match</a>` : `<meta property="og:url" content="${link}9">`)
  assert.equal(mismatch.status, 'error')
})
