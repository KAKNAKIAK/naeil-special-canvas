import { useEffect, useRef, useState } from 'react'
import { Archive, ArrowLeftRight, Blocks, CalendarDays, Check, ChevronDown, ChevronUp, CircleHelp, Download, ExternalLink, Eye, FileJson, FileText, GripVertical, Image as ImageIcon, Layers, Link2, LogOut, MapPinned, Maximize2, Menu, Minus, PanelsTopLeft, Plus, Redo2, Save, Search, Settings2, Sparkles, Table2, Trash2, Undo2, Upload, X } from 'lucide-react'
import YAML from 'yaml'
import { canvasLinkedAssetIds, createSampleProject, createSeedProject, createTemplateProject, GROUPS, isLegacyBaliSeed, makeSection, normalizeLayoutBoxes, normalizeProject, normalizeReferenceMediaSlots, normalizeSectionType, referenceMediaSlot, SECTION_LABELS, TEMPLATE_PRESETS, timelineDayStartsAfterItemRemoval, type TemplatePresetId } from './catalog'
import { APP_VERSION } from './app-version'
import { moveSectionUnit, normalizeContentGroups, removeSectionsFromGroups, reorderSectionUnit } from './content-groups'
import { exportZip, parseShareSnapshot, projectLoadJson, standaloneHtml, downloadText, type ZipExportProgress } from './exporters'
import { createCustomLayout, normalizeCustomLayout, patchLayoutItem, swapCustomLayoutPlacements } from './image-layout'
import { loadWorkspaceWithTimeout, saveMigrationBackup, saveWorkspace } from './storage'
import { isDirectProjectPayload, migrateProject } from './migrations'
import { richTextToPlainText } from './rich-text'
import { collectAssetSources, historySnapshot, restoreHistorySnapshot } from './project-history'
import { SectionView } from './components/CanvasSection'
import { Inspector } from './components/SectionInspector'
import { ITEM_PRESET_TYPES, REFERENCE_LAYOUT_TYPES } from './components/editor-shared'
import type { BlockBox, ContentGroup, IconCardItem, MediaAsset, MediaLayoutItem, Project, Section, SectionType } from './types'

type LeftTab = 'blocks' | 'images' | 'layers'
type ImageTarget = { sectionId?: string; boxId?: string; specialMediaIndex?: number; replaceAssetId?: string } | null
type GettyLookupResult = { contentId: string; title: string; pageUrl: string; thumbUrl: string; status: 'found' | 'not_found' | 'error'; errorMessage: string }

const CANVAS_WIDTH = 720
const ONBOARDING_STORAGE_KEY = 'naeil-special-canvas:onboarding-v1'
// The previous visual 120% size is the new user-facing 100% baseline.
const ZOOM_REFERENCE = 100 / 1.2
const BRAND_LOGO = new URL('./assets/naeil-tour-ci.png', import.meta.url).href
const uniqueIds = (ids: string[]) => [...new Set(ids.filter(Boolean))]

function mediaIdsFromBoxes(boxes: BlockBox[]) {
  const boxIds = boxes
    .filter(box => box.kind === 'media' || box.kind === 'image')
    .flatMap(box => box.assetIds || [])
  return uniqueIds(boxIds)
}

function presetItemCount(section?: Section) {
  if (!section) return 0
  if (section.type === 'table') return section.tableRows?.length || 0
  if (section.type === 'icon-card') return section.iconCards?.length || 0
  return section.items.length
}
const deepCopy = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const nextDayLabel = (rows: string[][]) => { const last = rows[rows.length - 1]?.[0] || ''; const day = Number(last.match(/\d+/)?.[0]); return `DAY ${Number.isFinite(day) ? day + 1 : rows.length + 1}` }
const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'naeil-special'

