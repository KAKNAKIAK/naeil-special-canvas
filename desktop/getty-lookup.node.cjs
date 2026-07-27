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

test('rejects non-numeric content IDs before requesting Getty', async () => {
  const result = await lookupGettyContent('4750-42204', async () => { throw new Error('should not request') })
  assert.equal(result.status, 'error')
  assert.match(result.errorMessage, /숫자만/)
})
