import JSZip from 'jszip'
import YAML from 'yaml'
import { toPng } from 'html-to-image'
import type { MediaAsset, Project, Section } from './types'
import { normalizeLayoutBoxes, SECTION_LABELS } from './catalog'
import { normalizeCustomLayout } from './image-layout'
import { splitPair, splitTimeline } from './preset-item-format'
import { runQa } from './qa'
import { isRichTextEmpty, sanitizeRichText } from './rich-text'

declare global {
  interface Window {
    naeilSpecialDesktop?: {
      downloadImage: (url: string) => Promise<{ bytes: ArrayBuffer; contentType: string }>
      lookupGettyContent: (contentId: string) => Promise<{ contentId: string; title: string; pageUrl: string; thumbUrl: string; status: 'found' | 'not_found' | 'error'; errorMessage: string }>
      saveProjectFile: (payload: { contents: string; filename: string; path?: string }) => Promise<{ canceled: boolean; path?: string }>
      getFilePath?: (file: File) => string
      requestClose: () => void
      onSaveBeforeClose: (callback: (mode: 'save' | 'save-as') => void) => () => void
      completeSaveBeforeClose: (saved: boolean) => void
    }
  }
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function downloadText(text: string, filename: string, type = 'text/plain;charset=utf-8') { download(new Blob([text], { type }), filename) }
export function projectManifest(project: Project) {
  return {
    schema_version: project.schemaVersion, id: project.id, name: project.name, layout: project.layout, category: project.category, delivery_stage: project.deliveryStage,
    page: project.page,
    media: project.assets.map(a => ({ id: a.id, src: a.name, alt: a.alt, provider: a.provider, source_id: a.sourceId, asset_stage: a.assetStage, usage_scope: a.usageScope, rights_status: a.rightsStatus, quality_grade: a.qualityGrade, approval: a.approval, evidence: a.evidence, download: a.download })),
    sections: project.sections.map(s => ({ id: s.id, type: s.type, eyebrow: s.eyebrow, title: s.title, body: s.body, items: s.items, menu_item_reversed: s.menuItemReversed || [], timeline_day_starts: s.timelineDayStarts || [], timeline_hero_visible: s.timelineHeroVisible !== false, list_style: s.listStyle || (s.type === 'offer' ? 'offer' : 'list'), table_headers: s.tableHeaders || [], table_rows: s.tableRows || [], icon_cards: s.iconCards || [], media: s.mediaIds, media_layout: s.mediaLayout, content_layout: s.contentLayout, layout_boxes: normalizeLayoutBoxes(s), media_layout_items: s.mediaLayoutItems || [], designer_note: s.note, hidden: Boolean(s.hidden) })),
  }
}
export function manifestYaml(project: Project) { return YAML.stringify(projectManifest(project)) }
export function manifestJson(project: Project) { return JSON.stringify(projectManifest(project), null, 2) }
export function canvasDocument(project: Project) {
  return {
    schema_version: '1.0.0', project_id: project.id, name: project.name, page: project.page,
    canvas: { base_width: 720, preview_viewports: [720], layout: project.layout, category: project.category },
    blocks: project.sections.map((s, order) => ({ order, id: s.id, type: s.type, hidden: Boolean(s.hidden), content: { eyebrow: s.eyebrow, title: s.title, body: s.body, items: s.items, menu_item_reversed: s.menuItemReversed || [], timeline_day_starts: s.timelineDayStarts || [], timeline_hero_visible: s.timelineHeroVisible !== false, list_style: s.listStyle || (s.type === 'offer' ? 'offer' : 'list'), table_headers: s.tableHeaders || [], table_rows: s.tableRows || [], icon_cards: s.iconCards || [] }, bindings: { media_ids: s.mediaIds, media_layout: s.mediaLayout, content_layout: s.contentLayout, layout_boxes: normalizeLayoutBoxes(s), media_layout_items: s.mediaLayoutItems || [] }, designer_note: s.note })),
  }
}
export function assetsManifest(project: Project) {
  return { schema_version: '1.0.0', project_id: project.id, assets: project.assets.map(({ src, ...asset }) => ({ ...asset, file: dataAssetFilename(asset.id, src), embedded: src.startsWith('data:') })) }
}
export function canvasDocumentJson(project: Project) { return JSON.stringify(canvasDocument(project), null, 2) }
export function assetsManifestJson(project: Project) { return JSON.stringify(assetsManifest(project), null, 2) }
// This is the only JSON format that can be loaded back into the studio without losing image bindings.
export function projectLoadJson(project: Project) {
  // Raw planning material belongs to the local brief workspace or an explicitly
  // exported brief. A designer-facing load JSON keeps only the approved summary.
  const { briefWorkspace: _briefWorkspace, ...loadableProject } = project
  const sections = project.sections.map(section => section.extensions?.unsupportedBlock?.data || section)
  return JSON.stringify({ ...loadableProject, sections }, null, 2)
}

function dataAssetFilename(id: string, src: string) { const ext = src.match(/^data:image\/([a-zA-Z0-9+.-]+);/)?.[1]?.replace('jpeg', 'jpg') || 'img'; return `assets/${id}.${ext}` }
type ExportAsset = MediaAsset & { sourceLabel?: string }
function assetSourceLabel(asset: ExportAsset) { return asset.sourceLabel || (asset.src.startsWith('http') ? asset.src : asset.name) }
function renderExportImage(asset: MediaAsset, className = '', style = '', imageStyle = '') {
  const source = assetSourceLabel(asset as ExportAsset)
  return `<div class="export-image${className ? ` ${escapeHtml(className)}` : ''}"${style ? ` style="${style}"` : ''}><img src="${asset.src}" alt="${escapeHtml(asset.alt || asset.name)}"${imageStyle ? ` style="${imageStyle}"` : ''}><span class="image-source-label">${escapeHtml(source)}</span></div>`
}
function renderMedia(project: Project, mediaIds: string[], mediaLayout: string) {
  const media = mediaIds.map(id => project.assets.find(asset => asset.id === id)).filter(Boolean)
  return media.length ? `<div class="media media-${media.length} media-layout-${escapeHtml(mediaLayout)}">${media.map(asset => renderExportImage(asset!)).join('')}</div>` : ''
}
function iconGlyph(icon: string) { return ({ calendar: '◷', car: '◌', hotel: '⌂', plane: '✈', map: '⌖', guide: '★', compass: '✦', star: '✧', sparkles: '✦' } as Record<string, string>)[icon] || '✦' }
function assetFor(project: Project, assetId: string | undefined): MediaAsset | undefined { return assetId ? project.assets.find(asset => asset.id === assetId) : undefined }
function renderSpecialImage(project: Project, assetId: string | undefined, label: string, className = '') {
  const asset = assetFor(project, assetId)
  return asset
    ? renderExportImage(asset, className)
    : `<div class="special-media-placeholder${className ? ` ${escapeHtml(className)}` : ''}"><span>${escapeHtml(label)}</span></div>`
}
function renderSpecialCopy(section: Section, className = 'special-common-copy') {
  return `<div class="${className}">${!isRichTextEmpty(section.eyebrow) ? `<p class="eyebrow">${escapeHtml(section.eyebrow)}</p>` : ''}${!isRichTextEmpty(section.title) ? `<h2>${sanitizeRichText(section.title)}</h2>` : ''}${!isRichTextEmpty(section.body) ? `<p class="section-body">${sanitizeRichText(section.body)}</p>` : ''}</div>`
}
function renderListSection(section: Section) {
  const listStyle = section.type === 'offer' || section.listStyle === 'offer' ? 'offer' : 'list'
  const items = section.items.map((item, index) => `<div><b>${String(index + 1).padStart(2, '0')}</b><span>${escapeHtml(item)}</span></div>`).join('')
  return `<section id="${escapeHtml(section.id)}" class="block preview-list-block"><div class="block-copy">${!isRichTextEmpty(section.eyebrow) ? `<p class="eyebrow">${escapeHtml(section.eyebrow)}</p>` : ''}${!isRichTextEmpty(section.title) ? `<h2>${sanitizeRichText(section.title)}</h2>` : ''}${!isRichTextEmpty(section.body) ? `<p class="section-body">${sanitizeRichText(section.body)}</p>` : ''}<div class="preview-list preview-list-${listStyle}">${items}</div></div>${section.note ? `<p class="designer-note">DESIGN NOTE · ${escapeHtml(section.note)}</p>` : ''}</section>`
}
function renderSpecialSection(project: Project, section: Section) {
  if (section.type === 'caption-grid') {
    const caption = (itemIndex: number) => { const item = splitPair(section.items[itemIndex] || ''); return `<figcaption><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.body)}</span></figcaption>` }
    const figures = section.items.map((_, itemIndex) => `<figure>${renderSpecialImage(project, section.mediaIds[itemIndex], `이미지 ${itemIndex + 1}`)}${caption(itemIndex)}</figure>`).join('')
    return `<section id="${escapeHtml(section.id)}" class="block special-section caption-grid-block">${renderSpecialCopy(section, 'special-common-copy caption-grid-copy')}<div class="caption-grid">${figures}</div>${section.note ? `<p class="designer-note">DESIGN NOTE · ${escapeHtml(section.note)}</p>` : ''}</section><style>.caption-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0;padding:0 14px 36px}.caption-grid figure{margin:0;background:#fff}.caption-grid .special-media-frame{height:252px}.caption-grid .special-media-frame>img,.caption-grid .special-media-placeholder{display:block;width:100%;height:252px;object-fit:cover}.caption-grid figcaption{min-height:70px;padding:10px 8px;display:grid;place-items:center;color:#333;text-align:center}.caption-grid figcaption strong{font-size:20px;font-weight:600}.caption-grid figcaption span{margin-top:4px;color:#657276;font-size:12px;line-height:1.5;white-space:pre-wrap}</style>`
  }
  if (section.type === 'menu-zigzag') {
    const rows = section.items.map((item, index) => { const parsed = splitPair(item); const reversed = Boolean(section.menuItemReversed?.[index]); return `<article style="${reversed ? 'grid-template-columns:.92fr 1fr' : ''}">${renderSpecialImage(project, section.mediaIds[index], `추천 이미지 ${index + 1}`)}<div style="${reversed ? 'order:-1' : ''}"><h3 style="display:block;margin:0 0 8px;padding:0;background:none;color:#253337;font-size:24px;font-weight:700;line-height:1.3">${escapeHtml(parsed.title)}</h3><p>${escapeHtml(parsed.body)}</p></div></article>` }).join('')
    return `<section id="${escapeHtml(section.id)}" class="block special-section menu-zigzag-block">${renderSpecialCopy(section)}<div class="menu-zigzag">${rows}</div>${section.note ? `<p class="designer-note">DESIGN NOTE · ${escapeHtml(section.note)}</p>` : ''}</section><style>.menu-zigzag{margin:0;padding:0 18px 42px}</style>`
  }
  const rows = section.items.map((item, index) => { const parsed = splitTimeline(item); const day = (section.timelineDayStarts || []).indexOf(index) + 1; return `${day > 0 ? `<p style="grid-column:1/-1;margin:16px 0 2px;padding:8px 12px;border-top:1px solid #d9ecec;border-bottom:1px solid #d9ecec;color:#087e84;font-size:16px;font-weight:800;line-height:1.2">${day}일차</p>` : ''}<article><div class="timeline-copy"><b>${escapeHtml(`${parsed.time} ${parsed.title}`.trim())}</b><p>${escapeHtml(parsed.body)}</p></div>${renderSpecialImage(project, section.mediaIds[index + 1], `일정 이미지 ${index + 1}`)}</article>` }).join('')
  return `<section id="${escapeHtml(section.id)}" class="block special-section timeline-block">${renderSpecialCopy(section)}<div class="timeline-reference-body">${section.timelineHeroVisible !== false ? renderSpecialImage(project, section.mediaIds[0], '대표 이미지', 'timeline-hero') : ''}<div class="timeline-list">${rows}</div></div>${section.note ? `<p class="designer-note">DESIGN NOTE · ${escapeHtml(section.note)}</p>` : ''}</section>`
}

function renderImageFlowSection(project: Project, section: Section) {
  const boxes = normalizeLayoutBoxes(section).slice().sort((a, b) => a.row - b.row || a.column - b.column)
  const imageCard = (ids: string[]) => {
    const assets = ids.map(id => assetFor(project, id)).filter(Boolean) as MediaAsset[]
    if (!assets.length) return '<div style="height:285px;display:grid;place-items:center;border:1px dashed #b8cacc;background:#f7fbfb;color:#789093;font-size:11px">이미지를 연결하세요.</div>'
    if (section.mediaLayout === 'custom') {
      const layoutItems = normalizeCustomLayout(ids, section.mediaLayoutItems)
      const rowCount = Math.max(...layoutItems.map(item => item.row + item.rowSpan - 1), 1)
      const images = assets.map(asset => {
        const item = layoutItems.find(entry => entry.assetId === asset.id)
        if (!item) return renderExportImage(asset, '', 'height:360px')
        return renderExportImage(asset, '', `grid-column:${item.column} / span ${item.columnSpan};grid-row:${item.row} / span ${item.rowSpan}`, `object-position:${item.focus}`)
      }).join('')
      return `<div class="export-custom-media" style="display:grid;gap:5px;grid-template-columns:repeat(12,minmax(0,1fr));grid-template-rows:repeat(${rowCount},108px)">${images}</div>`
    }
    const columns = assets.length === 1 ? '1fr' : 'repeat(2,1fr)'
    return `<div style="display:grid;grid-template-columns:${columns};gap:5px">${assets.map(asset => renderExportImage(asset, '', 'height:360px')).join('')}</div>`
  }
  const cards = boxes.map(box => {
    if (box.kind === 'content') return `<article style="padding:53px 56px 46px">${section.eyebrow.trim() ? `<p class="eyebrow">${escapeHtml(section.eyebrow)}</p>` : ''}${section.title.trim() ? `<h2>${sanitizeRichText(section.title)}</h2>` : ''}${section.body.trim() ? `<p style="white-space:pre-wrap;color:#596568">${sanitizeRichText(section.body)}</p>` : ''}</article>`
    if (box.kind === 'text') return `<article style="padding:48px 56px;background:#f8fbfa">${box.eyebrow ? `<p class="eyebrow">${escapeHtml(box.eyebrow)}</p>` : ''}${box.title ? `<h2>${escapeHtml(box.title)}</h2>` : ''}<p style="white-space:pre-wrap;color:#596568">${escapeHtml(box.text || '')}</p></article>`
    return `<article>${imageCard(box.assetIds || [])}</article>`
  }).join('')
  return `<section id="${escapeHtml(section.id)}" class="block image-flow-block" style="padding:0">${cards}${section.note ? `<p class="designer-note">DESIGN NOTE · ${escapeHtml(section.note)}</p>` : ''}</section>`
}

// Text blocks are edited as stacked cards in the canvas. Export the same flow
// instead of resurrecting their legacy absolute layout-box coordinates.
function renderTextFlowSection(section: Section) {
  const boxes = normalizeLayoutBoxes(section)
    .filter(box => box.kind === 'content' || box.kind === 'text')
    .slice()
    .sort((a, b) => a.row - b.row || a.column - b.column)
  const commonCopy = (eyebrow: string, title: string, body: string, extraClass = '') => `<div class="section-text-content${extraClass ? ` ${extraClass}` : ''}">${!isRichTextEmpty(eyebrow) ? `<p class="eyebrow">${escapeHtml(eyebrow)}</p>` : ''}${!isRichTextEmpty(title) ? `<h2>${sanitizeRichText(title)}</h2>` : ''}${!isRichTextEmpty(body) ? `<p class="section-body">${sanitizeRichText(body)}</p>` : ''}</div>`
  const cards = boxes.map(box => box.kind === 'content'
    ? `<article class="text-flow-card text-flow-card-content">${commonCopy(section.eyebrow, section.title, section.body)}</article>`
    : `<article class="text-flow-card text-flow-card-text">${commonCopy(box.eyebrow || '', box.title || '', box.text || '')}</article>`
  ).join('')
  return `<section id="${escapeHtml(section.id)}" class="block text-flow-block content-layout-${escapeHtml(section.contentLayout || 'text-top')}" style="padding:0">${cards}${section.note ? `<p class="designer-note">DESIGN NOTE · ${escapeHtml(section.note)}</p>` : ''}</section>`
}

export function standaloneHtml(project: Project) {
  let sections = project.sections.filter(s => !s.hidden).map(s => {
    if (s.type === 'caption-grid' || s.type === 'menu-zigzag' || s.type === 'timeline') return renderSpecialSection(project, s)
    if (s.type === 'image') return renderImageFlowSection(project, s)
    if (s.type === 'text') return renderTextFlowSection(s)
    if (s.type === 'list' || s.type === 'offer') return renderListSection(s)
    const items = s.items
    const headers = s.tableHeaders?.length ? s.tableHeaders : ['구분', '내용']
    const table = s.type === 'table' ? `<table><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${(s.tableRows || []).map(row => `<tr>${headers.map((_, index) => `<td>${escapeHtml(row[index] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''
    const iconCards = s.type === 'icon-card' ? `<div class="icon-cards">${(s.iconCards || []).map(card => `<article class="icon-card icon-card--${escapeHtml(card.tone)}"><i>${iconGlyph(card.icon)}</i><strong>${escapeHtml(card.title)}</strong><span>${escapeHtml(card.body)}</span></article>`).join('')}</div>` : ''
    const text = `<div class="block-copy">${s.eyebrow.trim() ? `<p class="eyebrow">${escapeHtml(s.eyebrow)}</p>` : ''}${s.title.trim() ? `<h2>${sanitizeRichText(s.title)}</h2>` : ''}${s.body.trim() ? `<p>${sanitizeRichText(s.body)}</p>` : ''}${table}${iconCards}${items.length ? `<ul>${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : ''}<small>${SECTION_LABELS[s.type]}</small></div>`
    // Table and icon-card blocks are naturally sized in the canvas.  They must not
    // inherit the fixed-height layout-box shell used only by text/image flow blocks.
    if (s.type === 'table' || s.type === 'icon-card') return `<section id="${escapeHtml(s.id)}" class="block content-layout-${escapeHtml(s.contentLayout || 'text-top')}">${text}</section>`
    const boxes = normalizeLayoutBoxes(s)
    const height = Math.max(...boxes.map(box => box.row + box.rowSpan), 9) * 58
    const content = boxes.map(box => { const body = box.kind === 'content' ? text : box.kind === 'text' ? `<p class="extra-copy">${escapeHtml(box.text || '')}</p>` : renderMedia(project, box.assetIds || [], s.mediaLayout); return `<article class="layout-box layout-box-${box.kind}" style="left:${(box.column - 1) / 12 * 100}%;top:${(box.row - 1) * 58}px;width:${box.columnSpan / 12 * 100}%;height:${box.rowSpan * 58}px;z-index:${box.zIndex}">${body}</article>` }).join('')
    return `<section id="${escapeHtml(s.id)}" class="block content-layout-${escapeHtml(s.contentLayout || 'text-top')}"><div class="block-canvas" style="height:${height}px">${content}</div></section>`
  }).join('')
  // The app renders list item copy with pre-wrap, so explicit title/body line
  // breaks stay intact in the standalone HTML as well.
  const canvasParityStyles = '@import url(\'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&family=Noto+Serif+KR:wght@500;600;700&display=swap\');.preview-list>div>span{white-space:pre-wrap}.text-flow-card .section-text-content h2{max-width:590px;margin:0 0 16px;font-size:31px;line-height:1.35}.menu-zigzag-block .special-common-copy h2,.timeline-block .special-common-copy h2{display:block;width:auto;max-width:590px;height:auto;margin:0 0 16px;padding:0;border-radius:0;background:transparent;color:#172326;font-family:"Noto Serif KR",serif;font-size:31px;line-height:1.35;font-weight:600;letter-spacing:0}.menu-zigzag-block .special-common-copy h2 span,.timeline-block .special-common-copy h2 span{color:inherit;text-decoration:none;text-underline-offset:initial}'
return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=720"><title>${escapeHtml(project.page.title || project.name)}</title><style>:root{--teal:#07858b;--coral:#e46555;--ink:#182326}*{box-sizing:border-box}body{margin:0;min-width:720px;background:#eef2f2;color:var(--ink);font-family:Pretendard,"Noto Sans KR",sans-serif}.page{width:720px;margin:auto;background:white;box-shadow:0 16px 48px #19353b18}.block{padding:48px 56px;border-bottom:1px solid #e8eeee}.block-canvas{position:relative}.layout-box{position:absolute;overflow:auto;background:#fff}.layout-box-content,.layout-box-text{border:1px solid #eef2f2}.layout-box .block-copy{padding:27px 30px}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.18em;color:var(--coral)}.block h2{margin:8px 0 14px;font-family:"Noto Serif KR",serif;font-size:28px;line-height:1.3}.block p,.block li{font-size:14px;line-height:1.8}.block small{opacity:.45}.block table{width:100%;margin-top:20px;border-collapse:collapse;font-size:12px}.block th,.block td{padding:10px;text-align:left;border:1px solid #d8e0e0;vertical-align:top;line-height:1.55}.block th{background:#e7f3f2;color:#176f74}.icon-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:20px}.icon-card{min-width:0;min-height:130px;padding:14px 9px;background:#fff;border:1px solid #e2e8e7;border-radius:8px;display:flex;flex-direction:column;align-items:center;text-align:center;color:#273336}.icon-card i{width:36px;height:36px;margin-bottom:8px;border-radius:50%;display:grid;place-items:center;background:#edf7f6;color:#078d92;font-style:normal;font-size:20px}.icon-card strong{font-size:12px}.icon-card span{margin-top:7px;color:#657276;font-size:10px;line-height:1.45}.icon-card--orange i{background:#fff2e9;color:#e87931}.icon-card--green i{background:#edf7e8;color:#5e9e36}.media{display:grid;width:100%;height:100%;gap:4px}.media-2,.media-3,.media-4{grid-template-columns:repeat(2,1fr)}.export-image{position:relative;display:block;min-width:0;min-height:0;overflow:hidden}.export-image img{display:block;width:100%;height:100%;object-fit:cover}.image-source-label{position:absolute;right:0;bottom:0;left:0;padding:5px 8px;background:rgba(12,27,29,.82);color:#fff;font:10px/1.35 monospace;word-break:break-all}.extra-copy{height:100%;margin:0;padding:23px 25px;white-space:pre-wrap}.layout-box-text{border:1px solid #eef2f2}.text-flow-card{background:#fff}.text-flow-card .section-text-content{padding:53px 58px 46px}.text-flow-card .section-text-content h2{max-width:590px}.text-flow-card-text{background:#f8fbfa}.text-flow-card-text .section-text-content{padding:48px 58px 46px}.text-flow-card .section-body{max-width:570px;margin:0;color:#596568;font-size:14px;line-height:1.8;white-space:pre-wrap}.special-section{text-align:center}.special-icon{width:42px;height:42px;margin:0 auto 10px;display:grid;place-items:center;color:#12a4ad;font-size:28px}.special-lead{margin:0 auto 22px;color:#667477;font-size:13px;line-height:1.65;white-space:pre-wrap}.special-media-placeholder{display:grid;place-items:center;background:#edf3f3;color:#879699;border:1px dashed #b8cacc}.caption-grid-block h2{margin:0 0 28px;font-family:"Noto Sans KR",sans-serif;font-size:28px;font-weight:800}.caption-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;margin:0 -56px}.caption-grid figure{margin:0;background:#fff}.caption-grid img,.caption-grid .special-media-placeholder{width:100%;height:246px;object-fit:cover}.caption-grid figcaption{height:70px;display:grid;place-items:center;font-size:20px;font-weight:500;color:#333}.menu-zigzag-block h2{width:520px;height:64px;margin:0 auto 38px;border-radius:999px;background:#f5363d;color:#fff;display:flex;align-items:center;justify-content:center;gap:8px;font-family:"Noto Sans KR",sans-serif;font-size:32px;font-weight:800}.menu-zigzag-block h2 span{color:#d9ff00;text-decoration:underline;text-underline-offset:4px}.menu-zigzag{display:grid;gap:30px;margin:0 -38px}.menu-zigzag article{display:grid;grid-template-columns:1fr .92fr;gap:24px;align-items:center;text-align:left}.menu-zigzag article.reverse{grid-template-columns:.92fr 1fr}.menu-zigzag article.reverse>div{order:-1;text-align:right}.menu-zigzag img,.menu-zigzag .special-media-placeholder{width:100%;height:250px;border-radius:8px;object-fit:cover}.menu-zigzag h3{display:inline-block;margin:0 0 8px;padding:0 10px;background:linear-gradient(transparent 48%,#fff05a 48%);color:#f34a35;font-size:30px;font-weight:900;line-height:1.1}.menu-zigzag p{margin:0;color:#333;font-size:22px;line-height:1.32;white-space:pre-wrap}.timeline-block{padding:45px 10px 54px;background:#f5f3e7}.timeline-block h2{margin:6px 0 22px;font-family:"Noto Sans KR",sans-serif;font-size:39px;line-height:1.2;font-weight:900;letter-spacing:-.04em}.timeline-block h2 span{color:#ff5a00}.timeline-block>strong{display:inline-flex;align-items:center;justify-content:center;min-width:470px;min-height:54px;padding:0 34px;border-radius:999px;background:#d58a08;color:#fff;font-size:29px}.timeline-subtitle{margin:14px 0 18px;color:#575757;font-size:18px}.timeline-hero{display:block;width:100%;height:298px;border-radius:10px}.timeline-intro{margin:18px auto 48px;color:#3d3d3d;font-size:21px;line-height:1.55;white-space:pre-wrap}.timeline-list{position:relative;display:grid;gap:15px;padding-left:25px}.timeline-list:before{content:"";position:absolute;left:36px;top:12px;bottom:0;width:2px;background:#28b6bf}.timeline-list article{position:relative;display:grid;grid-template-columns:315px 1fr;gap:24px;align-items:start;text-align:left}.timeline-list article:before{content:"";position:absolute;left:-1px;top:0;width:24px;height:24px;border:6px solid #28b6bf;border-radius:50%;background:#fff}.timeline-copy{padding-left:36px}.timeline-copy b{display:block;color:#009a9d;font-size:26px;line-height:1.25}.timeline-copy p{margin:12px 0 0;color:#4a4a4a;font-size:20px;line-height:1.45;white-space:pre-wrap}.timeline-list img,.timeline-list .special-media-placeholder{width:100%;height:170px;border-radius:12px;object-fit:cover}.designer-note{margin-top:26px;background:#fff3d8;border-left:3px solid #e7ae32;padding:9px 12px;font-size:9px;color:#725c2c}.special-section{padding:0;text-align:left}.special-common-copy{padding:48px 56px 42px}.special-common-copy .section-body{max-width:570px;margin:0;color:#596568;font-size:14px;line-height:1.8;white-space:pre-wrap}.menu-zigzag-block .special-common-copy h2,.timeline-block .special-common-copy h2{display:block;width:auto;height:auto;margin:8px 0 14px;padding:0;border-radius:0;background:transparent;color:var(--ink);font-family:"Noto Serif KR",serif;font-size:28px;line-height:1.3;font-weight:500;letter-spacing:0}.menu-zigzag{margin:0 -38px 42px}.timeline-block{padding:0;background:#fff}.timeline-reference-body{padding:45px 10px 54px;background:#fff;text-align:center}.timeline-reference-body .timeline-list{margin-top:48px}.timeline-reference-body .special-media-placeholder.timeline-hero{height:298px}.preview-list-block{padding:64px 58px}.preview-list{display:grid;gap:9px;margin-top:31px}.preview-list>div{display:flex;align-items:center;gap:13px;padding:12px 14px;border-top:1px solid rgba(120,135,138,.2);font-size:12px;line-height:1.55}.preview-list b{font-size:10px;color:var(--teal)}.preview-list-offer>div{border:0;border-radius:30px;background:#07979c;color:#fff;padding:11px 19px}.preview-list-offer b{color:#ffeb50}${canvasParityStyles}</style></head><body><main class="page">${sections}</main></body></html>`
}
function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[ch]!) }

export async function exportPng(node: HTMLElement, name: string) { const url = await toPng(node, { cacheBust: true, pixelRatio: 2, backgroundColor: '#ffffff' }); const anchor = document.createElement('a'); anchor.download = `${name}.png`; anchor.href = url; anchor.click() }

export async function exportZip(project: Project) {
  const zip = new JSZip()
  const packagedProject = JSON.parse(JSON.stringify(project)) as Project
  const failures: string[] = []

  for (const asset of packagedProject.assets) {
    const original = project.assets.find(item => item.id === asset.id)
    if (!original?.src) continue
    try {
      let sourceBlob: Blob
      if (original.src.startsWith('data:')) {
        const response = await fetch(original.src)
        sourceBlob = await response.blob()
      } else {
        const desktopDownload = window.naeilSpecialDesktop?.downloadImage
        if (desktopDownload) {
          const downloaded = await desktopDownload(original.src)
          sourceBlob = new Blob([downloaded.bytes], { type: downloaded.contentType })
        } else {
          const response = await fetch(original.src)
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          sourceBlob = await response.blob()
        }
      }
      const converted = await convertDesignerImage(sourceBlob)
      const path = packageAssetPath(original, converted.extension)
      zip.file(path, converted.blob)
      ;(asset as ExportAsset).sourceLabel = original.src.startsWith('http') ? original.src : original.name
      asset.download = { status: 'downloaded', source: original.src, packagedPath: path, transformedFormat: converted.extension }
      asset.src = path
    } catch (error) {
      const reason = error instanceof Error ? error.message : '다운로드 실패'
      failures.push(`- ${original.name || original.id}\n  - URL: ${original.src}\n  - 사유: ${reason}`)
      asset.download = { status: 'failed', source: original.src, failureReason: reason }
      zip.file(`assets/${original.id}.url.txt`, `${original.src}\n`)
    }
  }

  zip.file('index.html', standaloneHtml(packagedProject))
  zip.file('로드용-프로젝트.json', projectLoadJson(project))
  zip.file('이미지-패키징-결과.json', JSON.stringify(packagedProject.assets.map(asset => ({ id: asset.id, name: asset.name, source: asset.download?.source || asset.src, status: asset.download?.status || 'pending', packagedPath: asset.download?.packagedPath, transformedFormat: asset.download?.transformedFormat, failureReason: asset.download?.failureReason })), null, 2))
  zip.file('디자이너-전달사항.md', `# ${project.name}\n\n압축을 푼 뒤 **index.html**을 열면 720px PC 시안을 바로 확인할 수 있습니다.\n이미지는 assets 폴더에 함께 들어 있습니다.\n\n- 카테고리: ${project.category}\n- 레이아웃: ${project.layout}\n- 전달 단계: ${project.deliveryStage}\n- 내부 메모: ${project.page.internalMemo || '없음'}\n\n## 이미지 패키징\n- 결과 파일: 이미지-패키징-결과.json\n- 성공: ${packagedProject.assets.filter(asset => asset.download?.status === 'downloaded').length}개\n- 확인 필요: ${packagedProject.assets.filter(asset => asset.download?.status === 'failed').length}개\n\n## 블록별 메모\n${project.sections.map((s, i) => `${i + 1}. ${SECTION_LABELS[s.type]} — ${s.note || '메모 없음'}`).join('\n')}\n\n## QA\n${runQa(project).map(q => `- [${q.level}] ${q.label}: ${q.detail}`).join('\n')}`)
  if (failures.length) zip.file('이미지-다운로드-확인필요.md', `# 다운로드하지 못한 URL 이미지\n\n아래 이미지는 원본 서버의 접근 제한 또는 네트워크 문제로 로컬 파일화하지 못했습니다. index.html에는 원본 URL을 유지했으며, 온라인 상태에서는 그대로 표시됩니다.\n\n${failures.join('\n\n')}\n`)
  download(await zip.generateAsync({ type: 'blob' }), `${project.name}-designer-handoff.zip`)
  return failures
}

async function convertDesignerImage(blob: Blob): Promise<{ blob: Blob; extension: 'jpg' | 'png' }> {
  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('이미지 형식을 JPG 또는 PNG로 변환할 수 없습니다.'))
      element.src = objectUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth || image.width
    canvas.height = image.naturalHeight || image.height
    const context = canvas.getContext('2d')
    if (!context || !canvas.width || !canvas.height) throw new Error('이미지 크기를 읽을 수 없습니다.')
    const extension: 'jpg' | 'png' = blob.type.toLowerCase().includes('jpeg') || blob.type.toLowerCase().includes('jpg') ? 'jpg' : 'png'
    context.drawImage(image, 0, 0)
    const type = extension === 'jpg' ? 'image/jpeg' : 'image/png'
    const converted = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('이미지 변환에 실패했습니다.')), type, extension === 'jpg' ? .92 : undefined))
    return { blob: converted, extension }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function packageAssetPath(asset: MediaAsset, extension: 'jpg' | 'png') {
  const ext = extension
  return `assets/${asset.id}.${ext}`
}

export function shareSnapshotUrl(project: Project) {
  const bytes = new TextEncoder().encode(JSON.stringify(project)); let binary = ''; bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  const payload = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  if (payload.length > 1_800_000) throw new Error('SHARE_TOO_LARGE')
  return `${location.origin}${location.pathname}#share=${payload}`
}
export function parseShareSnapshot(): Project | undefined {
  const payload = location.hash.startsWith('#share=') ? location.hash.slice(7) : ''
  if (!payload) return undefined
  try { const normalized = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='); const binary = atob(normalized); const bytes = Uint8Array.from(binary, char => char.charCodeAt(0)); return JSON.parse(new TextDecoder().decode(bytes)) as Project } catch { return undefined }
}