export default function App() {
  const [project, setProject] = useState<Project>(createSeedProject)
  const [ready, setReady] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectFiles, setProjectFiles] = useState<Record<string, string>>({})
  const [blockPickerOpen, setBlockPickerOpen] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string>('')
  const [selectedBoxId, setSelectedBoxId] = useState<string>('')
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null)
  const [selectedSpecialMediaIndex, setSelectedSpecialMediaIndex] = useState<number | null>(null)
  const [leftTab, setLeftTab] = useState<LeftTab>('blocks')
  const [zoom, setZoom] = useState(100)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [linkedSaveStatus, setLinkedSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [zipProgress, setZipProgress] = useState<ZipExportProgress | null>(null)
  const [history, setHistory] = useState<Project[]>([])
  const [future, setFuture] = useState<Project[]>([])
  const [exportOpen, setExportOpen] = useState(false)
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(0)
  const [mobilePanel, setMobilePanel] = useState<'left' | 'right' | null>(null)
  const [imageTarget, setImageTarget] = useState<ImageTarget>(null)
  const [toast, setToast] = useState('')
  const artboardRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const projectRef = useRef(project)
  const projectsRef = useRef<Project[]>([])
  const projectFilesRef = useRef<Record<string, string>>({})
  const assetSourcesRef = useRef<Record<string, string>>({})
  const storageFailureShownRef = useRef(false)
  const historyCoalesceUntilRef = useRef(0)
  const linkedSaveSnapshotRef = useRef<Record<string, string>>({})
  const linkedSaveSequenceRef = useRef(0)
  const imageSelectionRef = useRef({ sectionId: '', boxId: '', specialMediaIndex: null as number | null })

  useEffect(() => { projectRef.current = project; assetSourcesRef.current = collectAssetSources(project, assetSourcesRef.current) }, [project])
  useEffect(() => { projectsRef.current = projects }, [projects])
  useEffect(() => { projectFilesRef.current = projectFiles }, [projectFiles])
  useEffect(() => { imageSelectionRef.current = { sectionId: selectedId, boxId: selectedBoxId, specialMediaIndex: selectedSpecialMediaIndex } }, [selectedId, selectedBoxId, selectedSpecialMediaIndex])
  useEffect(() => { let active = true; const shared = parseShareSnapshot(); if (shared) { const next = normalizeProject(shared); setProject(next); setProjects([next]); setSelectedId(next.sections[0]?.id || ''); setReadOnly(true); setReady(true); return } loadWorkspaceWithTimeout().then(stored => {
    if (!active) return
    const saved = stored?.projects?.length ? stored.projects.map(normalizeProject) : []
    const seed = createSeedProject()
    setProjects(saved)
    projectFilesRef.current = stored?.projectFiles || {}
    setProjectFiles(projectFilesRef.current)
    setProject(seed)
    setSelectedId('')
    setReady(true)
  }).catch(() => {
    if (!active) return
    const seed = createSeedProject()
    setProjects([])
    setProject(seed)
    setSelectedId('')
    setToast('이 PC의 임시 작업을 열지 못해 빈 캔버스로 시작했습니다. 저장한 JSON 파일은 파일 메뉴에서 다시 불러올 수 있습니다.')
    setReady(true)
  }); return () => { active = false } }, [])
  useEffect(() => { if (!ready || readOnly) return; const timer = setTimeout(() => { const current = projectsRef.current; const next = current.some(item => item.id === project.id) ? current.map(item => item.id === project.id ? project : item) : [project, ...current]; projectsRef.current = next; setProjects(next); saveWorkspace({ activeId: project.id, projects: next, projectFiles: projectFilesRef.current }).then(() => { storageFailureShownRef.current = false; setSavedAt(new Date()) }).catch(() => { if (storageFailureShownRef.current) return; storageFailureShownRef.current = true; setToast('이 PC의 임시 자동 저장에 실패했습니다. 파일 메뉴에서 JSON 저장을 해주세요.') }) }, 450); return () => clearTimeout(timer) }, [project, ready, readOnly])
  useEffect(() => {
    if (!ready || readOnly) return
    const desktop = window.naeilSpecialDesktop
    const filePath = projectFiles[project.id]
    if (!desktop || !filePath) { setLinkedSaveStatus('idle'); return }
    const contents = projectLoadJson(project)
    const snapshot = `${filePath}\n${contents}`
    if (linkedSaveSnapshotRef.current[project.id] === snapshot) { setLinkedSaveStatus('saved'); return }
    setLinkedSaveStatus('saving')
    const timer = setTimeout(async () => {
      const sequence = ++linkedSaveSequenceRef.current
      try {
        const result = await desktop.saveProjectFile({ contents, filename: `${safeName(project.name)}.json`, path: filePath })
        if (sequence !== linkedSaveSequenceRef.current) return
        if (result.canceled) throw new Error('AUTO_SAVE_CANCELED')
        linkedSaveSnapshotRef.current[project.id] = snapshot
        setLinkedSaveStatus('saved')
        setSavedAt(new Date())
      } catch {
        if (sequence !== linkedSaveSequenceRef.current) return
        setLinkedSaveStatus('failed')
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [project, projectFiles, ready, readOnly])
  useEffect(() => {
    const desktop = window.naeilSpecialDesktop
    if (!desktop) return
    return desktop.onSaveBeforeClose(mode => {
      saveProjectFile(mode === 'save-as')
        .then(saved => desktop.completeSaveBeforeClose(saved))
        .catch(() => desktop.completeSaveBeforeClose(false))
    })
  }, [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.shiftKey) return
      if ((event.ctrlKey || event.metaKey) && (event.code === 'KeyQ' || event.key.toLowerCase() === 'q')) {
        event.preventDefault()
        requestAppClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2200); return () => clearTimeout(timer) }, [toast])
  useEffect(() => {
    if (!ready || readOnly || localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'done') return
    setOnboardingStep(0)
    setOnboardingOpen(true)
  }, [ready, readOnly])
  useEffect(() => {
    if (!fileMenuOpen) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Element && !event.target.closest('.file-wrap')) setFileMenuOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [fileMenuOpen])

  const selected = project.sections.find(section => section.id === selectedId)
  const selectedBox = selected ? normalizeLayoutBoxes(selected).find(box => box.id === selectedBoxId) : undefined
  function focusSection(section?: Section) {
    setSelectedId(section?.id || '')
    setSelectedBoxId('')
    setSelectedSpecialMediaIndex(null)
    setSelectedItemIndex(section && ITEM_PRESET_TYPES.has(section.type) && presetItemCount(section) ? 0 : null)
  }
  function focusLayerSection(id: string) {
    const section = project.sections.find(item => item.id === id)
    if (!section) return
    focusSection(section)
    setMobilePanel(null)
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-section-id="${id}"]`)
      const scroller = document.querySelector<HTMLElement>('.canvas-scroll')
      if (!target || !scroller) return
      const targetRect = target.getBoundingClientRect()
      const scrollerRect = scroller.getBoundingClientRect()
      const top = scroller.scrollTop + targetRect.top - scrollerRect.top - (scrollerRect.height - targetRect.height) / 2
      scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    })
  }

  function commit(mutator: (draft: Project) => void, coalesceHistory = false) {
    if (readOnly) { setToast('읽기 전용 공유본입니다.'); return }
    const now = Date.now()
    const shouldRecordHistory = !coalesceHistory || now >= historyCoalesceUntilRef.current
    if (coalesceHistory) historyCoalesceUntilRef.current = now + 900
    else historyCoalesceUntilRef.current = 0
    setProject(current => { if (shouldRecordHistory) setHistory(h => [...h.slice(-39), historySnapshot(current)]); setFuture([]); const draft = deepCopy(current); mutator(draft); draft.updatedAt = new Date().toISOString(); return draft })
  }
  async function saveProjectFile(saveAs = false) {
    if (readOnly) { setToast('읽기 전용 공유본은 저장할 수 없습니다.'); return false }
    const current = projectRef.current
    const currentProjects = projectsRef.current
    const nextProjects = currentProjects.some(item => item.id === current.id) ? currentProjects.map(item => item.id === current.id ? current : item) : [current, ...currentProjects]
    const contents = projectLoadJson(current)
    const desktop = window.naeilSpecialDesktop
    if (!desktop) {
      downloadText(contents, `${safeName(current.name)}.json`, 'application/json;charset=utf-8')
      setToast('프로젝트 JSON을 다운로드했습니다.')
      return true
    }
    try {
      const result = await desktop.saveProjectFile({ contents, filename: `${safeName(current.name)}.json`, path: saveAs ? undefined : projectFilesRef.current[current.id] })
      if (result.canceled || !result.path) return false
      const nextFiles = { ...projectFilesRef.current, [current.id]: result.path }
      projectFilesRef.current = nextFiles
      linkedSaveSnapshotRef.current[current.id] = `${result.path}\n${contents}`
      setProjectFiles(nextFiles)
      setLinkedSaveStatus('saved')
      projectsRef.current = nextProjects
      setProjects(nextProjects)
      await saveWorkspace({ activeId: current.id, projects: nextProjects, projectFiles: nextFiles })
      setSavedAt(new Date())
      setToast(saveAs ? '새 JSON 파일로 저장했습니다.' : '프로젝트 JSON을 저장했습니다.')
      return true
    } catch (error) {
      setToast(error instanceof Error ? error.message : '프로젝트 JSON을 저장하지 못했습니다.')
      return false
    }
  }
  function requestAppClose() {
    const desktop = window.naeilSpecialDesktop
    if (desktop) desktop.requestClose()
    else window.close()
  }
  function imageTargetIsCurrent(target: ImageTarget) {
    if (!target?.sectionId) return true
    const current = imageSelectionRef.current
    if (current.sectionId !== target.sectionId) return false
    return target.specialMediaIndex !== undefined ? current.specialMediaIndex === target.specialMediaIndex : !target.boxId || current.boxId === target.boxId
  }
  function undo() { if (!history.length) return; const previous = history[history.length - 1]; setFuture(f => [historySnapshot(project), ...f]); setHistory(h => h.slice(0, -1)); setProject(restoreHistorySnapshot(previous, assetSourcesRef.current)) }
  function redo() { if (!future.length) return; const next = future[0]; setHistory(h => [...h, historySnapshot(project)]); setFuture(f => f.slice(1)); setProject(restoreHistorySnapshot(next, assetSourcesRef.current)) }
  function addSection(type: SectionType) { const section = makeSection(type); commit(draft => draft.sections.push(section)); focusSection(section); setBlockPickerOpen(false); setMobilePanel(null); setTimeout(() => document.querySelector(`[data-section-id="${section.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80) }
  function updateSection(patch: Partial<Section>) { if (!selected) return; commit(draft => { const target = draft.sections.find(s => s.id === selected.id); if (target) Object.assign(target, patch) }, true) }
  function updateSectionById(sectionId: string, patch: Partial<Section>) { commit(draft => { const target = draft.sections.find(s => s.id === sectionId); if (target) Object.assign(target, patch) }, true) }
  function selectSectionBox(sectionId: string, boxId: string) {
    const section = project.sections.find(item => item.id === sectionId)
    const box = section ? normalizeLayoutBoxes(section).find(item => item.id === boxId) : undefined
    setSelectedId(sectionId)
    setSelectedBoxId(boxId)
    setSelectedItemIndex(null)
    setSelectedSpecialMediaIndex(null)
    if (box?.kind === 'media' || box?.kind === 'image') setLeftTab('images')
  }
  function selectSectionItem(sectionId: string, index: number) { setSelectedId(sectionId); setSelectedBoxId(''); setSelectedItemIndex(index); setSelectedSpecialMediaIndex(null) }
  function selectSpecialMedia(sectionId: string, mediaIndex: number) {
    const section = project.sections.find(item => item.id === sectionId)
    setSelectedId(sectionId)
    setSelectedBoxId('')
    setSelectedSpecialMediaIndex(mediaIndex)
    const timelineItemIndex = section?.type === 'timeline' && section.items.length ? Math.min(mediaIndex === 0 ? 0 : mediaIndex - 1, section.items.length - 1) : null
    setSelectedItemIndex(section?.type === 'timeline' ? timelineItemIndex : mediaIndex)
    setLeftTab('images')
  }
  function clearTimelineMedia(sectionId: string, mediaIndex: number) {
    commit(draft => {
      const section = draft.sections.find(item => item.id === sectionId)
      if (!section || section.type !== 'timeline') return
      section.mediaIds = normalizeReferenceMediaSlots('timeline', section.items, section.mediaIds)
      section.mediaIds[mediaIndex] = ''
    })
    setSelectedSpecialMediaIndex(mediaIndex)
    setToast('이 이미지 자리의 연결을 해제했습니다.')
  }
  function setTimelineHeroVisible(sectionId: string, visible: boolean) {
    commit(draft => {
      const section = draft.sections.find(item => item.id === sectionId)
      if (!section || section.type !== 'timeline') return
      section.timelineHeroVisible = visible
    })
    setToast(visible ? '히어로 이미지 영역을 다시 추가했습니다.' : '히어로 이미지 영역을 삭제했습니다.')
  }
  function updateLayoutBox(sectionId: string, boxId: string, patch: Partial<BlockBox>) { commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section) return; section.layoutBoxes = normalizeLayoutBoxes(section).map(box => box.id === boxId ? { ...box, ...patch } : box) }, true) }
  function addLayoutBox(sectionId: string, kind: 'text' | 'image') { let boxId = ''; commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section) return; const boxes = normalizeLayoutBoxes(section); const bottom = Math.max(...boxes.map(box => box.row + box.rowSpan), 1); const imageFlow = section.type === 'image'; const next: BlockBox = imageFlow
      ? { id: crypto.randomUUID(), kind, column: 1, row: bottom + 1, columnSpan: 12, rowSpan: kind === 'text' ? 4 : 6, zIndex: Math.max(...boxes.map(box => box.zIndex), 0) + 1, eyebrow: kind === 'text' ? 'Category Label' : undefined, title: kind === 'text' ? '제목' : undefined, text: kind === 'text' ? '본문' : undefined, assetIds: kind === 'image' ? [] : undefined }
      : { id: crypto.randomUUID(), kind, column: kind === 'text' ? 2 : 7, row: bottom + 1, columnSpan: 5, rowSpan: kind === 'text' ? 3 : 5, zIndex: Math.max(...boxes.map(box => box.zIndex), 0) + 1, text: kind === 'text' ? '새 텍스트를 입력하세요.' : undefined, assetIds: kind === 'image' ? [] : undefined }
    section.layoutBoxes = [...boxes, next]; boxId = next.id }); if (boxId) { setSelectedId(sectionId); setSelectedBoxId(boxId); setToast(kind === 'text' ? '텍스트 카드를 추가했습니다.' : '이미지 카드를 추가했습니다.') } }
  function deleteLayoutBox(sectionId: string, boxId: string) {
    let deleted = false
    commit(draft => {
      const section = draft.sections.find(item => item.id === sectionId)
      if (!section || (section.type !== 'image' && (boxId === 'content' || boxId === 'media'))) return
      const boxes = normalizeLayoutBoxes(section)
      if (!boxes.some(box => box.id === boxId)) return
      if (boxId === 'content' || boxId === 'media') {
        section.removedLayoutBoxIds = [...new Set([...(section.removedLayoutBoxIds || []), boxId])]
      } else {
        section.layoutBoxes = boxes.filter(box => box.id !== boxId)
      }
      deleted = true
    })
    if (!deleted) return
    setSelectedBoxId('')
    setToast('카드를 삭제했습니다.')
  }
  function moveImageFlowBox(sectionId: string, boxId: string, direction: -1 | 1) { commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section || (section.type !== 'image' && section.type !== 'text')) return; const boxes = normalizeLayoutBoxes(section).filter(box => section.type === 'image' || box.kind === 'content' || box.kind === 'text').slice().sort((a, b) => a.row - b.row || a.column - b.column); const index = boxes.findIndex(box => box.id === boxId); const target = index + direction; if (index < 0 || target < 0 || target >= boxes.length) return; [boxes[index], boxes[target]] = [boxes[target], boxes[index]]; let row = 1; section.layoutBoxes = boxes.map((box, order) => { const rowSpan = box.kind === 'content' || box.kind === 'text' ? 4 : 6; const next = { ...box, column: 1, row, columnSpan: 12, rowSpan, zIndex: order + 1 }; row += rowSpan + 1; return next }) }); setToast(direction < 0 ? '카드를 위로 옮겼습니다.' : '카드를 아래로 옮겼습니다.') }
  const isItemPreset = (type: SectionType) => ITEM_PRESET_TYPES.has(type)
  const newPresetItem = (type: SectionType) => type === 'offer' ? '새 특전 또는 조건' : type === 'caption-grid' ? '제목 | 설명' : type === 'menu-zigzag' ? '제목 | 본문' : type === 'timeline' ? '00:00 | 새 일정 | 설명을 입력하세요.' : type === 'hero-cover' ? '새 강조 뱃지' : type === 'route-bar' ? '새 경유지' : type === 'option-grid' ? '새 선택 옵션' : type === 'vs-compare' ? '키워드 | 옵션 제목 | 옵션 설명을 입력하세요.' : type === 'service-bar' ? '서비스 설명을 입력하세요. | 핵심 키워드' : '새 핵심 내용'
  const newCaptionGridRow = () => [newPresetItem('caption-grid'), newPresetItem('caption-grid')]
  const newIconCard = (): IconCardItem => ({ id: crypto.randomUUID(), icon: 'sparkles', title: '새 카드 제목', body: '짧은 설명을 입력하세요.', tone: 'teal' })
  const cloneIconCard = (card: IconCardItem): IconCardItem => ({ ...deepCopy(card), id: crypto.randomUUID() })
  function addPresetItem(sectionId: string) {
    let index = -1
    let addedCaptionGridRow = false
    commit(draft => {
      const section = draft.sections.find(item => item.id === sectionId)
      if (!section || !isItemPreset(section.type)) return
      if (section.type === 'table') {
        const headers = section.tableHeaders?.length ? section.tableHeaders : ['구분', '내용']
        const rows = section.tableRows || []
        section.tableRows = [...rows, headers.map((_, column) => column === 0 ? nextDayLabel(rows) : '')]
        index = section.tableRows.length - 1
      } else if (section.type === 'icon-card') {
        section.iconCards = [...(section.iconCards || []), newIconCard()]
        index = section.iconCards.length - 1
      } else {
        const previousItems = section.items
        if (section.type === 'caption-grid') {
          section.items = [...previousItems, ...newCaptionGridRow()]
          section.mediaIds = [...normalizeReferenceMediaSlots(section.type, previousItems, section.mediaIds), '', '']
          index = previousItems.length
          addedCaptionGridRow = true
        } else {
          section.items = [...previousItems, newPresetItem(section.type)]
          index = section.items.length - 1
          if (section.type === 'menu-zigzag') section.menuItemReversed = [...previousItems.map((_, itemIndex) => Boolean(section.menuItemReversed?.[itemIndex])), false]
          if (REFERENCE_LAYOUT_TYPES.has(section.type)) section.mediaIds = normalizeReferenceMediaSlots(section.type, section.items, section.mediaIds)
        }
      }
    })
    if (index >= 0) {
      selectSectionItem(sectionId, index)
      setToast(addedCaptionGridRow ? '이미지 2개를 한 행으로 추가했습니다.' : '항목을 추가했습니다.')
    }
  }
  function addTimelineDay(sectionId: string) { let index = -1; let day = 0; commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section || section.type !== 'timeline') return; const previousItems = section.items; const dayStarts = section.timelineDayStarts?.length ? [...section.timelineDayStarts] : [0]; section.items = [...previousItems, newPresetItem('timeline')]; index = section.items.length - 1; section.timelineDayStarts = [...dayStarts, index]; section.mediaIds = [...normalizeReferenceMediaSlots('timeline', previousItems, section.mediaIds), '']; day = section.timelineDayStarts.length }); if (index >= 0) { selectSectionItem(sectionId, index); setToast(`${day}일차를 추가했습니다.`) } }
  function deleteTimelineDay(sectionId: string, dayIndex: number) {
    let nextIndex: number | null = null
    commit(draft => {
      const section = draft.sections.find(item => item.id === sectionId)
      if (!section || section.type !== 'timeline') return
      const starts = section.timelineDayStarts?.length ? [...section.timelineDayStarts] : []
      if (starts.length <= 1 || dayIndex < 0 || dayIndex >= starts.length) return
      const start = starts[dayIndex]
      const end = starts[dayIndex + 1] ?? section.items.length
      const removedCount = end - start
      section.mediaIds = normalizeReferenceMediaSlots('timeline', section.items, section.mediaIds)
      section.items.splice(start, removedCount)
      section.mediaIds.splice(start + 1, removedCount)
      section.timelineDayStarts = starts.filter((_, index) => index !== dayIndex).map(value => value > start ? value - removedCount : value)
      nextIndex = section.items.length ? Math.min(start, section.items.length - 1) : null
    })
    if (nextIndex !== null) selectSectionItem(sectionId, nextIndex)
    setSelectedSpecialMediaIndex(null)
    setToast(`${dayIndex + 1}일차를 삭제했습니다.`)
  }
  function insertPresetItem(sectionId: string, index: number, placement: 'above' | 'below') {
    let nextIndex = -1
    let addedCaptionGridRow = false
    commit(draft => {
      const section = draft.sections.find(item => item.id === sectionId)
      if (!section || !isItemPreset(section.type)) return
      const insertAt = section.type === 'caption-grid'
        ? Math.max(0, Math.floor(index / 2) * 2 + (placement === 'below' ? 2 : 0))
        : Math.max(0, index + (placement === 'below' ? 1 : 0))
      if (section.type === 'table') {
        const headers = section.tableHeaders?.length ? section.tableHeaders : ['구분', '내용']
        const rows = section.tableRows || []
        section.tableRows = [...rows.slice(0, insertAt), headers.map((_, column) => column === 0 ? nextDayLabel(rows) : ''), ...rows.slice(insertAt)]
        nextIndex = insertAt
      } else if (section.type === 'icon-card') {
        const cards = section.iconCards || []
        section.iconCards = [...cards.slice(0, insertAt), newIconCard(), ...cards.slice(insertAt)]
        nextIndex = insertAt
      } else {
        const previousItems = section.items
        const previousReversed = previousItems.map((_, itemIndex) => Boolean(section.menuItemReversed?.[itemIndex]))
        section.mediaIds = REFERENCE_LAYOUT_TYPES.has(section.type) ? normalizeReferenceMediaSlots(section.type, previousItems, section.mediaIds) : section.mediaIds
        const insertedItems = section.type === 'caption-grid' ? newCaptionGridRow() : [newPresetItem(section.type)]
        section.items = [...previousItems.slice(0, insertAt), ...insertedItems, ...previousItems.slice(insertAt)]
        if (section.type === 'menu-zigzag') section.menuItemReversed = [...previousReversed.slice(0, insertAt), false, ...previousReversed.slice(insertAt)]
        if (section.type === 'timeline') section.timelineDayStarts = (section.timelineDayStarts || []).map(start => start > insertAt ? start + 1 : start)
        if (REFERENCE_LAYOUT_TYPES.has(section.type)) {
          const slot = referenceMediaSlot(section.type, insertAt)
          if (slot >= 0) section.mediaIds.splice(slot, 0, ...insertedItems.map(() => ''))
          section.mediaIds = normalizeReferenceMediaSlots(section.type, section.items, section.mediaIds)
        }
        nextIndex = insertAt
        addedCaptionGridRow = section.type === 'caption-grid'
      }
    })
    if (nextIndex >= 0) {
      selectSectionItem(sectionId, nextIndex)
      setToast(addedCaptionGridRow ? `${placement === 'above' ? '위에' : '아래에'} 이미지 2개를 한 행으로 추가했습니다.` : placement === 'above' ? '위에 항목을 추가했습니다.' : '아래에 항목을 추가했습니다.')
    }
  }
  function duplicatePresetItem(sectionId: string, index: number) { let nextIndex = -1; commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section || !isItemPreset(section.type)) return; const insertAt = index + 1; if (section.type === 'table') { const rows = section.tableRows || []; const row = rows[index]; if (!row) return; section.tableRows = [...rows.slice(0, insertAt), [...row], ...rows.slice(insertAt)]; nextIndex = insertAt } else if (section.type === 'icon-card') { const cards = section.iconCards || []; const card = cards[index]; if (!card) return; section.iconCards = [...cards.slice(0, insertAt), cloneIconCard(card), ...cards.slice(insertAt)]; nextIndex = insertAt } else { const value = section.items[index]; if (value === undefined) return; const reversed = section.items.map((_, itemIndex) => Boolean(section.menuItemReversed?.[itemIndex])); section.mediaIds = REFERENCE_LAYOUT_TYPES.has(section.type) ? normalizeReferenceMediaSlots(section.type, section.items, section.mediaIds) : section.mediaIds; section.items = [...section.items.slice(0, insertAt), value, ...section.items.slice(insertAt)]; if (section.type === 'menu-zigzag') section.menuItemReversed = [...reversed.slice(0, insertAt), reversed[index], ...reversed.slice(insertAt)]; if (section.type === 'timeline') section.timelineDayStarts = (section.timelineDayStarts || []).map(start => start > index ? start + 1 : start); if (REFERENCE_LAYOUT_TYPES.has(section.type)) { const slot = referenceMediaSlot(section.type, index); if (slot >= 0) section.mediaIds.splice(slot + 1, 0, section.mediaIds[slot] || ''); section.mediaIds = normalizeReferenceMediaSlots(section.type, section.items, section.mediaIds) } nextIndex = insertAt } }); if (nextIndex >= 0) { selectSectionItem(sectionId, nextIndex); setToast('항목을 복제했습니다.') } }
  function updatePresetItem(sectionId: string, index: number, value: string | string[] | Partial<IconCardItem>) { commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section) return; if (section.type === 'table' && Array.isArray(value)) section.tableRows = (section.tableRows || []).map((row, rowIndex) => rowIndex === index ? value : row); else if (section.type === 'icon-card' && !Array.isArray(value) && typeof value !== 'string') section.iconCards = (section.iconCards || []).map((card, itemIndex) => itemIndex === index ? { ...card, ...value } : card); else if (typeof value === 'string') section.items = section.items.map((item, itemIndex) => itemIndex === index ? value : item) }, true) }
  function movePresetItem(sectionId: string, index: number, direction: -1 | 1) { commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section || !isItemPreset(section.type)) return; const values = section.type === 'table' ? section.tableRows || [] : section.type === 'icon-card' ? section.iconCards || [] : section.items; const target = index + direction; if (target < 0 || target >= values.length) return; [values[index], values[target]] = [values[target], values[index]]; if (section.type === 'table') section.tableRows = [...values as string[][]]; else if (section.type === 'icon-card') section.iconCards = [...values as IconCardItem[]]; else { section.items = [...values as string[]]; if (section.type === 'menu-zigzag') { const reversed = section.items.map((_, itemIndex) => Boolean(section.menuItemReversed?.[itemIndex])); [reversed[index], reversed[target]] = [reversed[target], reversed[index]]; section.menuItemReversed = reversed } if (REFERENCE_LAYOUT_TYPES.has(section.type)) { section.mediaIds = normalizeReferenceMediaSlots(section.type, values as string[], section.mediaIds); const fromSlot = referenceMediaSlot(section.type, index); const targetSlot = referenceMediaSlot(section.type, target); if (fromSlot >= 0 && targetSlot >= 0) [section.mediaIds[fromSlot], section.mediaIds[targetSlot]] = [section.mediaIds[targetSlot], section.mediaIds[fromSlot]] } } }); setSelectedItemIndex(Math.max(0, index + direction)); setSelectedSpecialMediaIndex(null) }
  function reorderIconCard(sectionId: string, fromIndex: number, insertionIndex: number) { let nextIndex = fromIndex; commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section || section.type !== 'icon-card') return; const cards = [...(section.iconCards || [])]; const [card] = cards.splice(fromIndex, 1); if (!card) return; const target = Math.max(0, Math.min(insertionIndex, cards.length + 1)); nextIndex = fromIndex < target ? target - 1 : target; cards.splice(nextIndex, 0, card); section.iconCards = cards }); selectSectionItem(sectionId, nextIndex); setToast('카드 위치를 변경했습니다.') }
  function toggleMenuItemLayout(sectionId: string, index: number) { commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section || section.type !== 'menu-zigzag') return; const layout = section.items.map((_, itemIndex) => Boolean(section.menuItemReversed?.[itemIndex])); layout[index] = !layout[index]; section.menuItemReversed = layout }); setToast('이미지와 텍스트 위치를 반전했습니다.') }
  function deletePresetItem(sectionId: string, index: number) { let nextIndex: number | null = null; commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section || !isItemPreset(section.type)) return; if (section.type === 'table') { const rows = (section.tableRows || []).filter((_, rowIndex) => rowIndex !== index); section.tableRows = rows; nextIndex = rows.length ? Math.min(index, rows.length - 1) : null } else if (section.type === 'icon-card') { const cards = (section.iconCards || []).filter((_, itemIndex) => itemIndex !== index); section.iconCards = cards; nextIndex = cards.length ? Math.min(index, cards.length - 1) : null } else { const previousItems = section.items; const reversed = previousItems.map((_, itemIndex) => Boolean(section.menuItemReversed?.[itemIndex])); section.mediaIds = REFERENCE_LAYOUT_TYPES.has(section.type) ? normalizeReferenceMediaSlots(section.type, previousItems, section.mediaIds) : section.mediaIds; if (REFERENCE_LAYOUT_TYPES.has(section.type)) { const slot = referenceMediaSlot(section.type, index); if (slot >= 0) section.mediaIds.splice(slot, 1) } const items = previousItems.filter((_, itemIndex) => itemIndex !== index); section.items = items; if (section.type === 'menu-zigzag') section.menuItemReversed = reversed.filter((_, itemIndex) => itemIndex !== index); if (section.type === 'timeline') section.timelineDayStarts = timelineDayStartsAfterItemRemoval(section.timelineDayStarts?.length ? section.timelineDayStarts : [0], previousItems.length, index); nextIndex = items.length ? Math.min(index, items.length - 1) : null } }); setSelectedItemIndex(nextIndex); setSelectedSpecialMediaIndex(null); setToast('항목을 삭제했습니다.') }
  function createContentGroup(sectionIds: string[]) {
    commit(draft => {
      const orderedIds = draft.sections.filter(section => sectionIds.includes(section.id)).map(section => section.id)
      const indexes = orderedIds.map(id => draft.sections.findIndex(section => section.id === id))
      const consecutive = indexes.length >= 2 && indexes.every((index, position) => position === 0 || index === indexes[position - 1] + 1)
      if (!consecutive) return
      const retained = removeSectionsFromGroups(draft.contentGroups, orderedIds, draft.sections)
      draft.contentGroups = [...retained, { id: crypto.randomUUID(), name: `콘텐츠 그룹 ${retained.length + 1}`, sectionIds: orderedIds, collapsed: false }]
    })
    setToast('선택한 블록을 콘텐츠 그룹으로 묶었습니다.')
  }
  function updateContentGroup(id: string, patch: Partial<ContentGroup>) { commit(draft => { draft.contentGroups = normalizeContentGroups((draft.contentGroups || []).map(group => group.id === id ? { ...group, ...patch } : group), draft.sections) }) }
  function ungroupContent(id: string) { commit(draft => { draft.contentGroups = (draft.contentGroups || []).filter(group => group.id !== id) }); setToast('콘텐츠 그룹을 해제했습니다.') }
  function moveContentGroup(id: string, direction: -1 | 1) {
    commit(draft => {
      const group = (draft.contentGroups || []).find(item => item.id === id)
      if (!group) return
      draft.sections = moveSectionUnit(draft.sections, draft.contentGroups, group.sectionIds[0], direction)
      draft.contentGroups = normalizeContentGroups(draft.contentGroups, draft.sections)
    })
  }
  function moveSection(id: string, direction: -1 | 1) { commit(draft => { draft.sections = moveSectionUnit(draft.sections, draft.contentGroups, id, direction); draft.contentGroups = normalizeContentGroups(draft.contentGroups, draft.sections) }) }
  function reorderSection(sourceId: string, targetId: string, placement: 'before' | 'after', forceGroupUnit = false) {
    commit(draft => {
      draft.sections = reorderSectionUnit(draft.sections, draft.contentGroups, sourceId, targetId, placement, forceGroupUnit)
      draft.contentGroups = normalizeContentGroups(draft.contentGroups, draft.sections)
    })
  }
  function duplicateSection(id: string) { let newId = ''; commit(draft => { const index = draft.sections.findIndex(s => s.id === id); if (index < 0) return; const copy = deepCopy(draft.sections[index]); copy.id = crypto.randomUUID(); copy.title += ' 복사본'; newId = copy.id; draft.sections.splice(index + 1, 0, copy); draft.contentGroups = normalizeContentGroups(draft.contentGroups, draft.sections) }); setSelectedId(newId) }
  function deleteSection(id: string) { commit(draft => { draft.sections = draft.sections.filter(s => s.id !== id); draft.contentGroups = removeSectionsFromGroups(draft.contentGroups, [id], draft.sections) }); focusSection(project.sections.find(s => s.id !== id)) }
  function requestImageUpload(target: ImageTarget = null) { if (selected && REFERENCE_LAYOUT_TYPES.has(selected.type) && selectedSpecialMediaIndex === null) { setImageTarget(null); imageRef.current?.click(); return } setImageTarget(target); imageRef.current?.click() }
  function attachAssetToBox(section: Section, boxId: string | undefined, assetId: string, replaceAssetId?: string) {
    const boxes = normalizeLayoutBoxes(section)
    const targetBox = boxes.find(box => box.id === boxId && (box.kind === 'media' || box.kind === 'image')) || boxes.find(box => box.kind === 'media' || box.kind === 'image')
    if (!targetBox) return
    const nextIds = replaceAssetId
      ? targetBox.assetIds?.map(id => id === replaceAssetId ? assetId : id) || [assetId]
      : uniqueIds([...(targetBox.assetIds || []), assetId])
    const nextBoxes = boxes.map(box => box.id === targetBox.id ? { ...box, assetIds: nextIds } : box)
    section.layoutBoxes = nextBoxes
    section.mediaIds = mediaIdsFromBoxes(nextBoxes)
    if (section.mediaLayout === 'custom') {
      const renamed = (section.mediaLayoutItems || []).map(entry => replaceAssetId && entry.assetId === replaceAssetId ? { ...entry, assetId } : entry)
      section.mediaLayoutItems = normalizeCustomLayout(section.mediaIds, renamed)
    }
  }
  async function addImages(files: FileList | null, target: ImageTarget = null) {
    if (!files?.length) return
    const validFiles = Array.from(files).filter(file => {
      if (!file.type.startsWith('image/')) { setToast(`${file.name}: 이미지 파일이 아닙니다.`); return false }
      if (file.size > 15_000_000) { setToast(`${file.name}: 15MB 이하 파일만 가능합니다.`); return false }
      return true
    })
    const readFile = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('FILE_READ_FAILED')); reader.readAsDataURL(file) })
    let connected = false
    for (const file of validFiles) {
      try {
        const src = await readFile(file)
        const asset: MediaAsset = { id: crypto.randomUUID(), name: file.name, src, provider: 'provided', sourceId: '', assetStage: 'original', usageScope: '내일스패셜 상세페이지', rightsStatus: 'unknown', qualityGrade: 'B', approval: 'pending', evidence: '', alt: '' }
        const activeTarget = imageTargetIsCurrent(target) ? target : null
        commit(draft => {
          draft.assets.push(asset)
          if (!activeTarget?.sectionId) return
          const section = draft.sections.find(item => item.id === activeTarget.sectionId)
          if (!section) return
          if (REFERENCE_LAYOUT_TYPES.has(section.type) && activeTarget.specialMediaIndex !== undefined) {
            // A reference slot deliberately accepts one image. Keep later files in the library.
            if (!connected) { section.mediaIds = normalizeReferenceMediaSlots(section.type, section.items, section.mediaIds); section.mediaIds[activeTarget.specialMediaIndex] = asset.id }
            return
          }
          attachAssetToBox(section, activeTarget.boxId, asset.id, connected ? undefined : activeTarget.replaceAssetId)
        })
        connected = connected || Boolean(activeTarget?.sectionId)
      } catch { setToast(`${file.name}: 이미지를 읽지 못했습니다.`) }
    }
    const targetSection = target?.sectionId ? project.sections.find(section => section.id === target.sectionId) : undefined
    if (target?.sectionId && validFiles.length) setToast(targetSection && REFERENCE_LAYOUT_TYPES.has(targetSection.type) && validFiles.length > 1 ? '첫 이미지를 선택 자리에 연결하고, 나머지는 라이브러리에 추가했습니다.' : '선택 이미지 박스에 추가했습니다.')
    else if (validFiles.length) setLeftTab('images')
  }
  function connectAsset(assetId: string) { if (!selected) { setToast('먼저 캔버스의 블록을 선택하세요.'); return } if (REFERENCE_LAYOUT_TYPES.has(selected.type)) { if (selectedSpecialMediaIndex === null) { setToast('가운데 캔버스에서 연결할 이미지를 먼저 선택하세요.'); return } const slot = selectedSpecialMediaIndex; const removing = selected.mediaIds[slot] === assetId; commit(draft => { const section = draft.sections.find(item => item.id === selected.id); if (!section) return; section.mediaIds = normalizeReferenceMediaSlots(section.type, section.items, section.mediaIds); section.mediaIds[slot] = removing ? '' : assetId }); setToast(removing ? '선택 이미지 연결을 해제했습니다.' : '선택 이미지 자리에 연결했습니다.'); return }
    const target = selectedBox && (selectedBox.kind === 'media' || selectedBox.kind === 'image') ? selectedBox : normalizeLayoutBoxes(selected).find(box => box.kind === 'media'); if (!target) return; const connected = target.assetIds || []; const removing = connected.includes(assetId); commit(draft => { const section = draft.sections.find(item => item.id === selected.id); if (!section) return; const boxes = normalizeLayoutBoxes(section); const updatedBoxes = boxes.map(box => box.id === target.id ? { ...box, assetIds: removing ? (box.assetIds || []).filter(id => id !== assetId) : uniqueIds([...(box.assetIds || []), assetId]) } : box); section.layoutBoxes = updatedBoxes; section.mediaIds = mediaIdsFromBoxes(updatedBoxes); if (section.mediaLayout === 'custom') section.mediaLayoutItems = normalizeCustomLayout(section.mediaIds, section.mediaLayoutItems) }); setToast(removing ? '선택 이미지 박스에서 연결을 해제했습니다.' : '선택 이미지 박스에 연결했습니다.') }
  function clearUnusedAssets() {
    const linkedAssetIds = new Set(canvasLinkedAssetIds(project.sections))
    const removableAssets = project.assets.filter(asset => !linkedAssetIds.has(asset.id))
    if (!removableAssets.length) { setToast('삭제할 미연결 이미지가 없습니다.'); return }
    if (!window.confirm(`가운데 캔버스에 연결되지 않은 이미지 ${removableAssets.length}개를 모두 삭제할까요?\n이 작업은 실행 취소할 수 없습니다.`)) return
    const removableIds = new Set(removableAssets.map(asset => asset.id))
    commit(draft => { draft.assets = draft.assets.filter(asset => !removableIds.has(asset.id)) })
    setToast(`미연결 이미지 ${removableAssets.length}개를 삭제했습니다.`)
  }
  async function addImageUrl(rawUrl: string, target: ImageTarget = selected ? { sectionId: selected.id, boxId: selectedBox?.kind === 'media' || selectedBox?.kind === 'image' ? selectedBox.id : 'media', specialMediaIndex: REFERENCE_LAYOUT_TYPES.has(selected.type) ? selectedSpecialMediaIndex ?? undefined : undefined } : null) {
    // Without a selected reference slot, images are still useful in the library.
    if (selected && REFERENCE_LAYOUT_TYPES.has(selected.type) && selectedSpecialMediaIndex === null) target = null
    let url: URL
    try { url = new URL(rawUrl.trim()); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('INVALID_URL') } catch { setToast('http 또는 https 이미지 URL을 입력하세요.'); return }
    try { await new Promise<void>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(new Error('IMAGE_LOAD_FAILED')); image.src = url.href }); const fileName = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || url.hostname); const asset: MediaAsset = { id: crypto.randomUUID(), name: fileName, src: url.href, provider: 'provided', sourceId: '', assetStage: 'reference', usageScope: '내일스패셜 상세페이지', rightsStatus: 'unknown', qualityGrade: 'B', approval: 'pending', evidence: '', alt: '' }; const activeTarget = imageTargetIsCurrent(target) ? target : null; commit(draft => { draft.assets.push(asset); const section = activeTarget?.sectionId ? draft.sections.find(item => item.id === activeTarget.sectionId) : undefined; if (section) { if (REFERENCE_LAYOUT_TYPES.has(section.type) && activeTarget?.specialMediaIndex !== undefined) { section.mediaIds = normalizeReferenceMediaSlots(section.type, section.items, section.mediaIds); section.mediaIds[activeTarget.specialMediaIndex] = asset.id; return }
      attachAssetToBox(section, activeTarget?.boxId, asset.id, activeTarget?.replaceAssetId) } }); setToast(activeTarget?.sectionId ? activeTarget?.specialMediaIndex !== undefined ? '선택 이미지 자리에 URL을 연결했습니다.' : activeTarget?.replaceAssetId ? 'URL 이미지를 교체했습니다.' : 'URL 이미지를 선택 이미지 박스에 추가했습니다.' : target?.sectionId ? '이미지 칸 선택이 바뀌어 라이브러리에만 추가했습니다.' : 'URL 이미지를 라이브러리에 추가했습니다.') } catch { setToast('이미지를 불러오지 못했습니다. 직접 접근 가능한 이미지 URL인지 확인하세요.') }
  }
  async function addGettyImage(rawContentId: string): Promise<boolean> {
    const contentId = rawContentId.trim()
    if (!/^\d+$/.test(contentId)) { setToast('Getty 콘텐츠 번호는 숫자만 입력하세요.'); return false }
    const existing = project.assets.find(asset => asset.provider === 'getty' && asset.sourceId === contentId)
    if (existing) { setToast('이미지 라이브러리에 이미 추가된 Getty 콘텐츠 번호입니다.'); return true }
    const lookup = window.naeilSpecialDesktop?.lookupGettyContent
    if (!lookup) { setToast('Getty 번호 조회는 설치형 앱에서 사용할 수 있습니다.'); return false }
    let result: GettyLookupResult
    try { result = await lookup(contentId) } catch { setToast('Getty 공개 페이지를 조회하지 못했습니다. 잠시 후 다시 시도하세요.'); return false }
    if (result.status !== 'found') { setToast(result.errorMessage || 'Getty 콘텐츠 번호를 찾지 못했습니다.'); return false }
    if (!result.thumbUrl) { setToast('상세 페이지는 찾았지만 공개 미리보기 이미지를 확인하지 못했습니다.'); return false }
    const asset: MediaAsset = {
      id: crypto.randomUUID(), name: result.title || `Getty ${result.contentId}`, src: result.thumbUrl,
      provider: 'getty', sourceId: result.contentId, assetStage: 'reference', usageScope: '내일스패셜 상세페이지',
      rightsStatus: 'unknown', qualityGrade: 'B', approval: 'pending', evidence: result.pageUrl, alt: result.title || '',
    }
    commit(draft => { if (!draft.assets.some(item => item.provider === 'getty' && item.sourceId === result.contentId)) draft.assets.push(asset) })
    setLeftTab('images')
    setToast('Getty 미리보기 이미지를 라이브러리에 추가했습니다.')
    return true
  }
  function setSectionLayout(sectionId: string, layout: Section['mediaLayout']) { commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section) return; section.mediaLayout = layout; if (layout === 'custom') section.mediaLayoutItems = normalizeCustomLayout(section.mediaIds, section.mediaLayoutItems?.length ? section.mediaLayoutItems : createCustomLayout(section.mediaIds)) }); setToast(layout === 'custom' ? '직접 배치 모드로 전환했습니다.' : '이미지 레이아웃을 변경했습니다.') }
  function updateSectionLayoutItem(sectionId: string, assetId: string, patch: Partial<MediaLayoutItem>) { commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section) return; section.mediaLayout = 'custom'; section.mediaLayoutItems = patchLayoutItem(normalizeCustomLayout(section.mediaIds, section.mediaLayoutItems), assetId, patch) }) }
  function applySectionLayoutPreset(sectionId: string, items: MediaLayoutItem[]) { commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section) return; section.mediaLayout = 'custom'; section.mediaLayoutItems = normalizeCustomLayout(section.mediaIds, items) }); setToast('비율 기반 레이아웃을 적용했습니다.') }
  function addLibraryMediaToBox(sectionId: string, boxId: string, assetId: string) {
    commit(draft => {
      const section = draft.sections.find(item => item.id === sectionId)
      if (!section) return
      attachAssetToBox(section, boxId, assetId)
    })
    selectSectionBox(sectionId, boxId)
    setToast('라이브러리 이미지를 선택 이미지 박스에 추가했습니다.')
  }
  function swapSectionMedia(sectionId: string, fromAssetId: string, toAssetId: string) {
    if (fromAssetId === toAssetId) return
    let replacedFromLibrary = false
    commit(draft => {
      const section = draft.sections.find(item => item.id === sectionId)
      if (!section) return
      const boxes = normalizeLayoutBoxes(section)
      const targetBox = boxes.find(box => (box.kind === 'media' || box.kind === 'image') && (box.assetIds || []).includes(toAssetId))
      if (!targetBox) return
      const targetIds = targetBox.assetIds || []
      replacedFromLibrary = !targetIds.includes(fromAssetId)
      const nextIds = replacedFromLibrary
        ? uniqueIds(targetIds.map(id => id === toAssetId ? fromAssetId : id))
        : targetIds.map(id => id === fromAssetId ? toAssetId : id === toAssetId ? fromAssetId : id)
      const nextBoxes = boxes.map(box => box.id === targetBox.id ? { ...box, assetIds: nextIds } : box)
      const beforeLayout = normalizeCustomLayout(section.mediaIds, section.mediaLayoutItems)
      section.layoutBoxes = nextBoxes
      section.mediaIds = mediaIdsFromBoxes(nextBoxes)
      if (section.mediaLayout === 'custom') {
        if (replacedFromLibrary) {
          const renamed = beforeLayout.map(entry => entry.assetId === toAssetId ? { ...entry, assetId: fromAssetId } : entry)
          section.mediaLayoutItems = normalizeCustomLayout(section.mediaIds, renamed)
        } else {
          section.mediaLayoutItems = normalizeCustomLayout(section.mediaIds, swapCustomLayoutPlacements(beforeLayout, fromAssetId, toAssetId))
        }
      }
    })
    setToast(replacedFromLibrary ? '라이브러리 이미지로 교체했습니다.' : '이미지 위치를 바꿨습니다.')
  }
  function importManifest(file?: File) {
    if (!file || readOnly) return
    file.text().then(async text => {
      try {
        const isJson = file.name.toLowerCase().endsWith('.json')
        const parsed = isJson ? JSON.parse(text) : YAML.parse(text)
        const desktopFilePath = isJson ? window.naeilSpecialDesktop?.getFilePath?.(file) || '' : ''
        const seed = createSeedProject()
        if (isDirectProjectPayload(parsed)) {
          const result = migrateProject(parsed)
          await saveMigrationBackup(result)
          const direct = normalizeProject(result.project)
          if (desktopFilePath) {
            const nextFiles = { ...projectFilesRef.current, [direct.id]: desktopFilePath }
            projectFilesRef.current = nextFiles
            linkedSaveSnapshotRef.current[direct.id] = `${desktopFilePath}\n${projectLoadJson(direct)}`
            setProjectFiles(nextFiles)
            setLinkedSaveStatus('saved')
          } else {
            setLinkedSaveStatus('idle')
          }
          setHistory(h => [...h, historySnapshot(project)])
          setProject(direct)
          setSelectedId(direct.sections[0]?.id || '')
          setToast(result.migrated ? desktopFilePath ? '이전 프로젝트를 최신 형식으로 변환하고 JSON 파일을 연결했습니다.' : '이전 프로젝트를 최신 형식으로 안전하게 변환했습니다.' : desktopFilePath ? '프로젝트를 불러오고 JSON 파일을 연결했습니다.' : '프로젝트를 불러왔습니다.')
          return
        }
        const next: Project = normalizeProject({ ...seed, id: parsed.id || seed.id, name: parsed.name || seed.name, layout: parsed.layout || seed.layout, category: parsed.category || seed.category, deliveryStage: parsed.delivery_stage || seed.deliveryStage, page: { ...seed.page, ...(parsed.page || {}) }, campaign: parsed.campaign || seed.campaign, sections: (parsed.sections || []).map((s: Partial<Section>) => ({ ...makeSection(normalizeSectionType(s.type)), ...s, type: normalizeSectionType(s.type), id: s.id || crypto.randomUUID(), mediaIds: (s as unknown as { media?: string[] }).media || s.mediaIds || [], mediaLayoutItems: (s as unknown as { media_layout_items?: MediaLayoutItem[] }).media_layout_items || s.mediaLayoutItems || [], contentLayout: (s as unknown as { content_layout?: Section['contentLayout'] }).content_layout || s.contentLayout || 'text-top', layoutBoxes: (s as unknown as { layout_boxes?: BlockBox[] }).layout_boxes || s.layoutBoxes || [], tableHeaders: (s as unknown as { table_headers?: string[] }).table_headers || s.tableHeaders || [], tableRows: (s as unknown as { table_rows?: string[][] }).table_rows || s.tableRows || [], iconCards: (s as unknown as { icon_cards?: IconCardItem[] }).icon_cards || s.iconCards || [] })), assets: (parsed.media || []).map((a: Record<string, string>) => ({ id: a.id || crypto.randomUUID(), name: a.src || 'image.jpg', src: '', provider: a.provider || 'provided', sourceId: a.source_id || '', assetStage: a.asset_stage || 'reference', usageScope: a.usage_scope || '', rightsStatus: a.rights_status || 'unknown', qualityGrade: a.quality_grade || 'B', approval: a.approval || 'pending', evidence: a.evidence || '', alt: a.alt || '' })) } as Project)
        setHistory(h => [...h, historySnapshot(project)])
        setProject(next)
        setSelectedId(next.sections[0]?.id || '')
        setLinkedSaveStatus('idle')
        setToast('매니페스트를 불러왔습니다.')
      } catch (error) {
        setToast(error instanceof Error ? error.message : '파일 형식을 확인해 주세요.')
      }
    })
  }
  function newProject() { const next = createSeedProject(); setProjects(current => [next, ...current]); setProject(next); setSelectedId(''); setSelectedBoxId(''); setSelectedItemIndex(null); setSelectedSpecialMediaIndex(null); setHistory([]); setFuture([]); setLeftTab('blocks'); setToast('빈 캔버스를 만들었습니다.') }
  function openNewBlankCanvas() { if (!window.confirm('새 빈 캔버스를 시작할까요?\n현재 작업은 이 PC에 자동 저장되어 프로젝트에서 다시 열 수 있습니다.')) return; newProject() }
  function startBlankCanvas() { setLeftTab('blocks'); setBlockPickerOpen(true) }
  function startSampleProject() { const next = createSampleProject(); setProjects(current => [next, ...current]); setProject(next); setSelectedId(next.sections[0]?.id || ''); setSelectedBoxId(''); setSelectedItemIndex(null); setHistory([]); setFuture([]); setLeftTab('blocks'); setToast('편집 가능한 샘플 기획안을 열었습니다.') }
  function startTemplateProject(templateId: TemplatePresetId) { const next = createTemplateProject(templateId); setProjects(current => [next, ...current]); setProject(next); setSelectedId(next.sections[0]?.id || ''); setSelectedBoxId(''); setSelectedItemIndex(null); setSelectedSpecialMediaIndex(null); setHistory([]); setFuture([]); setLeftTab('blocks'); setToast(`${next.name}을 열었습니다.`) }
  function completeOnboarding(dontShowAgain = false) { if (dontShowAgain) localStorage.setItem(ONBOARDING_STORAGE_KEY, 'done'); setOnboardingOpen(false); setOnboardingStep(0); setLeftTab('blocks') }
  function changeOnboardingStep(step: number) { setOnboardingStep(step); if (step === 0) setLeftTab('blocks'); if (step === 2) setLeftTab('images'); if (step === 3) setLeftTab('layers') }
  function reopenOnboarding() { setHelpOpen(false); changeOnboardingStep(0); setOnboardingOpen(true) }
  async function doExport(kind: string) {
    const name = safeName(project.name); setExportOpen(false)
    if (kind === 'html') downloadText(standaloneHtml(project), `${name}.html`, 'text/html;charset=utf-8')
    if (kind === 'load-json') downloadText(projectLoadJson(project), `${name}-로드용.json`, 'application/json;charset=utf-8')
    if (kind === 'zip') {
      if (zipProgress) return
      setZipProgress({
        stage: 'downloading',
        completed: 0,
        total: project.assets.length,
        percent: 0,
        currentLabel: 'ZIP 생성 준비 중…',
      })
      try {
        const failures = await exportZip(project, progress => setZipProgress(progress))
        setToast(failures.length ? `ZIP 생성 완료 · URL 이미지 ${failures.length}개는 확인 목록을 봐주세요.` : '디자이너 전달 ZIP을 만들었습니다.')
      } catch (error) {
        const reason = error instanceof Error ? error.message : '알 수 없는 오류'
        setToast(`ZIP 생성 실패 · ${reason}`)
      } finally {
        setZipProgress(null)
      }
      return
    }
    setToast('내보내기를 완료했습니다.')
  }

  if (!ready) return <div className="loading"><div className="brand-mark brand-logo"><img src={BRAND_LOGO} alt="내일투어"/></div><p>캔버스를 준비하는 중…</p></div>
  const linkedJsonPath = projectFiles[project.id] || ''
  const savedAtLabel = savedAt?.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  const saveStatusLabel = linkedJsonPath
    ? linkedSaveStatus === 'saving'
      ? '연결 JSON 저장 중'
      : linkedSaveStatus === 'failed'
        ? '연결 JSON 자동 저장 실패'
        : savedAtLabel
          ? `연결 JSON 저장됨 ${savedAtLabel}`
          : '연결 JSON 자동 저장 준비'
    : savedAtLabel
      ? `로컬 자동 저장됨 ${savedAtLabel}`
      : '저장 준비 중'
  return <div className={`app-shell ${readOnly ? 'is-readonly' : ''} ${leftTab === 'images' ? 'image-library-expanded' : ''}`}>
    <header className="topbar">
      <div className="brand"><button className="brand-mark brand-logo" type="button" aria-label="새 빈 캔버스 열기" title="새 빈 캔버스 열기" onClick={openNewBlankCanvas}><img src={BRAND_LOGO} alt="내일투어"/></button><div><strong>내일스패셜 메이킹 스튜디오</strong><span>{readOnly ? 'Read-only handoff' : `Making studio · v${APP_VERSION}`}</span></div></div>
      <div className="project-title"><input aria-label="프로젝트 이름" value={project.name} onChange={e => commit(d => { const prevName = d.name; d.name = e.target.value; if (!d.page.title.trim() || d.page.title === prevName) d.page.title = e.target.value }, true)}/><span title={linkedJsonPath || undefined}>{saveStatusLabel}</span></div>
      <div className="toolbar-actions">
        {!readOnly && <div className="file-wrap"><button className="ghost-button" onClick={() => setFileMenuOpen(open => !open)}><Save size={16}/> 파일 <ChevronDown size={14}/></button>{fileMenuOpen && <FileMenu hasLinkedFile={Boolean(projectFiles[project.id])} onImport={() => { setFileMenuOpen(false); importRef.current?.click() }} onSave={() => { setFileMenuOpen(false); void saveProjectFile() }} onSaveAs={() => { setFileMenuOpen(false); void saveProjectFile(true) }} onClose={() => { setFileMenuOpen(false); requestAppClose() }}/>}</div>}
        <button className="icon-button mobile-only" aria-label="왼쪽 패널" onClick={() => setMobilePanel('left')}><Menu size={18}/></button>
        <button className="icon-button" aria-label="실행 취소" disabled={!history.length} onClick={undo}><Undo2 size={18}/></button>
        <button className="icon-button" aria-label="다시 실행" disabled={!future.length} onClick={redo}><Redo2 size={18}/></button>
        <div className="tour-output-actions" data-guide="output"><button className="ghost-button" onClick={() => setPreviewOpen(true)}><Eye size={16}/> 미리보기</button>
        <div className="export-wrap"><button className="primary-button" disabled={Boolean(zipProgress)} onClick={() => setExportOpen(!exportOpen)}><Download size={16}/> 내보내기 <ChevronDown size={14}/></button>{exportOpen && <ExportMenu onExport={doExport} disabled={Boolean(zipProgress)}/>}</div></div>
        <button className="icon-button mobile-only" aria-label="오른쪽 패널" onClick={() => setMobilePanel('right')}><Settings2 size={18}/></button>
      </div>
    </header>

    <aside className={`left-panel ${mobilePanel === 'left' ? 'mobile-open' : ''}`}>
      <PanelClose onClick={() => setMobilePanel(null)}/>
      <nav className="rail" aria-label="편집 도구">
        <RailButton active={leftTab === 'blocks'} label="블록" icon={<Blocks/>} onClick={() => setLeftTab('blocks')} guide="block-tab"/>
        <RailButton active={leftTab === 'images'} label="이미지" icon={<ImageIcon/>} onClick={() => setLeftTab('images')} guide="image-tab"/>
        <RailButton active={leftTab === 'layers'} label="레이어" icon={<Layers/>} onClick={() => setLeftTab('layers')} guide="layer-tab"/>
        <div className="rail-spacer"/>
        <RailButton label="도움말" icon={<CircleHelp/>} onClick={() => setHelpOpen(true)}/>
      </nav>
      <div className="library" data-guide={leftTab === 'blocks' ? 'block-library' : leftTab === 'images' ? 'image-panel' : undefined}>
        {leftTab === 'blocks' && <BlockLibrary onAdd={addSection}/>} 
        {leftTab === 'images' && <ImageLibraryWithCleanup assets={project.assets} linkedAssetIds={canvasLinkedAssetIds(project.sections)} selected={selected} selectedBox={selectedBox} selectedSpecialMediaIndex={selectedSpecialMediaIndex} onUpload={() => requestImageUpload(selected ? { sectionId: selected.id, boxId: selectedBox?.kind === 'media' || selectedBox?.kind === 'image' ? selectedBox.id : 'media', specialMediaIndex: REFERENCE_LAYOUT_TYPES.has(selected.type) ? selectedSpecialMediaIndex ?? undefined : undefined } : null)} onAddUrl={url => addImageUrl(url)} onAddGettyImage={addGettyImage} onConnect={connectAsset} onClearUnused={clearUnusedAssets}/>}
        {leftTab === 'layers' && <LayerList sections={project.sections} groups={project.contentGroups || []} selectedId={selectedId} readOnly={readOnly} onSelect={focusLayerSection} onMove={moveSection} onReorder={reorderSection} onCreateGroup={createContentGroup} onUpdateGroup={updateContentGroup} onMoveGroup={moveContentGroup} onUngroup={ungroupContent}/>} 
      </div>
    </aside>

    <main className="workspace">
      <div className="workspace-head"><span>{CANVAS_WIDTH}px PC 전용 양식 · {project.category}</span>{readOnly && <strong className="readonly-label"><Eye size={13}/> 디자이너 읽기 전용</strong>}</div>
      <div className="canvas-scroll">
        <div className="canvas-scale" style={{ width: `${CANVAS_WIDTH}px`, transform: `scale(${zoom / ZOOM_REFERENCE})`, marginBottom: `${(zoom / ZOOM_REFERENCE - 1) * 900}px` }}>
          <div ref={artboardRef} className="artboard viewport-720" data-testid="artboard" data-guide="canvas">
            <PageCover project={project} onStartBlank={startBlankCanvas} onStartSample={startSampleProject} onStartTemplate={startTemplateProject} onImport={() => importRef.current?.click()}/>
            {project.sections.map((section, index) => <SectionView key={section.id} section={section} assets={project.assets} selected={section.id === selectedId} readOnly={readOnly} activeBoxId={section.id === selectedId ? selectedBoxId : ''} activeItemIndex={section.id === selectedId ? selectedItemIndex : null} activeSpecialMediaIndex={section.id === selectedId ? selectedSpecialMediaIndex : null} index={index} total={project.sections.length} onSelect={() => focusSection(section)} onSelectBox={boxId => selectSectionBox(section.id, boxId)} onSelectItem={itemIndex => selectSectionItem(section.id, itemIndex)} onSelectSpecialMedia={mediaIndex => selectSpecialMedia(section.id, mediaIndex)} onClearTimelineMedia={clearTimelineMedia} onDeleteTimelineDay={deleteTimelineDay} onSectionChange={patch => updateSectionById(section.id, patch)} onBoxChange={(boxId, patch) => updateLayoutBox(section.id, boxId, patch)} onUpdateItem={(itemIndex, value) => updatePresetItem(section.id, itemIndex, value)} onAddFlowBox={addLayoutBox} onMoveFlowBox={moveImageFlowBox} onDeleteFlowBox={deleteLayoutBox} onAddItem={addPresetItem} onAddTimelineDay={addTimelineDay} onInsertItem={insertPresetItem} onDuplicateItem={duplicatePresetItem} onMoveItem={movePresetItem} onReorderIconCard={reorderIconCard} onDeleteItem={deletePresetItem} onToggleMenuItemLayout={toggleMenuItemLayout} onMove={moveSection} onDuplicate={duplicateSection} onDelete={deleteSection} onSwapMedia={swapSectionMedia} onAddLibraryMedia={addLibraryMediaToBox}/>) }
            <button className="add-end" data-guide="block-add" onClick={() => setBlockPickerOpen(true)}><Plus size={18}/> 다음 블록 추가</button>
          </div>
        </div>
      </div>
      <div className="statusbar"><span><span className="status-dot"/> {readOnly ? '공유 스냅샷' : linkedJsonPath ? '연결 JSON 자동 저장' : '로컬 자동 저장'}</span><span>{CANVAS_WIDTH}px 고정 · {project.sections.length}개 블록 · {project.assets.length}개 이미지</span><div className="zoom"><button aria-label="축소" onClick={() => setZoom(z => Math.max(35, z - 5))}><Minus/></button><input aria-label="확대 비율" type="range" min="35" max="120" value={zoom} onChange={e => setZoom(Number(e.target.value))}/><button aria-label="확대" onClick={() => setZoom(z => Math.min(120, z + 5))}><Plus/></button><button onClick={() => setZoom(100)}>{zoom}%</button></div></div>
    </main>

    <aside className={`right-panel ${mobilePanel === 'right' ? 'mobile-open' : ''}`}>
      <PanelClose onClick={() => setMobilePanel(null)}/>
      <Inspector project={project} selected={selected} selectedBox={selectedBox} selectedItemIndex={selectedItemIndex} updateSection={updateSection} onChangeBox={updateLayoutBox} onUpdateItem={updatePresetItem} onDeleteItem={deletePresetItem} onLayoutChange={setSectionLayout} onLayoutItemChange={updateSectionLayoutItem} onLayoutPreset={applySectionLayoutPreset}/>
    </aside>

    <input ref={imageRef} type="file" accept="image/*" multiple hidden onChange={e => { addImages(e.target.files, imageTarget); e.currentTarget.value = ''; setImageTarget(null) }}/>
    <input ref={importRef} type="file" accept=".json,.yml,.yaml" hidden onChange={e => importManifest(e.target.files?.[0])}/>
    {blockPickerOpen && <BlockPicker onClose={() => setBlockPickerOpen(false)} onSelect={addSection}/>} 
    {previewOpen && <PreviewModal project={project} onClose={() => setPreviewOpen(false)}/>}
    {zipProgress && <ZipProgressModal progress={zipProgress}/>}
    {helpOpen && <HelpDrawer version={APP_VERSION} onClose={() => setHelpOpen(false)} onReplay={reopenOnboarding} onOpenBlocks={() => { setHelpOpen(false); setLeftTab('blocks'); setBlockPickerOpen(true) }} onImport={() => { setHelpOpen(false); importRef.current?.click() }}/>}
    {onboardingOpen && <GuidedTour step={onboardingStep} onStep={changeOnboardingStep} onSkip={() => completeOnboarding(false)} onDontShowAgain={() => completeOnboarding(true)} onFinish={() => completeOnboarding(true)}/>}
    {toast && <div className="toast"><Check size={16}/>{toast}</div>}
  </div>
}

function PanelClose({ onClick }: { onClick: () => void }) { return <button className="panel-close" aria-label="패널 닫기" onClick={onClick}><X/></button> }
function RailButton({ active, label, icon, onClick, guide }: { active?: boolean; label: string; icon: React.ReactNode; onClick: () => void; guide?: string }) { return <button className={active ? 'active' : ''} data-guide={guide} onClick={onClick}>{icon}<span>{label}</span></button> }
function BlockLibrary({ onAdd }: { onAdd: (type: SectionType) => void }) { return <div className="block-groups">{GROUPS.map((group, index) => <section key={group.name || index}>{group.name && <h3>{group.name}</h3>}<div>{group.types.map(type => <button key={type} onClick={() => onAdd(type)}><BlockIcon type={type}/><span>{SECTION_LABELS[type]}</span><Plus/></button>)}</div></section>)}</div> }

const ONBOARDING_STEPS = [
  { icon: <Blocks/>, eyebrow: '01 · BLOCKS', title: '블록을 추가해 보세요', body: '텍스트, 이미지, 일정표처럼 담을 내용을 골라 캔버스에 추가하세요.', targets: ['[data-guide="block-library"]', '[data-guide="block-tab"]', '[data-guide="block-add"]'] },
  { icon: <FileText/>, eyebrow: '02 · COPY', title: '문구를 바로 고쳐 보세요', body: '카테고리 라벨, 제목, 본문을 더블클릭하면 그 자리에서 수정할 수 있습니다.', targets: ['[data-guide="copy-area"]', '[data-guide="canvas"]'] },
  { icon: <ImageIcon/>, eyebrow: '03 · IMAGE', title: '이미지를 등록해 보세요', body: '이 패널에서 내 PC의 이미지 파일을 올리거나 이미지 URL을 붙여 넣으세요. 등록한 이미지는 다른 블록에서도 다시 사용할 수 있습니다.', targets: ['[data-guide="image-panel"]', '[data-guide="image-box"]', '[data-guide="image-tab"]'] },
  { icon: <Layers/>, eyebrow: '04 · LAYERS', title: '블록 순서를 정리하세요', body: '레이어에서 블록의 순서와 묶음을 관리합니다. 위·아래 이동으로 순서를 바꾸고, 이어지는 블록은 그룹으로 묶어 보세요.', targets: ['[data-guide="layer-tab"]'] },
  { icon: <Download/>, eyebrow: '05 · OUTPUT', title: '확인한 뒤 내보내세요', body: '미리보기로 전체를 확인한 다음 독립 HTML, 로드용 JSON, 디자이너 전달 ZIP으로 내보냅니다.', targets: ['[data-guide="output"]'] },
]

function GuidedTour({ step, onStep, onSkip, onDontShowAgain, onFinish }: { step: number; onStep: (step: number) => void; onSkip: () => void; onDontShowAgain: () => void; onFinish: () => void }) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const current = ONBOARDING_STEPS[step]
  const last = step === ONBOARDING_STEPS.length - 1
  useEffect(() => {
    let target: HTMLElement | null = null
    const refreshTarget = () => {
      target = current.targets.map(selector => document.querySelector<HTMLElement>(selector)).find(Boolean) || null
      if (!target) { setTargetRect(null); return }
      target.classList.add('guided-tour-target')
      setTargetRect(target.getBoundingClientRect())
    }
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(refreshTarget))
    window.addEventListener('resize', refreshTarget)
    window.addEventListener('scroll', refreshTarget, true)
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener('resize', refreshTarget); window.removeEventListener('scroll', refreshTarget, true); target?.classList.remove('guided-tour-target') }
  }, [current])
  const popoverWidth = 330
  const centerX = targetRect ? targetRect.left + targetRect.width / 2 : window.innerWidth / 2
  const left = Math.max(16, Math.min(window.innerWidth - popoverWidth - 16, centerX - popoverWidth / 2))
  const placeAbove = Boolean(targetRect && targetRect.bottom > window.innerHeight - 250)
  const top = targetRect ? Math.max(16, placeAbove ? targetRect.top - 222 : targetRect.bottom + 16) : Math.max(80, window.innerHeight / 2 - 150)
  const spotlightStyle = targetRect ? { left: targetRect.left - 6, top: targetRect.top - 6, width: targetRect.width + 12, height: targetRect.height + 12 } : undefined
  return <div className="guided-tour" role="presentation"><div className="guided-tour-shade"/>{targetRect && <div className="guided-tour-spotlight" style={spotlightStyle}/>}<section className={`guided-tour-card ${placeAbove ? 'above' : ''}`} style={{ left, top }} role="dialog" aria-modal="true" aria-labelledby="onboarding-title"><header><div><p>{current.eyebrow}</p><h2 id="onboarding-title">{current.title}</h2></div><button className="icon-button" aria-label="안내 건너뛰기" onClick={onSkip}><X/></button></header><div className="guided-tour-progress" aria-label={`${step + 1} / ${ONBOARDING_STEPS.length} 단계`}>{ONBOARDING_STEPS.map((item, index) => <span key={item.eyebrow} className={index === step ? 'active' : index < step ? 'done' : ''}>{String(index + 1).padStart(2, '0')}</span>)}</div><article><i>{current.icon}</i><p>{current.body}</p></article><footer><button className="subtle-button" onClick={onSkip}>건너뛰기</button><button className="subtle-button onboarding-hide" onClick={onDontShowAgain}>다시 보지 않기</button><div><button className="ghost-button" disabled={step === 0} onClick={() => onStep(step - 1)}>이전</button><button className="primary-button" onClick={() => last ? onFinish() : onStep(step + 1)}>{last ? '완료' : '다음'}</button></div></footer></section></div>
}

function HelpDrawer({ version, onClose, onReplay, onOpenBlocks, onImport }: { version: string; onClose: () => void; onReplay: () => void; onOpenBlocks: () => void; onImport: () => void }) {
  const guides = [
    { icon: <Blocks/>, title: '새 기획안 만들기', body: '빈 기획안에서 시작하거나, 샘플 기획안을 열어 블록을 수정하며 연습합니다.', action: '블록 고르기', onClick: onOpenBlocks },
    { icon: <ArrowLeftRight/>, title: '블록 추가·순서 변경', body: '블록은 하단의 다음 블록 추가로 넣고, 선택한 블록 위의 화살표로 순서를 바꿉니다.' },
    { icon: <FileText/>, title: '문구 수정', body: '가운데 카테고리 라벨·제목·본문을 더블클릭하면 바로 수정됩니다.' },
    { icon: <ImageIcon/>, title: '이미지 연결·교체', body: '가운데 이미지 칸을 먼저 클릭한 뒤 왼쪽 이미지 탭에서 내 PC 파일을 올리거나 이미지 URL을 붙여 넣습니다.' },
    { icon: <CalendarDays/>, title: '상세 일정 만들기', body: '상세 일정표에서는 일정 추가로 한 줄을 넣고, 일차 추가로 새로운 날짜 구간을 만듭니다.' },
    { icon: <Archive/>, title: '디자이너 전달 ZIP 만들기', body: '내보내기에서 디자이너 전달 ZIP을 선택하면 HTML, 이미지, 로드용 JSON을 한 번에 묶습니다.' },
    { icon: <FileJson/>, title: '로드 JSON 불러오기', body: '받은 프로젝트 로드 JSON 파일을 파일 > 불러오기로 열면 캔버스에 초안이 바로 표시됩니다.', action: 'JSON 불러오기', onClick: onImport },
  ]
  return <><button className="help-scrim" aria-label="도움말 닫기" onClick={onClose}/><aside className="help-drawer" role="dialog" aria-modal="true" aria-labelledby="help-title"><header><div><p>QUICK HELP</p><h2 id="help-title">작업 도움말</h2></div><button className="icon-button" aria-label="도움말 닫기" onClick={onClose}><X/></button></header><div className="help-guide-list">{guides.map(guide => <article key={guide.title}><i>{guide.icon}</i><div><b>{guide.title}</b><p>{guide.body}</p>{guide.action && <button onClick={guide.onClick}>{guide.action} <ChevronDown/></button>}</div></article>)}</div><footer><button className="ghost-button" onClick={onReplay}><CircleHelp/> 처음 안내 다시 보기</button><span>앱 버전 v{version}</span></footer></aside></>
}

function BlockPicker({ onClose, onSelect }: { onClose: () => void; onSelect: (type: SectionType) => void }) { return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="block-picker" role="dialog" aria-modal="true" aria-labelledby="block-picker-title"><header><div><p>ADD BLOCK</p><h2 id="block-picker-title">다음 블록 선택</h2></div><button aria-label="닫기" onClick={onClose}><X/></button></header><p>추가할 블록을 선택하세요. 선택한 블록은 시안의 마지막에 바로 추가됩니다.</p><div>{GROUPS.map((group, index) => <section key={group.name || index}>{group.name && <h3>{group.name}</h3>}<div className="block-picker-grid">{group.types.map(type => <button key={type} onClick={() => onSelect(type)}><BlockIcon type={type}/><span>{SECTION_LABELS[type]}</span><small>{type === 'text' ? '문단을 이어 쓰는 기본 블록' : type === 'image' ? '텍스트와 이미지를 순서대로 구성' : type === 'list' ? '일반·특전형 목록 전환' : type === 'table' ? '2~5열 일정·시상·비교표' : type === 'timeline' ? '시간과 이미지로 구성하는 상세 일정' : type === 'menu-zigzag' ? '이미지와 설명을 나란히 구성' : type === 'hero-cover' ? '배경 사진 위 제목·뱃지 커버' : type === 'route-bar' ? '가로 점선 도시 동선 + 지도' : type === 'option-grid' ? '원형 썸네일 선택형(택1) 그리드' : type === 'vs-compare' ? 'A vs B 좌우 비교 카드' : type === 'service-bar' ? '번호 + 설명 + 우측 키워드 2단 바' : '2열 이미지·캡션/번호 특전 카드'}</small></button>)}</div></section>)}</div></section></div> }
function BlockIcon({ type }: { type: SectionType }) { if (type === 'image' || type === 'caption-grid' || type === 'hero-cover') return <ImageIcon/>; if (type === 'list' || type === 'service-bar') return <Archive/>; if (type === 'table' || type === 'timeline') return <Table2/>; if (type === 'menu-zigzag' || type === 'vs-compare') return <PanelsTopLeft/>; if (type === 'icon-card' || type === 'option-grid') return <Sparkles/>; if (type === 'route-bar') return <MapPinned/>; if (type === 'offer') return <Maximize2/>; return <FileText/> }

function ImageLibraryWithCleanup({ assets, linkedAssetIds, onClearUnused, ...props }: { assets: MediaAsset[]; linkedAssetIds: string[]; onClearUnused: () => void; selected?: Section; selectedBox?: BlockBox; selectedSpecialMediaIndex: number | null; onUpload: () => void; onAddUrl: (url: string) => void; onAddGettyImage: (contentId: string) => Promise<boolean>; onConnect: (id: string) => void }) {
  const unusedCount = assets.filter(asset => !linkedAssetIds.includes(asset.id)).length
  return <div className="image-library-with-cleanup"><button className="clear-unused-assets" type="button" disabled={!unusedCount} onClick={onClearUnused}><Trash2/> 연결되지 않은 이미지 전체 삭제{unusedCount ? ` (${unusedCount})` : ''}</button><ImageLibrary assets={assets} {...props}/></div>
}
function ImageLibrary({ assets, selected, selectedBox, selectedSpecialMediaIndex, onUpload, onAddUrl, onAddGettyImage, onConnect }: { assets: MediaAsset[]; selected?: Section; selectedBox?: BlockBox; selectedSpecialMediaIndex: number | null; onUpload: () => void; onAddUrl: (url: string) => void; onAddGettyImage: (contentId: string) => Promise<boolean>; onConnect: (id: string) => void }) {
  const [imageUrl, setImageUrl] = useState('')
  const [gettyContentId, setGettyContentId] = useState('')
  const [gettyLoading, setGettyLoading] = useState(false)
  const [librariesOpen, setLibrariesOpen] = useState(false)
  const isReference = Boolean(selected && REFERENCE_LAYOUT_TYPES.has(selected.type))
  const connectedIds = isReference && selectedSpecialMediaIndex !== null ? [selected?.mediaIds[selectedSpecialMediaIndex] || ''].filter(Boolean) : selectedBox?.kind === 'media' || selectedBox?.kind === 'image' ? selectedBox.assetIds || [] : selected ? normalizeLayoutBoxes(selected).find(box => box.kind === 'media')?.assetIds || [] : []
  const guide = !selected ? '이미지를 먼저 추가한 뒤 캔버스 블록의 이미지 자리를 선택하세요.' : isReference ? selectedSpecialMediaIndex === null ? '가운데 캔버스에서 대표·항목 이미지를 먼저 선택하세요. 선택한 자리만 교체됩니다.' : '선택한 레퍼런스 이미지 자리에 바로 연결됩니다. 파일명·URL은 가운데 이미지에서 확인합니다.' : selectedBox?.kind === 'media' || selectedBox?.kind === 'image' ? '선택한 이미지 박스에 바로 연결됩니다. 파일명·URL은 가운데 이미지에서 확인합니다.' : '선택된 이미지 박스가 없어 기본 이미지 박스에 연결됩니다.'
  const externalLibraries = [{ label: 'Getty Images', url: 'https://www.gettyimagesbank.com/' }, { label: 'Pixabay', url: 'https://pixabay.com/ko/' }, { label: 'Pexels', url: 'https://www.pexels.com/ko-kr/' }, { label: 'Unsplash', url: 'https://unsplash.com/ko' }]
  const addGetty = async () => {
    if (gettyLoading || !gettyContentId.trim()) return
    setGettyLoading(true)
    try { if (await onAddGettyImage(gettyContentId)) setGettyContentId('') } finally { setGettyLoading(false) }
  }
  return <>
    <div className="panel-heading"><div><p>ASSET LIBRARY</p><h2>이미지</h2></div><span>{assets.length}</span></div>
    <section className="external-image-libraries" aria-label="외부 이미지 라이브러리"><button className="external-image-libraries-toggle" type="button" aria-expanded={librariesOpen} onClick={() => setLibrariesOpen(open => !open)}><span>라이브러리</span>{librariesOpen ? <ChevronUp/> : <ChevronDown/>}</button>{librariesOpen && <div>{externalLibraries.map(library => <button key={library.url} type="button" onClick={() => window.open(library.url, '_blank', 'noopener,noreferrer')}><span>{library.label}</span><ExternalLink/></button>)}</div>}</section>
    <p className="image-library-guide">{guide}</p>
    <button className="upload-zone" onClick={onUpload}><Upload/><strong>이미지 불러오기</strong><small>JPG · PNG · WEBP</small></button>
    <div className="library-url-add"><input aria-label="이미지 URL" type="url" placeholder="https://... 이미지 URL" value={imageUrl} onChange={event => setImageUrl(event.target.value)}/><button disabled={!imageUrl.trim()} onClick={() => { if (imageUrl.trim()) { onAddUrl(imageUrl); setImageUrl('') } }}><Link2/> URL 추가</button></div>
    <div className="getty-number-add-controls"><input aria-label="Getty 콘텐츠 번호" inputMode="numeric" pattern="[0-9]*" placeholder="Getty 콘텐츠 번호" value={gettyContentId} onChange={event => setGettyContentId(event.target.value.replace(/\s/g, ''))} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void addGetty() } }}/><button type="button" disabled={gettyLoading || !gettyContentId.trim()} onClick={() => void addGetty()}>{gettyLoading ? '조회 중' : <><Search/> 조회·추가</>}</button></div>
    {!assets.length ? <div className="empty-state"><ImageIcon/><p>이미지를 올리면 이곳에서<br/>선택 이미지 자리에 바로 연결할 수 있습니다.</p></div> : <div className="asset-grid">{assets.map(asset => <article key={asset.id} className={connectedIds.includes(asset.id) ? 'connected' : ''}><button draggable title={asset.src.startsWith('http') ? asset.src : asset.name} aria-label={`${asset.name} 연결 또는 해제`} onDragStart={event => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('text/plain', asset.id); event.dataTransfer.setData('application/x-naeil-library-asset', asset.id) }} onClick={() => onConnect(asset.id)}><img src={asset.src} alt={asset.alt || asset.name}/>{connectedIds.includes(asset.id) && <i><Check/></i>}</button></article>)}</div>}
  </>
}
function LayerList({ sections, groups, selectedId, readOnly, onSelect, onMove, onReorder, onCreateGroup, onUpdateGroup, onMoveGroup, onUngroup }: { sections: Section[]; groups: ContentGroup[]; selectedId: string; readOnly: boolean; onSelect: (id: string) => void; onMove: (id: string, dir: -1 | 1) => void; onReorder: (sourceId: string, targetId: string, placement: 'before' | 'after', forceGroupUnit?: boolean) => void; onCreateGroup: (ids: string[]) => void; onUpdateGroup: (id: string, patch: Partial<ContentGroup>) => void; onMoveGroup: (id: string, dir: -1 | 1) => void; onUngroup: (id: string) => void }) {
  const [grouping, setGrouping] = useState(false)
  const [checked, setChecked] = useState<string[]>([])
  const [dragged, setDragged] = useState<{ sectionId: string; isGroup: boolean } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ targetId: string; placement: 'before' | 'after' } | null>(null)
  useEffect(() => setChecked(current => current.filter(id => sections.some(section => section.id === id))), [sections])
  const groupByFirstSection = new Map(groups.map(group => [group.sectionIds[0], group]))
  const groupedIds = new Set(groups.flatMap(group => group.sectionIds))
  const layerLabel = (section: Section) => richTextToPlainText(section.title) || SECTION_LABELS[section.type]
  const toggleChecked = (id: string) => setChecked(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  const canDrag = !readOnly && !grouping
  const clearDrag = () => { setDragged(null); setDropTarget(null) }
  const placementFor = (event: React.DragEvent<HTMLElement>): 'before' | 'after' => {
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  }
  const startDrag = (event: React.DragEvent<HTMLElement>, sectionId: string, isGroup = false) => {
    if (!canDrag) { event.preventDefault(); return }
    event.stopPropagation()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', sectionId)
    event.dataTransfer.setData('application/x-naeil-layer-id', sectionId)
    setDragged({ sectionId, isGroup })
  }
  const overTarget = (event: React.DragEvent<HTMLElement>, targetId: string) => {
    if (!dragged) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    const placement = placementFor(event)
    setDropTarget(current => current?.targetId === targetId && current.placement === placement ? current : { targetId, placement })
  }
  const dropOnTarget = (event: React.DragEvent<HTMLElement>, targetId: string) => {
    if (!dragged) return
    event.preventDefault()
    event.stopPropagation()
    const placement = placementFor(event)
    onReorder(dragged.sectionId, targetId, placement, dragged.isGroup)
    clearDrag()
  }
  const createGroup = () => {
    const ordered = sections.filter(section => checked.includes(section.id)).map(section => section.id)
    const indexes = ordered.map(id => sections.findIndex(section => section.id === id))
    const consecutive = indexes.length >= 2 && indexes.every((index, position) => position === 0 || index === indexes[position - 1] + 1)
    if (!consecutive) { alert('연속된 블록을 2개 이상 선택해 주세요.'); return }
    onCreateGroup(ordered)
    setChecked([])
    setGrouping(false)
  }
  const layerRow = (section: Section, index: number, inGroup = false) => {
    const dropClass = dropTarget?.targetId === section.id ? `drop-${dropTarget.placement}` : ''
    const draggingClass = dragged && !dragged.isGroup && dragged.sectionId === section.id ? 'is-dragging' : ''
    return <div key={section.id} draggable={canDrag} className={`layer-row ${selectedId === section.id ? 'active' : ''} ${inGroup ? 'in-group' : ''} ${draggingClass} ${dropClass}`.trim()} onDragStart={event => startDrag(event, section.id, false)} onDragOver={event => overTarget(event, section.id)} onDrop={event => dropOnTarget(event, section.id)} onDragEnd={clearDrag}>
    {grouping && <button className={`layer-check ${checked.includes(section.id) ? 'checked' : ''}`} aria-label={`${layerLabel(section)} 그룹 선택`} onClick={() => toggleChecked(section.id)}>{checked.includes(section.id) ? <Check/> : '선택'}</button>}
    <button className="layer-main" title={canDrag ? '드래그해서 순서 변경' : undefined} onClick={() => onSelect(section.id)}><GripVertical/><span><b>{String(index + 1).padStart(2, '0')}</b>{layerLabel(section)}</span></button>
    {!grouping && <span className="layer-move"><button aria-label={`${layerLabel(section)} 위로 이동`} disabled={index === 0} onClick={() => onMove(section.id, -1)}><ChevronUp/></button><button aria-label={`${layerLabel(section)} 아래로 이동`} disabled={index === sections.length - 1} onClick={() => onMove(section.id, 1)}><ChevronDown/></button></span>}
  </div>
  }
  const entries: React.ReactNode[] = []
  sections.forEach((section, index) => {
    const group = groupByFirstSection.get(section.id)
    if (group) {
      const groupDropClass = dropTarget?.targetId === group.sectionIds[0] && (group.collapsed || dragged?.isGroup || !group.sectionIds.includes(dragged?.sectionId || '')) ? `drop-${dropTarget.placement}` : ''
      const groupDragging = dragged?.isGroup && dragged.sectionId === group.sectionIds[0] ? 'is-dragging' : ''
      entries.push(<section key={group.id} className={`content-group ${group.collapsed ? 'collapsed' : ''} ${groupDragging} ${groupDropClass}`.trim()} onDragOver={event => overTarget(event, group.sectionIds[0])} onDrop={event => dropOnTarget(event, group.sectionIds[0])}>
        <div className="content-group-head">
          {canDrag && <span className="content-group-drag" draggable aria-label={`${group.name} 드래그로 순서 변경`} title="드래그해서 그룹 순서 변경" onDragStart={event => startDrag(event, group.sectionIds[0], true)} onDragEnd={clearDrag}><GripVertical/></span>}
          <button className="content-group-toggle" aria-label={`${group.name} ${group.collapsed ? '펼치기' : '접기'}`} onClick={() => onUpdateGroup(group.id, { collapsed: !group.collapsed })}>{group.collapsed ? <ChevronDown/> : <ChevronUp/>}</button>
          <input aria-label="콘텐츠 그룹명" value={group.name} onChange={event => onUpdateGroup(group.id, { name: event.target.value })}/>
          <small>{group.sectionIds.length}</small>
          <span><button aria-label={`${group.name} 위로 이동`} disabled={index === 0} onClick={() => onMoveGroup(group.id, -1)}><ChevronUp/></button><button aria-label={`${group.name} 아래로 이동`} disabled={index + group.sectionIds.length === sections.length} onClick={() => onMoveGroup(group.id, 1)}><ChevronDown/></button><button className="danger" aria-label={`${group.name} 그룹 해제`} onClick={() => onUngroup(group.id)}><Trash2/></button></span>
        </div>
        {!group.collapsed && group.sectionIds.map(id => { const child = sections.find(sectionItem => sectionItem.id === id); return child ? layerRow(child, sections.findIndex(sectionItem => sectionItem.id === id), true) : null })}
      </section>)
      return
    }
    if (!groupedIds.has(section.id)) entries.push(layerRow(section, index))
  })
  return <><div className="panel-heading"><div><p>PAGE STRUCTURE</p><h2>레이어</h2></div><span>{sections.length}</span></div><div className="layer-group-actions">{grouping ? <><small><b>각 블록 맨 왼쪽의 ‘선택’ 버튼</b>을 눌러 연속 블록을 2개 이상 고르세요.</small><button onClick={createGroup} disabled={checked.length < 2}><Check/> 묶기 {checked.length}</button><button onClick={() => { setGrouping(false); setChecked([]) }}><X/> 취소</button></> : <button onClick={() => setGrouping(true)}><Plus/> 그룹 만들기</button>}</div><div className="layer-list" onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null) }}>{entries}</div></> }

function PageCover({ project, onStartBlank, onStartSample, onStartTemplate, onImport }: { project: Project; onStartBlank: () => void; onStartSample: () => void; onStartTemplate: (id: TemplatePresetId) => void; onImport: () => void }) {
  const isBlank = !project.page.title.trim() && !project.page.subtitle.trim() && !project.page.destination.trim() && project.sections.length === 0 && project.assets.length === 0
  if (isBlank) return <header className="page-cover blank-cover" aria-label="새 기획안 시작"><div className="quick-start-mark"><Blocks/></div><p className="quick-start-kicker">NAEIL SPECIAL CANVAS</p><strong>어떻게 시작할까요?</strong><p>빈 캔버스에서 바로 조립하거나, 실전 유형 템플릿을 골라 문구와 사진만 교체하세요.</p><div className="quick-start-actions"><button className="primary-button" onClick={onStartBlank}><Plus/> 빈 기획안 시작</button><button className="quick-start-button" onClick={onStartSample}><Sparkles/> 샘플 기획안으로 연습</button><button className="quick-start-button" onClick={onImport}><FileJson/> AI가 만든 JSON 불러오기</button></div><div className="template-preset-section"><p className="template-preset-kicker">STARTER TEMPLATES</p><div className="template-preset-grid">{TEMPLATE_PRESETS.map(preset => <button key={preset.id} className="template-preset-card" onClick={() => onStartTemplate(preset.id)}><span>{preset.category}</span><b>{preset.label}</b><small>{preset.summary}</small></button>)}</div></div></header>
  return null
}
function FileMenu({ hasLinkedFile, onImport, onSave, onSaveAs, onClose }: { hasLinkedFile: boolean; onImport: () => void; onSave: () => void; onSaveAs: () => void; onClose: () => void }) { return <div className="file-menu"><button onClick={onImport}><Upload/><span><b>불러오기</b><small>로드용 JSON 또는 YAML 파일 열기</small></span></button><hr/><button onClick={onSave}><Save/><span><b>저장</b><small>{hasLinkedFile ? '연결된 JSON 파일에 바로 덮어쓰기' : 'JSON 파일 위치를 선택해 저장'}</small></span></button><button onClick={onSaveAs}><FileJson/><span><b>다른 이름으로 저장</b><small>새 JSON 파일을 만들고 자동 저장 연결</small></span></button><hr/><button className="file-menu-close" onClick={onClose}><LogOut/><span><b>종료 (Ctrl+Q)</b><small>저장 여부를 확인한 뒤 종료</small></span></button></div> }
function ExportMenu({ onExport, disabled }: { onExport: (kind: string) => void; disabled?: boolean }) { return <div className="export-menu"><button disabled={disabled} onClick={() => onExport('html')}><Eye/><span><b>독립 HTML</b><small>이미지 URL을 유지한 단일 HTML 파일</small></span></button><button disabled={disabled} onClick={() => onExport('load-json')}><FileJson/><span><b>로드용 JSON 파일</b><small>스튜디오에서 다시 불러올 수 있는 원본</small></span></button><button disabled={disabled} onClick={() => onExport('zip')}><Archive/><span><b>디자이너 전달 ZIP</b><small>index.html · assets 이미지 · 로드용 JSON</small></span></button></div> }

function ZipProgressModal({ progress }: { progress: ZipExportProgress }) {
  return <div className="modal-backdrop zip-progress-backdrop" role="presentation"><section className="zip-progress-modal" role="dialog" aria-modal="true" aria-labelledby="zip-progress-title"><header><div><p>DESIGNER HANDOFF</p><h2 id="zip-progress-title">디자이너 전달 ZIP 생성 중</h2></div></header><div className="zip-progress-body"><div className="zip-progress-status"><strong>{progress.stage === 'archiving' ? 'ZIP 압축 패키징 중…' : `현재 ${progress.completed} / ${progress.total} 이미지 처리 중`}</strong><span>{progress.percent}%</span></div><div className="zip-progress-track" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}><div className="zip-progress-fill" style={{ width: `${progress.percent}%` }}/></div><p className="zip-progress-label" title={progress.currentLabel}>{progress.currentLabel}</p><div className="zip-progress-guide"><p>이미지를 내려받고 JPG/PNG로 정리한 뒤 ZIP으로 묶습니다. 응답이 없는 이미지는 확인 목록으로 넘깁니다.</p></div></div></section></div>
}

function PreviewModal({ project, onClose }: { project: Project; onClose: () => void }) {
  return <div className="modal-backdrop preview-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title"><header><div><p>FULL PAGE PREVIEW</p><h2 id="preview-title">{project.name}</h2></div><button aria-label="미리보기 닫기" onClick={onClose}><X/></button></header><div className="preview-modal-body"><iframe title={`${project.name} 전체 미리보기`} srcDoc={standaloneHtml(project)}/></div></section></div>
}

