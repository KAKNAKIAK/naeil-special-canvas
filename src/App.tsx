import { useEffect, useRef, useState } from 'react'
import { Archive, ArrowLeftRight, Baby, Bath, Blocks, CalendarDays, CarFront, Check, ChevronDown, ChevronUp, CircleHelp, Compass, Copy, Download, Dumbbell, ExternalLink, Eye, FileJson, FileText, Flag, Flower2, FolderOpen, GripVertical, HandHeart, Hotel, Image as ImageIcon, Layers, Link2, LogOut, MapPinned, Maximize2, Menu, Minus, MonitorUp, PanelsTopLeft, Plane, Plus, Redo2, Save, Search, Settings2, ShoppingBag, Sparkles, Star, Table2, Trash2, Undo2, Upload, UsersRound, Utensils, Waves, X } from 'lucide-react'
import YAML from 'yaml'
import { canvasLinkedAssetIds, createSampleProject, createSeedProject, GROUPS, isLegacyBaliSeed, makeSection, normalizeLayoutBoxes, normalizeProject, normalizeReferenceMediaSlots, normalizeSectionType, referenceMediaSlot, SECTION_LABELS, timelineDayStartsAfterItemRemoval } from './catalog'
import { APP_VERSION } from './app-version'
import { moveSectionUnit, normalizeContentGroups, removeSectionsFromGroups } from './content-groups'
import { exportZip, parseShareSnapshot, projectLoadJson, standaloneHtml, downloadText, type ZipExportProgress } from './exporters'
import { createCustomLayout, FOCUS_OPTIONS, layoutPresetsFor, normalizeCustomLayout, patchLayoutItem, swapCustomLayoutPlacements, type ImageOrientation } from './image-layout'
import { loadWorkspaceWithTimeout, saveMigrationBackup, saveWorkspace } from './storage'
import { isDirectProjectPayload, migrateProject } from './migrations'
import { isRichTextEmpty, RICH_TEXT_COLORS, RICH_TEXT_SIZES, richTextToPlainText, sanitizeRichText } from './rich-text'
import { joinPair, joinTimeline, splitPair, splitTimeline } from './preset-item-format'
import { approveBrief, buildDraftBrief, buildProjectFromApprovedBrief, createBriefWorkspace } from './brief'
import { collectAssetSources, historySnapshot, restoreHistorySnapshot } from './project-history'
import type { BlockBox, BriefWorkspace, CanvasBrief, CanvasBriefBlock, ContentGroup, GeneratableSectionType, IconCardItem, ImageFocus, MediaAsset, MediaLayoutItem, Project, Section, SectionType } from './types'

type LeftTab = 'blocks' | 'images' | 'layers'
type ImageTarget = { sectionId?: string; boxId?: string; specialMediaIndex?: number; replaceAssetId?: string } | null
type GettyLookupResult = { contentId: string; title: string; pageUrl: string; thumbUrl: string; status: 'found' | 'not_found' | 'error'; errorMessage: string }

const CANVAS_WIDTH = 720
const ONBOARDING_STORAGE_KEY = 'naeil-special-canvas:onboarding-v1'
// The previous visual 120% size is the new user-facing 100% baseline.
const ZOOM_REFERENCE = 100 / 1.2
const BRAND_LOGO = new URL('./assets/naeil-tour-ci.png', import.meta.url).href
const SPECIAL_LAYOUT_TYPES = new Set<SectionType>(['caption-grid', 'menu-zigzag', 'timeline'])
const ITEM_PRESET_TYPES = new Set<SectionType>(['list', 'offer', 'table', 'icon-card', 'caption-grid', 'menu-zigzag', 'timeline'])
const REFERENCE_LAYOUT_TYPES = new Set<SectionType>(['caption-grid', 'menu-zigzag', 'timeline'])
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
const ICON_CARD_OPTIONS = [
  { value: 'calendar', label: '일정', glyph: '◷', Icon: CalendarDays }, { value: 'car', label: '이동', glyph: '◌', Icon: CarFront }, { value: 'hotel', label: '호텔', glyph: '⌂', Icon: Hotel }, { value: 'plane', label: '항공', glyph: '✈', Icon: Plane }, { value: 'map', label: '지도', glyph: '⌖', Icon: MapPinned }, { value: 'guide', label: '가이드', glyph: '★', Icon: UsersRound }, { value: 'compass', label: '체험', glyph: '✦', Icon: Compass }, { value: 'star', label: '추천', glyph: '✧', Icon: Star }, { value: 'sparkles', label: '특전', glyph: '✦', Icon: Sparkles },
  { value: 'food', label: '음식', glyph: '●', Icon: Utensils }, { value: 'massage', label: '마사지', glyph: '✋', Icon: HandHeart }, { value: 'spa', label: '스파', glyph: '✿', Icon: Flower2 }, { value: 'pool', label: '수영장', glyph: '≈', Icon: Waves }, { value: 'fitness', label: '피트니스', glyph: '◆', Icon: Dumbbell }, { value: 'shopping', label: '쇼핑', glyph: '□', Icon: ShoppingBag }, { value: 'family', label: '가족·키즈', glyph: '●', Icon: Baby }, { value: 'golf', label: '골프', glyph: '⚑', Icon: Flag }, { value: 'bath', label: '온천·목욕', glyph: '♨', Icon: Bath },
] as const
const iconCardOption = (icon: string) => ICON_CARD_OPTIONS.find(option => option.value === icon) || ICON_CARD_OPTIONS[8]
const BRIEF_BLOCK_TYPES: GeneratableSectionType[] = ['text', 'image', 'list', 'icon-card', 'table', 'timeline', 'menu-zigzag']
type InlineTag = 'span' | 'p' | 'h2' | 'h3' | 'div' | 'strong' | 'b' | 'figcaption'
const BLOCK_EDITOR_COPY: Record<SectionType, { lead: string; eyebrow: string; title: string; body: string; eyebrowPlaceholder: string; titlePlaceholder: string; bodyPlaceholder: string }> = {
  text: { lead: '한 가지 메시지와 설명을 이어 쓰는 블록입니다.', eyebrow: '상단 분류', title: '핵심 메시지', body: '본문', eyebrowPlaceholder: '예: Category Label', titlePlaceholder: '고객에게 먼저 보일 핵심 문장', bodyPlaceholder: '메시지를 뒷받침하는 설명을 입력하세요.' },
  image: { lead: '이미지는 왼쪽 라이브러리에서 연결하고, 이곳에는 이미지 맥락만 작성합니다.', eyebrow: '이미지 분류', title: '이미지 섹션 제목', body: '이미지 소개·캡션', eyebrowPlaceholder: '예: HOTEL VIEW', titlePlaceholder: '예: 객실에서 만나는 바다 전망', bodyPlaceholder: '사진에서 보여 주고 싶은 장면과 특징을 입력하세요.' },
  list: { lead: '핵심 포인트를 짧게 정리하는 블록입니다.', eyebrow: '포인트 분류', title: '목록 제목', body: '목록 도입 문장', eyebrowPlaceholder: '예: WHY THIS TRIP', titlePlaceholder: '예: 여행을 더 편하게 만드는 세 가지', bodyPlaceholder: '목록을 읽기 전에 필요한 짧은 안내를 입력하세요.' },
  table: { lead: '일정, 조건, 비교처럼 행과 열로 봐야 하는 정보에 씁니다.', eyebrow: '카테고리 라벨', title: '제목', body: '본문', eyebrowPlaceholder: '예: TRIP SCHEDULE', titlePlaceholder: '예: 여행 일정 한눈에 보기', bodyPlaceholder: '표를 읽는 방법이나 기준을 짧게 입력하세요.' },
  'icon-card': { lead: '아이콘 카드로 상품의 선택 이유나 서비스 장점을 시각적으로 보여 줍니다.', eyebrow: '카테고리 라벨', title: '제목', body: '본문', eyebrowPlaceholder: '예: OUR PROMISE', titlePlaceholder: '예: 우리끼리만 떠나는 패키지', bodyPlaceholder: '카드 전체를 설명하는 한 문장을 입력하세요.' },
  offer: { lead: '특전, 포함 사항, 적용 조건을 한데 모아 강조하는 블록입니다.', eyebrow: '특전 분류', title: '특전 제목', body: '적용 안내', eyebrowPlaceholder: '예: NAEIL BENEFIT', titlePlaceholder: '예: 내일투어 단독 특전', bodyPlaceholder: '기간, 적용 대상, 유의사항을 짧게 안내하세요.' },
  'caption-grid': { lead: '사진 4장과 짧은 캡션을 2단 그리드로 보여 주는 포인트 소개 블록입니다.', eyebrow: '상단 아이콘', title: '그리드 제목', body: '보조 설명', eyebrowPlaceholder: '예: ☂', titlePlaceholder: '예: 리조트 집중 포인트', bodyPlaceholder: '필요할 때만 짧은 설명을 입력하세요.' },
  'menu-zigzag': { lead: '이미지와 설명을 좌우로 보여 주는 블록입니다. 항목마다 이미지와 텍스트 위치를 바꿀 수 있습니다.', eyebrow: 'Category Label', title: '제목', body: '본문', eyebrowPlaceholder: '예: 도쿄', titlePlaceholder: '예: 도쿄 미식 추천 메뉴', bodyPlaceholder: '필요할 때만 짧은 설명을 입력하세요.' },
  timeline: { lead: '대표 이미지와 시간축을 함께 보여 주는 장거리·테마 일정 블록입니다.', eyebrow: 'Category Label', title: '제목', body: '본문', eyebrowPlaceholder: '예: CHOCOLATE TRAIN', titlePlaceholder: '예: 스위스 패밀리 금까기', bodyPlaceholder: '일정 전체를 소개하는 핵심 내용을 입력하세요.' },
}

export default function App() {
  const [project, setProject] = useState<Project>(createSeedProject)
  const [ready, setReady] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectFiles, setProjectFiles] = useState<Record<string, string>>({})
  const [projectBoardOpen, setProjectBoardOpen] = useState(false)
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
  const [briefStudioOpen, setBriefStudioOpen] = useState(false)
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
      saveProjectFile(mode === 'save-as').then(saved => desktop.completeSaveBeforeClose(saved))
    })
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
  const briefWorkspace = project.briefWorkspace || createBriefWorkspace()
  function updateBriefWorkspace(next: BriefWorkspace, resetApproval = true) {
    commit(draft => {
      const current = draft.briefWorkspace?.brief
      draft.briefWorkspace = { ...next, brief: resetApproval && current ? { ...current, status: 'draft', approvedAt: '', updatedAt: new Date().toISOString() } : next.brief }
    })
  }
  function updateCurrentBrief(next: CanvasBrief) {
    commit(draft => { draft.briefWorkspace = { ...(draft.briefWorkspace || createBriefWorkspace()), brief: { ...next, status: 'draft', approvedAt: '', updatedAt: new Date().toISOString() } } })
  }
  function updateBriefProduct(patch: { name?: string; category?: Project['category']; layout?: Project['layout']; destination?: string; subtitle?: string }) {
    commit(draft => {
      if (patch.name !== undefined) { draft.name = patch.name; draft.campaign.product_name = patch.name; draft.campaign.metadata.title = patch.name; draft.campaign.metadata.h1 = patch.name; draft.campaign.metadata.og_title = patch.name }
      if (patch.category !== undefined) draft.category = patch.category
      if (patch.layout !== undefined) draft.layout = patch.layout
      if (patch.destination !== undefined) draft.page.destination = patch.destination
      if (patch.subtitle !== undefined) draft.page.subtitle = patch.subtitle
      if (draft.briefWorkspace?.brief) draft.briefWorkspace.brief = { ...draft.briefWorkspace.brief, status: 'draft', approvedAt: '', updatedAt: new Date().toISOString() }
    })
  }
  function generateBriefDraft() {
    const next = buildDraftBrief(project, briefWorkspace)
    commit(draft => { draft.briefWorkspace = { ...briefWorkspace, brief: next } })
    setToast('입력 자료를 사실·확인 필요·블록 초안으로 정리했습니다.')
  }
  function approveCurrentBrief() {
    if (!briefWorkspace.brief) { setToast('먼저 초안을 생성하세요.'); return }
    try {
      const approved = approveBrief(briefWorkspace.brief)
      commit(draft => { draft.briefWorkspace = { ...briefWorkspace, brief: approved } })
      setToast('brief를 승인했습니다. 이제 캔버스에 반영할 수 있습니다.')
    } catch (error) { setToast(error instanceof Error ? error.message : 'brief를 승인하지 못했습니다.') }
  }
  function applyCurrentBrief() {
    if (!briefWorkspace.brief) return
    try {
      const next = buildProjectFromApprovedBrief(project, briefWorkspace.brief)
      setHistory(history => [...history.slice(-39), historySnapshot(project)])
      setFuture([])
      setProject(next)
      setSelectedId(next.sections[0]?.id || '')
      setSelectedBoxId('')
      setSelectedItemIndex(next.sections[0]?.items.length ? 0 : null)
      setBriefStudioOpen(false)
      setToast('승인 brief를 캔버스 초안으로 반영했습니다.')
    } catch (error) { setToast(error instanceof Error ? error.message : '캔버스 반영에 실패했습니다.') }
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
  function changeBoxLayer(sectionId: string, boxId: string, amount: number) { commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section) return; const boxes = normalizeLayoutBoxes(section); const target = boxes.find(box => box.id === boxId); if (!target) return; target.zIndex = Math.max(1, Math.min(99, target.zIndex + amount)); section.layoutBoxes = boxes }) }
  function moveImageFlowBox(sectionId: string, boxId: string, direction: -1 | 1) { commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section || (section.type !== 'image' && section.type !== 'text')) return; const boxes = normalizeLayoutBoxes(section).filter(box => section.type === 'image' || box.kind === 'content' || box.kind === 'text').slice().sort((a, b) => a.row - b.row || a.column - b.column); const index = boxes.findIndex(box => box.id === boxId); const target = index + direction; if (index < 0 || target < 0 || target >= boxes.length) return; [boxes[index], boxes[target]] = [boxes[target], boxes[index]]; let row = 1; section.layoutBoxes = boxes.map((box, order) => { const rowSpan = box.kind === 'content' || box.kind === 'text' ? 4 : 6; const next = { ...box, column: 1, row, columnSpan: 12, rowSpan, zIndex: order + 1 }; row += rowSpan + 1; return next }) }); setToast(direction < 0 ? '카드를 위로 옮겼습니다.' : '카드를 아래로 옮겼습니다.') }
  const isItemPreset = (type: SectionType) => ITEM_PRESET_TYPES.has(type)
  const newPresetItem = (type: SectionType) => type === 'offer' ? '새 특전 또는 조건' : type === 'caption-grid' ? '새 이미지 캡션' : type === 'menu-zigzag' ? '제목 | 본문' : type === 'timeline' ? '00:00 | 새 일정 | 설명을 입력하세요.' : '새 핵심 내용'
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
          if (REFERENCE_LAYOUT_TYPES.has(section.type)) section.mediaIds = [...normalizeReferenceMediaSlots(section.type, previousItems, section.mediaIds), '']
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
        if (REFERENCE_LAYOUT_TYPES.has(section.type)) section.mediaIds.splice(referenceMediaSlot(section.type, insertAt), 0, ...insertedItems.map(() => ''))
        nextIndex = insertAt
        addedCaptionGridRow = section.type === 'caption-grid'
      }
    })
    if (nextIndex >= 0) {
      selectSectionItem(sectionId, nextIndex)
      setToast(addedCaptionGridRow ? `${placement === 'above' ? '위에' : '아래에'} 이미지 2개를 한 행으로 추가했습니다.` : placement === 'above' ? '위에 항목을 추가했습니다.' : '아래에 항목을 추가했습니다.')
    }
  }
  function duplicatePresetItem(sectionId: string, index: number) { let nextIndex = -1; commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section || !isItemPreset(section.type)) return; const insertAt = index + 1; if (section.type === 'table') { const rows = section.tableRows || []; const row = rows[index]; if (!row) return; section.tableRows = [...rows.slice(0, insertAt), [...row], ...rows.slice(insertAt)]; nextIndex = insertAt } else if (section.type === 'icon-card') { const cards = section.iconCards || []; const card = cards[index]; if (!card) return; section.iconCards = [...cards.slice(0, insertAt), cloneIconCard(card), ...cards.slice(insertAt)]; nextIndex = insertAt } else { const value = section.items[index]; if (value === undefined) return; const reversed = section.items.map((_, itemIndex) => Boolean(section.menuItemReversed?.[itemIndex])); section.mediaIds = REFERENCE_LAYOUT_TYPES.has(section.type) ? normalizeReferenceMediaSlots(section.type, section.items, section.mediaIds) : section.mediaIds; section.items = [...section.items.slice(0, insertAt), value, ...section.items.slice(insertAt)]; if (section.type === 'menu-zigzag') section.menuItemReversed = [...reversed.slice(0, insertAt), reversed[index], ...reversed.slice(insertAt)]; if (section.type === 'timeline') section.timelineDayStarts = (section.timelineDayStarts || []).map(start => start > index ? start + 1 : start); if (REFERENCE_LAYOUT_TYPES.has(section.type)) { const slot = referenceMediaSlot(section.type, index); section.mediaIds.splice(slot + 1, 0, section.mediaIds[slot] || '') } nextIndex = insertAt } }); if (nextIndex >= 0) { selectSectionItem(sectionId, nextIndex); setToast('항목을 복제했습니다.') } }
  function updatePresetItem(sectionId: string, index: number, value: string | string[] | Partial<IconCardItem>) { commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section) return; if (section.type === 'table' && Array.isArray(value)) section.tableRows = (section.tableRows || []).map((row, rowIndex) => rowIndex === index ? value : row); else if (section.type === 'icon-card' && !Array.isArray(value) && typeof value !== 'string') section.iconCards = (section.iconCards || []).map((card, itemIndex) => itemIndex === index ? { ...card, ...value } : card); else if (typeof value === 'string') section.items = section.items.map((item, itemIndex) => itemIndex === index ? value : item) }, true) }
  function movePresetItem(sectionId: string, index: number, direction: -1 | 1) { commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section || !isItemPreset(section.type)) return; const values = section.type === 'table' ? section.tableRows || [] : section.type === 'icon-card' ? section.iconCards || [] : section.items; const target = index + direction; if (target < 0 || target >= values.length) return; [values[index], values[target]] = [values[target], values[index]]; if (section.type === 'table') section.tableRows = [...values as string[][]]; else if (section.type === 'icon-card') section.iconCards = [...values as IconCardItem[]]; else { section.items = [...values as string[]]; if (section.type === 'menu-zigzag') { const reversed = section.items.map((_, itemIndex) => Boolean(section.menuItemReversed?.[itemIndex])); [reversed[index], reversed[target]] = [reversed[target], reversed[index]]; section.menuItemReversed = reversed } if (REFERENCE_LAYOUT_TYPES.has(section.type)) { section.mediaIds = normalizeReferenceMediaSlots(section.type, values as string[], section.mediaIds); const fromSlot = referenceMediaSlot(section.type, index); const targetSlot = referenceMediaSlot(section.type, target); [section.mediaIds[fromSlot], section.mediaIds[targetSlot]] = [section.mediaIds[targetSlot], section.mediaIds[fromSlot]] } } }); setSelectedItemIndex(Math.max(0, index + direction)); setSelectedSpecialMediaIndex(null) }
  function reorderIconCard(sectionId: string, fromIndex: number, insertionIndex: number) { let nextIndex = fromIndex; commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section || section.type !== 'icon-card') return; const cards = [...(section.iconCards || [])]; const [card] = cards.splice(fromIndex, 1); if (!card) return; const target = Math.max(0, Math.min(insertionIndex, cards.length + 1)); nextIndex = fromIndex < target ? target - 1 : target; cards.splice(nextIndex, 0, card); section.iconCards = cards }); selectSectionItem(sectionId, nextIndex); setToast('카드 위치를 변경했습니다.') }
  function toggleMenuItemLayout(sectionId: string, index: number) { commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section || section.type !== 'menu-zigzag') return; const layout = section.items.map((_, itemIndex) => Boolean(section.menuItemReversed?.[itemIndex])); layout[index] = !layout[index]; section.menuItemReversed = layout }); setToast('이미지와 텍스트 위치를 반전했습니다.') }
  function deletePresetItem(sectionId: string, index: number) { let nextIndex: number | null = null; commit(draft => { const section = draft.sections.find(item => item.id === sectionId); if (!section || !isItemPreset(section.type)) return; if (section.type === 'table') { const rows = (section.tableRows || []).filter((_, rowIndex) => rowIndex !== index); section.tableRows = rows; nextIndex = rows.length ? Math.min(index, rows.length - 1) : null } else if (section.type === 'icon-card') { const cards = (section.iconCards || []).filter((_, itemIndex) => itemIndex !== index); section.iconCards = cards; nextIndex = cards.length ? Math.min(index, cards.length - 1) : null } else { const previousItems = section.items; const reversed = previousItems.map((_, itemIndex) => Boolean(section.menuItemReversed?.[itemIndex])); section.mediaIds = REFERENCE_LAYOUT_TYPES.has(section.type) ? normalizeReferenceMediaSlots(section.type, previousItems, section.mediaIds) : section.mediaIds; if (REFERENCE_LAYOUT_TYPES.has(section.type)) section.mediaIds.splice(referenceMediaSlot(section.type, index), 1); const items = previousItems.filter((_, itemIndex) => itemIndex !== index); section.items = items; if (section.type === 'menu-zigzag') section.menuItemReversed = reversed.filter((_, itemIndex) => itemIndex !== index); if (section.type === 'timeline') section.timelineDayStarts = timelineDayStartsAfterItemRemoval(section.timelineDayStarts?.length ? section.timelineDayStarts : [0], previousItems.length, index); nextIndex = items.length ? Math.min(index, items.length - 1) : null } }); setSelectedItemIndex(nextIndex); setSelectedSpecialMediaIndex(null); setToast('항목을 삭제했습니다.') }
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
  function newProject() { const next = createSeedProject(); setProjects(current => [next, ...current]); setProject(next); setSelectedId(''); setSelectedBoxId(''); setSelectedItemIndex(null); setSelectedSpecialMediaIndex(null); setHistory([]); setFuture([]); setLeftTab('blocks'); setProjectBoardOpen(false); setToast('빈 캔버스를 만들었습니다.') }
  function openNewBlankCanvas() { if (!window.confirm('새 빈 캔버스를 시작할까요?\n현재 작업은 이 PC에 자동 저장되어 프로젝트에서 다시 열 수 있습니다.')) return; newProject() }
  function startBlankCanvas() { setLeftTab('blocks'); setBlockPickerOpen(true) }
  function startSampleProject() { const next = createSampleProject(); setProjects(current => [next, ...current]); setProject(next); setSelectedId(next.sections[0]?.id || ''); setSelectedBoxId(''); setSelectedItemIndex(null); setHistory([]); setFuture([]); setLeftTab('blocks'); setToast('편집 가능한 샘플 기획안을 열었습니다.') }
  function completeOnboarding(dontShowAgain = false) { if (dontShowAgain) localStorage.setItem(ONBOARDING_STORAGE_KEY, 'done'); setOnboardingOpen(false); setOnboardingStep(0); setLeftTab('blocks') }
  function changeOnboardingStep(step: number) { setOnboardingStep(step); if (step === 0) setLeftTab('blocks'); if (step === 2) setLeftTab('images'); if (step === 3) setLeftTab('layers') }
  function reopenOnboarding() { setHelpOpen(false); changeOnboardingStep(0); setOnboardingOpen(true) }
  function openProject(next: Project) { setProject(normalizeProject(next)); setSelectedId(next.sections[0]?.id || ''); setHistory([]); setFuture([]); setProjectBoardOpen(false) }
  function duplicateProject(source: Project) { const next = deepCopy(source); next.id = crypto.randomUUID(); next.name = `${source.name} 복사본`; next.updatedAt = new Date().toISOString(); next.campaign.campaign_id = next.id; next.campaign.product_name = next.name; next.campaign.tracking.promotion_id = next.id; setProjects(current => [next, ...current]); setProject(next); setSelectedId(next.sections[0]?.id || ''); setProjectBoardOpen(false); setToast('프로젝트를 복제했습니다.') }
  function removeProject(id: string) { if (projects.length <= 1) { setToast('마지막 프로젝트는 삭제할 수 없습니다.'); return } if (!confirm('이 기획안을 삭제할까요? 내보낸 JSON 파일은 유지됩니다.')) return; const next = projects.filter(item => item.id !== id); const nextFiles = Object.fromEntries(Object.entries(projectFilesRef.current).filter(([projectId]) => projectId !== id)); projectFilesRef.current = nextFiles; setProjectFiles(nextFiles); setProjects(next); if (project.id === id) openProject(next[0]); saveWorkspace({ activeId: project.id === id ? next[0].id : project.id, projects: next, projectFiles: nextFiles }); }
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
      <div className="project-title"><input aria-label="프로젝트 이름" value={project.name} onChange={e => commit(d => { d.name = e.target.value }, true)}/><span title={linkedJsonPath || undefined}>{saveStatusLabel}</span></div>
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
        {leftTab === 'layers' && <LayerList sections={project.sections} groups={project.contentGroups || []} selectedId={selectedId} onSelect={focusLayerSection} onMove={moveSection} onCreateGroup={createContentGroup} onUpdateGroup={updateContentGroup} onMoveGroup={moveContentGroup} onUngroup={ungroupContent}/>} 
      </div>
    </aside>

    <main className="workspace">
      <div className="workspace-head"><span>{CANVAS_WIDTH}px PC 전용 양식 · {project.category}</span>{readOnly && <strong className="readonly-label"><Eye size={13}/> 디자이너 읽기 전용</strong>}</div>
      <div className="canvas-scroll">
        <div className="canvas-scale" style={{ width: `${CANVAS_WIDTH}px`, transform: `scale(${zoom / ZOOM_REFERENCE})`, marginBottom: `${(zoom / ZOOM_REFERENCE - 1) * 900}px` }}>
          <div ref={artboardRef} className="artboard viewport-720" data-testid="artboard" data-guide="canvas">
            <PageCover project={project} onStartBlank={startBlankCanvas} onStartSample={startSampleProject} onImport={() => importRef.current?.click()}/>
            {project.sections.map((section, index) => <SectionView key={section.id} section={section} assets={project.assets} selected={section.id === selectedId} readOnly={readOnly} activeBoxId={section.id === selectedId ? selectedBoxId : ''} activeItemIndex={section.id === selectedId ? selectedItemIndex : null} activeSpecialMediaIndex={section.id === selectedId ? selectedSpecialMediaIndex : null} index={index} total={project.sections.length} onSelect={() => focusSection(section)} onSelectBox={boxId => selectSectionBox(section.id, boxId)} onSelectItem={itemIndex => selectSectionItem(section.id, itemIndex)} onSelectSpecialMedia={mediaIndex => selectSpecialMedia(section.id, mediaIndex)} onClearTimelineMedia={clearTimelineMedia} onSetTimelineHeroVisible={setTimelineHeroVisible} onDeleteTimelineDay={deleteTimelineDay} onSectionChange={patch => updateSectionById(section.id, patch)} onBoxChange={(boxId, patch) => updateLayoutBox(section.id, boxId, patch)} onUpdateItem={(itemIndex, value) => updatePresetItem(section.id, itemIndex, value)} onAddFlowBox={addLayoutBox} onMoveFlowBox={moveImageFlowBox} onDeleteFlowBox={deleteLayoutBox} onAddItem={addPresetItem} onAddTimelineDay={addTimelineDay} onInsertItem={insertPresetItem} onDuplicateItem={duplicatePresetItem} onMoveItem={movePresetItem} onReorderIconCard={reorderIconCard} onDeleteItem={deletePresetItem} onToggleMenuItemLayout={toggleMenuItemLayout} onMove={moveSection} onDuplicate={duplicateSection} onDelete={deleteSection} onSwapMedia={swapSectionMedia} onAddLibraryMedia={addLibraryMediaToBox}/>) }
            <button className="add-end" data-guide="block-add" onClick={() => setBlockPickerOpen(true)}><Plus size={18}/> 다음 블록 추가</button>
          </div>
        </div>
      </div>
      <div className="statusbar"><span><span className="status-dot"/> {readOnly ? '공유 스냅샷' : linkedJsonPath ? '연결 JSON 자동 저장' : '로컬 자동 저장'}</span><span>{CANVAS_WIDTH}px 고정 · {project.sections.length}개 블록 · {project.assets.length}개 이미지</span><div className="zoom"><button aria-label="축소" onClick={() => setZoom(z => Math.max(35, z - 5))}><Minus/></button><input aria-label="확대 비율" type="range" min="35" max="120" value={zoom} onChange={e => setZoom(Number(e.target.value))}/><button aria-label="확대" onClick={() => setZoom(z => Math.min(120, z + 5))}><Plus/></button><button onClick={() => setZoom(100)}>{zoom}%</button></div></div>
    </main>

    <aside className={`right-panel ${mobilePanel === 'right' ? 'mobile-open' : ''}`}>
      <PanelClose onClick={() => setMobilePanel(null)}/>
      <Inspector project={project} selected={selected} selectedBox={selectedBox} selectedItemIndex={selectedItemIndex} selectedSpecialMediaIndex={selectedSpecialMediaIndex} commit={commit} updateSection={updateSection} onAddBox={addLayoutBox} onDeleteBox={deleteLayoutBox} onChangeBox={updateLayoutBox} onChangeBoxLayer={changeBoxLayer} onMoveImageFlowBox={moveImageFlowBox} onUpdateItem={updatePresetItem} onDeleteItem={deletePresetItem} onLayoutChange={setSectionLayout} onLayoutItemChange={updateSectionLayoutItem} onLayoutPreset={applySectionLayoutPreset}/>
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

function BriefStudio({ project, workspace, onClose, onProductChange, onWorkspaceChange, onBriefChange, onCreateDraft, onApprove, onApply, onDownloadBrief }: { project: Project; workspace: BriefWorkspace; onClose: () => void; onProductChange: (patch: { name?: string; category?: Project['category']; layout?: Project['layout']; destination?: string; subtitle?: string }) => void; onWorkspaceChange: (next: BriefWorkspace) => void; onBriefChange: (next: CanvasBrief) => void; onCreateDraft: () => void; onApprove: () => void; onApply: () => void; onDownloadBrief: () => void }) {
  const brief = workspace.brief
  const [step, setStep] = useState(brief ? brief.status === 'approved' ? 2 : 1 : 0)
  const setWorkspace = (patch: Partial<BriefWorkspace>) => onWorkspaceChange({ ...workspace, ...patch })
  const setBrief = (patch: Partial<CanvasBrief>) => { if (brief) onBriefChange({ ...brief, ...patch }) }
  const changeFact = (id: string, patch: Partial<BriefWorkspace['facts'][number]>) => setWorkspace({ facts: workspace.facts.map(fact => fact.id === id ? { ...fact, ...patch } : fact) })
  const addFact = () => setWorkspace({ facts: [...workspace.facts, { id: crypto.randomUUID(), field: '', value: '', source: '사용자 입력', status: 'confirmed' }] })
  const removeFact = (id: string) => setWorkspace({ facts: workspace.facts.filter(fact => fact.id !== id) })
  const setBlocks = (blocks: CanvasBriefBlock[]) => { if (brief) setBrief({ blocks, blockOrder: blocks.map(block => block.type) }) }
  const addBlock = (type: GeneratableSectionType) => { if (!brief || brief.blocks.some(block => block.type === type && type === 'text')) return; setBlocks([...brief.blocks, { type, categoryLabel: brief.common.categoryLabel, title: '제목', body: '본문' }]) }
  const moveBlock = (index: number, direction: -1 | 1) => { if (!brief) return; const target = index + direction; if (target < 0 || target >= brief.blocks.length) return; const blocks = [...brief.blocks]; [blocks[index], blocks[target]] = [blocks[target], blocks[index]]; setBlocks(blocks) }
  const updateBlock = (index: number, patch: Partial<CanvasBriefBlock>) => { if (!brief) return; setBlocks(brief.blocks.map((block, current) => current === index ? { ...block, ...patch } : block)) }
  const selectedAssets = new Set(workspace.selectedImageIds)
  return <div className="modal-backdrop brief-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="brief-studio" role="dialog" aria-modal="true" aria-labelledby="brief-studio-title">
      <header className="brief-studio-head"><div><p>AI WRITING FLOW</p><h2 id="brief-studio-title">상품 자료에서 캔버스 초안까지</h2><span>원본은 보존하고, 확인된 사실만 승인 brief에 확정합니다.</span></div><button className="icon-button" aria-label="닫기" onClick={onClose}><X/></button></header>
      <nav className="brief-steps" aria-label="작성 단계">
        {['자료 입력', '초안 검토', '승인·반영'].map((label, index) => <button key={label} className={step === index ? 'active' : ''} disabled={index > 0 && !brief} onClick={() => setStep(index)}><b>0{index + 1}</b><span>{label}</span>{index === 2 && brief?.status === 'approved' && <Check size={14}/>}</button>)}
      </nav>
      <div className="brief-studio-body">
        {step === 0 && <div className="brief-input-step">
          <section className="brief-section"><div className="brief-section-title"><p>PRODUCT BASE</p><h3>기본 상품 정보</h3></div><div className="brief-form-grid"><label><span>상품명</span><input value={project.name} onChange={event => onProductChange({ name: event.target.value })}/></label><label><span>카테고리</span><select value={project.category} onChange={event => onProductChange({ category: event.target.value as Project['category'] })}>{(['금까기', '우리만', '특별한', '골프'] as const).map(value => <option key={value}>{value}</option>)}</select></label><label><span>여행지</span><input value={project.page.destination} placeholder="예: 괌" onChange={event => onProductChange({ destination: event.target.value })}/></label><label><span>부제</span><input value={project.page.subtitle} placeholder="예: 가족 맞춤 휴양 4박 5일" onChange={event => onProductChange({ subtitle: event.target.value })}/></label><label><span>기본 레이아웃</span><select value={project.layout} onChange={event => onProductChange({ layout: event.target.value as Project['layout'] })}>{[['hotel-sales','호텔 판매형'],['theme-package','테마 패키지형'],['journey-longform','장거리 스토리형'],['golf-standard','골프 기본형'],['hotel-detail','호텔 소개형'],['destination-catalog','여행지 카탈로그형'],['offer-promotion','프로모션형']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>구성 방향</span><select value={workspace.compositionHint || 'auto'} onChange={event => setWorkspace({ compositionHint: event.target.value as BriefWorkspace['compositionHint'] })}><option value="auto">자료 분석 자동 선택</option><option value="photo-led">사진 중심</option><option value="detailed-schedule">상세 일정 중심</option><option value="summary-schedule">간략 일정 중심</option><option value="benefit-led">특전·구성 중심</option><option value="story-led">이미지·설명 중심</option><option value="minimal">최소 구성</option></select></label></div></section>
          <section className="brief-section"><div className="brief-section-title"><p>RAW MATERIAL</p><h3>원본 상품 자료</h3><small>일정표, 호텔·관광지 설명, 포함 조건, 특전 원문을 그대로 붙여넣으세요.</small></div><textarea value={workspace.rawText} rows={8} placeholder={'예: 1일차 인천 출발 · 괌 도착\n숙박: 두짓타니 괌 4박\n포함: 조식, 공항 왕복 이동'} onChange={event => setWorkspace({ rawText: event.target.value })}/><label className="full-field"><span>원본 URL · 자료 위치</span><textarea value={workspace.sourceUrls.join('\n')} rows={3} placeholder="한 줄에 URL 또는 내부 자료 위치 하나씩" onChange={event => setWorkspace({ sourceUrls: event.target.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean) })}/></label></section>
          <section className="brief-section"><div className="brief-section-title"><p>FACT PACK</p><h3>사실 확인 상태</h3><small>확인 완료만 생성본의 근거가 됩니다. 미확인 항목은 검토 목록에 남습니다.</small></div><div className="brief-facts">{workspace.facts.map(fact => <div key={fact.id} className="brief-fact"><input aria-label="사실 항목" value={fact.field} placeholder="항목" onChange={event => changeFact(fact.id, { field: event.target.value })}/><input aria-label="사실 값" value={fact.value} placeholder="값 또는 확인 사유" onChange={event => changeFact(fact.id, { value: event.target.value })}/><input aria-label="근거" value={fact.source} placeholder="근거" onChange={event => changeFact(fact.id, { source: event.target.value })}/><select aria-label="확인 상태" value={fact.status} onChange={event => changeFact(fact.id, { status: event.target.value as BriefWorkspace['facts'][number]['status'] })}><option value="confirmed">확인 완료</option><option value="needs-review">확인 필요</option></select><button className="mini-danger" aria-label="사실 삭제" onClick={() => removeFact(fact.id)}><Trash2 size={14}/></button></div>)}</div><button className="outline-add" onClick={addFact}><Plus size={15}/> 사실 항목 추가</button></section>
          <section className="brief-section"><div className="brief-section-title"><p>IMAGE DIRECTION</p><h3>초안에 사용할 이미지</h3><small>선택한 이미지만 brief와 생성된 캔버스에 연결됩니다.</small></div>{project.assets.length ? <div className="brief-image-choices">{project.assets.map(asset => <label key={asset.id} className={selectedAssets.has(asset.id) ? 'selected' : ''}><input type="checkbox" checked={selectedAssets.has(asset.id)} onChange={() => { const next = selectedAssets.has(asset.id) ? workspace.selectedImageIds.filter(id => id !== asset.id) : [...workspace.selectedImageIds, asset.id]; setWorkspace({ selectedImageIds: next }) }}/><img src={asset.src} alt=""/><span title={asset.src.startsWith('http') ? asset.src : asset.name}>{asset.src.startsWith('http') ? asset.src : asset.name}</span></label>)}</div> : <div className="brief-empty">왼쪽 이미지 탭에서 이미지 또는 URL을 먼저 추가하세요.</div>}</section>
          <footer className="brief-action-row"><span>원본 자료는 프로젝트 내부 작업 공간에만 보존됩니다.</span><button className="primary-button" onClick={() => { onCreateDraft(); setStep(1) }}><Sparkles size={16}/> 초안 생성</button></footer>
        </div>}
        {step === 1 && <div className="brief-review-step">{!brief ? <div className="brief-empty large">먼저 자료 입력 단계에서 초안을 생성하세요.</div> : <><section className="brief-review-hero"><div><p>DRAFT BRIEF</p><h3>{brief.status === 'approved' ? '승인 후 수정됨 · 재승인이 필요합니다.' : '편집 가능한 구조·문구 초안'}</h3><span>{brief.composition?.reason || '블록 순서와 핵심 문구를 확정한 뒤 승인하세요.'}</span></div><button className="outline-add" onClick={onCreateDraft}><Sparkles size={15}/> 입력 자료로 초안 다시 만들기</button></section><section className="brief-section"><div className="brief-section-title"><p>CORE MESSAGE</p><h3>공통 텍스트</h3></div><div className="brief-form-grid"><label><span>핵심 고객</span><input value={brief.audience} onChange={event => setBrief({ audience: event.target.value })}/></label><label><span>기획 메시지</span><input value={brief.message} onChange={event => setBrief({ message: event.target.value })}/></label><label><span>카테고리 라벨</span><input value={brief.common.categoryLabel} onChange={event => setBrief({ common: { ...brief.common, categoryLabel: event.target.value } })}/></label><label><span>제목</span><input value={brief.common.title} onChange={event => setBrief({ common: { ...brief.common, title: event.target.value } })}/></label><label className="full-field"><span>본문</span><textarea rows={3} value={brief.common.body} onChange={event => setBrief({ common: { ...brief.common, body: event.target.value } })}/></label></div></section><section className="brief-section"><div className="brief-section-title"><p>BLOCK FLOW</p><h3>블록 순서와 문구</h3><small>새로 생성 가능한 7개 블록만 선택됩니다.</small></div><div className="brief-block-list">{brief.blocks.map((block, index) => <article key={`${block.type}-${index}`}><div className="brief-block-head"><b>{String(index + 1).padStart(2, '0')}</b><strong>{SECTION_LABELS[block.type]}</strong><span><button disabled={index === 0} onClick={() => moveBlock(index, -1)}><ChevronUp size={14}/></button><button disabled={index === brief.blocks.length - 1} onClick={() => moveBlock(index, 1)}><ChevronDown size={14}/></button><button className="mini-danger" onClick={() => setBlocks(brief.blocks.filter((_, current) => current !== index))}><Trash2 size={14}/></button></span></div><input aria-label={`${SECTION_LABELS[block.type]} 제목`} value={block.title || ''} placeholder="제목" onChange={event => updateBlock(index, { title: event.target.value })}/><textarea aria-label={`${SECTION_LABELS[block.type]} 본문`} rows={2} value={block.body || ''} placeholder="본문" onChange={event => updateBlock(index, { body: event.target.value })}/></article>)}</div><div className="brief-block-add">{BRIEF_BLOCK_TYPES.filter(type => type !== 'text' || !brief.blocks.some(block => block.type === 'text')).map(type => <button key={type} onClick={() => addBlock(type)}><Plus size={13}/>{SECTION_LABELS[type]}</button>)}</div></section><div className="brief-evidence-grid"><section><p>CONFIRMED FACTS</p>{brief.confirmedFacts.length ? brief.confirmedFacts.map(fact => <div key={`${fact.field}-${fact.value}`}><b>{fact.field}</b><span>{fact.value}</span><small>{fact.source}</small></div>) : <em>확인 완료 사실을 추가하세요.</em>}</section><section><p>NEEDS REVIEW</p>{brief.needsReview.length ? brief.needsReview.map(item => <div key={`${item.field}-${item.reason}`}><b>{item.field}</b><span>{item.reason}</span></div>) : <em>추가 확인 항목이 없습니다.</em>}</section></div><footer className="brief-action-row"><button className="ghost-button" onClick={onDownloadBrief}><FileJson size={16}/> brief JSON 저장</button><button className="primary-button" onClick={() => { onApprove(); setStep(2) }}><Check size={16}/> 이 구조 승인</button></footer></>}</div>}
        {step === 2 && <div className="brief-approval-step">{!brief ? <div className="brief-empty large">초안이 아직 없습니다.</div> : <><div className={`approval-stamp ${brief.status === 'approved' ? 'approved' : ''}`}><Check size={24}/><div><p>{brief.status === 'approved' ? 'APPROVED BRIEF' : 'WAITING FOR APPROVAL'}</p><h3>{brief.status === 'approved' ? '캔버스 반영 준비 완료' : '검토 후 승인해 주세요.'}</h3><span>{brief.status === 'approved' ? `${new Date(brief.approvedAt).toLocaleString('ko-KR')} 승인` : '승인 전에는 캔버스 JSON을 만들지 않습니다.'}</span></div></div><section className="brief-approval-summary"><div><span>상품</span><b>{brief.product.name}</b></div><div><span>블록</span><b>{brief.blockOrder.map(type => SECTION_LABELS[type]).join(' → ')}</b></div><div><span>이미지</span><b>{brief.imageIds.length}개 연결</b></div><div><span>확인 필요</span><b>{brief.needsReview.length}건</b></div></section><section className="brief-guard"><strong>반영 규칙</strong><p>승인된 brief의 블록 순서·공통 문구·선택 이미지만 내부 초안 Project JSON으로 반영합니다. 가격, 일정, 포함 조건처럼 확인 필요로 남은 내용은 자동 확정하지 않습니다.</p></section><footer className="brief-action-row">{brief.status !== 'approved' ? <button className="primary-button" onClick={onApprove}><Check size={16}/> 최종 승인</button> : <><button className="ghost-button" onClick={onDownloadBrief}><FileJson size={16}/> 승인 brief 저장</button><button className="primary-button" onClick={onApply}><Sparkles size={16}/> 캔버스 초안으로 반영</button></>}</footer></>}</div>}
      </div>
    </section>
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

function BlockPicker({ onClose, onSelect }: { onClose: () => void; onSelect: (type: SectionType) => void }) { return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="block-picker" role="dialog" aria-modal="true" aria-labelledby="block-picker-title"><header><div><p>ADD BLOCK</p><h2 id="block-picker-title">다음 블록 선택</h2></div><button aria-label="닫기" onClick={onClose}><X/></button></header><p>추가할 블록을 선택하세요. 선택한 블록은 시안의 마지막에 바로 추가됩니다.</p><div>{GROUPS.map((group, index) => <section key={group.name || index}>{group.name && <h3>{group.name}</h3>}<div className="block-picker-grid">{group.types.map(type => <button key={type} onClick={() => onSelect(type)}><BlockIcon type={type}/><span>{SECTION_LABELS[type]}</span><small>{type === 'text' ? '문단을 이어 쓰는 기본 블록' : type === 'image' ? '텍스트와 이미지를 순서대로 구성' : type === 'list' ? '일반·특전형 목록 전환' : type === 'table' ? 'DAY 순서로 작성하는 일정' : type === 'timeline' ? '시간과 이미지로 구성하는 상세 일정' : type === 'menu-zigzag' ? '이미지와 설명을 나란히 구성' : '전용 레이아웃 블록'}</small></button>)}</div></section>)}</div></section></div> }
function BlockIcon({ type }: { type: SectionType }) { if (type === 'image' || type === 'caption-grid') return <ImageIcon/>; if (type === 'list') return <Archive/>; if (type === 'table' || type === 'timeline') return <Table2/>; if (type === 'menu-zigzag') return <PanelsTopLeft/>; if (type === 'icon-card') return <Sparkles/>; if (type === 'offer') return <Maximize2/>; return <FileText/> }

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
function LayerList({ sections, groups, selectedId, onSelect, onMove, onCreateGroup, onUpdateGroup, onMoveGroup, onUngroup }: { sections: Section[]; groups: ContentGroup[]; selectedId: string; onSelect: (id: string) => void; onMove: (id: string, dir: -1 | 1) => void; onCreateGroup: (ids: string[]) => void; onUpdateGroup: (id: string, patch: Partial<ContentGroup>) => void; onMoveGroup: (id: string, dir: -1 | 1) => void; onUngroup: (id: string) => void }) {
  const [grouping, setGrouping] = useState(false)
  const [checked, setChecked] = useState<string[]>([])
  useEffect(() => setChecked(current => current.filter(id => sections.some(section => section.id === id))), [sections])
  const groupByFirstSection = new Map(groups.map(group => [group.sectionIds[0], group]))
  const groupedIds = new Set(groups.flatMap(group => group.sectionIds))
  const layerLabel = (section: Section) => richTextToPlainText(section.title) || SECTION_LABELS[section.type]
  const toggleChecked = (id: string) => setChecked(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  const createGroup = () => {
    const ordered = sections.filter(section => checked.includes(section.id)).map(section => section.id)
    const indexes = ordered.map(id => sections.findIndex(section => section.id === id))
    const consecutive = indexes.length >= 2 && indexes.every((index, position) => position === 0 || index === indexes[position - 1] + 1)
    if (!consecutive) { alert('연속된 블록을 2개 이상 선택해 주세요.'); return }
    onCreateGroup(ordered)
    setChecked([])
    setGrouping(false)
  }
  const layerRow = (section: Section, index: number, inGroup = false) => <div key={section.id} className={`layer-row ${selectedId === section.id ? 'active' : ''} ${inGroup ? 'in-group' : ''}`.trim()}>
    {grouping && <button className={`layer-check ${checked.includes(section.id) ? 'checked' : ''}`} aria-label={`${layerLabel(section)} 그룹 선택`} onClick={() => toggleChecked(section.id)}>{checked.includes(section.id) ? <Check/> : '선택'}</button>}
    <button className="layer-main" onClick={() => onSelect(section.id)}><GripVertical/><span><b>{String(index + 1).padStart(2, '0')}</b>{layerLabel(section)}</span></button>
    {!grouping && <span className="layer-move"><button aria-label={`${layerLabel(section)} 위로 이동`} disabled={index === 0} onClick={() => onMove(section.id, -1)}><ChevronUp/></button><button aria-label={`${layerLabel(section)} 아래로 이동`} disabled={index === sections.length - 1} onClick={() => onMove(section.id, 1)}><ChevronDown/></button></span>}
  </div>
  const entries: React.ReactNode[] = []
  sections.forEach((section, index) => {
    const group = groupByFirstSection.get(section.id)
    if (group) {
      entries.push(<section key={group.id} className={`content-group ${group.collapsed ? 'collapsed' : ''}`}>
        <div className="content-group-head">
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
  return <><div className="panel-heading"><div><p>PAGE STRUCTURE</p><h2>레이어</h2></div><span>{sections.length}</span></div><div className="layer-group-actions">{grouping ? <><small><b>각 블록 맨 왼쪽의 ‘선택’ 버튼</b>을 눌러 연속 블록을 2개 이상 고르세요.</small><button onClick={createGroup} disabled={checked.length < 2}><Check/> 묶기 {checked.length}</button><button onClick={() => { setGrouping(false); setChecked([]) }}><X/> 취소</button></> : <button onClick={() => setGrouping(true)}><Plus/> 그룹 만들기</button>}</div><div className="layer-list">{entries}</div></> }

function PageCover({ project, onStartBlank, onStartSample, onImport }: { project: Project; onStartBlank: () => void; onStartSample: () => void; onImport: () => void }) {
  const isBlank = !project.page.title.trim() && !project.page.subtitle.trim() && !project.page.destination.trim() && project.sections.length === 0 && project.assets.length === 0
  if (isBlank) return <header className="page-cover blank-cover" aria-label="새 기획안 시작"><div className="quick-start-mark"><Blocks/></div><p className="quick-start-kicker">NAEIL SPECIAL CANVAS</p><strong>어떻게 시작할까요?</strong><p>처음이라면 샘플을 열어 편집 흐름을 익혀 보세요.</p><div className="quick-start-actions"><button className="primary-button" onClick={onStartBlank}><Plus/> 빈 기획안 시작</button><button className="quick-start-button" onClick={onStartSample}><Sparkles/> 샘플 기획안으로 연습</button><button className="quick-start-button" onClick={onImport}><FileJson/> AI가 만든 JSON 불러오기</button></div></header>
  return null
}
function EditableLayoutBox({ box, active, onSelect, onChange, children }: { box: BlockBox; active: boolean; onSelect: () => void; onChange: (next: BlockBox) => void; children: React.ReactNode }) {
  const [draft, setDraft] = useState<BlockBox | null>(null)
  const visible = draft || box
  useEffect(() => setDraft(null), [box.column, box.row, box.columnSpan, box.rowSpan, box.zIndex])
  const interact = (event: React.PointerEvent<HTMLButtonElement>, mode: 'move' | 'resize') => {
    event.preventDefault(); event.stopPropagation(); onSelect()
    const canvas = event.currentTarget.closest('.section-layout-canvas') as HTMLElement | null
    if (!canvas) return
    const rect = canvas.getBoundingClientRect(); const start = { ...box }; let next = { ...box }
    const move = (pointer: PointerEvent) => {
      const deltaColumn = Math.round((pointer.clientX - event.clientX) / (rect.width / 12))
      const deltaRow = Math.round((pointer.clientY - event.clientY) / 58)
      if (mode === 'move') next = { ...start, column: Math.max(1, Math.min(13 - start.columnSpan, start.column + deltaColumn)), row: Math.max(1, Math.min(80, start.row + deltaRow)) }
      else { const columnSpan = Math.max(2, Math.min(13 - start.column, start.columnSpan + deltaColumn)); const rowSpan = Math.max(2, Math.min(18, start.rowSpan + deltaRow)); next = { ...start, columnSpan, rowSpan } }
      setDraft(next)
    }
    const finish = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); setDraft(null); onChange(next) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish)
  }
  return <article className={`layout-box layout-box-${box.kind} ${active ? 'active' : ''}`} style={{ left: `${(visible.column - 1) / 12 * 100}%`, top: `${(visible.row - 1) * 58}px`, width: `${visible.columnSpan / 12 * 100}%`, height: `${visible.rowSpan * 58}px`, zIndex: visible.zIndex }} onClick={event => { event.stopPropagation(); onSelect() }}>
    <button className="layout-box-drag" aria-label={`${box.kind} 박스 이동`} onPointerDown={event => interact(event, 'move')}><GripVertical/><span>{box.kind === 'content' ? '기본 내용' : box.kind === 'media' ? '기본 이미지' : box.kind === 'text' ? '텍스트' : '이미지'}</span></button>
    <div className="layout-box-body">{children}</div>
    {active && <button className="layout-box-resize" aria-label="박스 크기 조절" onPointerDown={event => interact(event, 'resize')}/>} 
  </article>
}

function InlineText({ tag = 'span', value, className = '', multiline = false, readOnly = false, onEditStart, onChange, children }: { tag?: InlineTag; value: string; className?: string; multiline?: boolean; readOnly?: boolean; onEditStart?: () => void; onChange: (value: string) => void; children?: React.ReactNode }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])
  const start = (event: React.MouseEvent) => { if (readOnly) return; event.preventDefault(); event.stopPropagation(); onEditStart?.(); setDraft(value); setEditing(true) }
  const commitValue = () => { setEditing(false); if (draft !== value) onChange(draft) }
  const cancel = () => { setDraft(value); setEditing(false) }
  const keyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    event.stopPropagation()
    if (event.key === 'Escape') { event.preventDefault(); cancel() }
    if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) { event.preventDefault(); commitValue() }
  }
  if (editing) {
    const props = { ref: inputRef, className: `inline-edit-input inline-edit-${tag} ${className}`, value: draft, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value), onBlur: commitValue, onKeyDown: keyDown, onClick: (event: React.MouseEvent) => event.stopPropagation() }
    return multiline ? <textarea {...props} rows={Math.max(2, draft.split('\n').length)}/> : <input {...props}/>
  }
  const Component = tag as React.ElementType
  return <Component className={`${className} inline-editable ${multiline ? 'multiline-text' : ''}`.trim()} title={readOnly ? undefined : '더블클릭해서 수정'} onDoubleClick={start}>{children ?? value}</Component>
}

function RichText({ tag = 'span', value, className = '', readOnly = false, onEditStart, onChange }: { tag?: InlineTag; value: string; className?: string; readOnly?: boolean; onEditStart?: () => void; onChange: (value: string) => void }) {
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const safeValue = sanitizeRichText(value)
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); const selection = window.getSelection(); const range = document.createRange(); range.selectNodeContents(ref.current); range.collapse(false); selection?.removeAllRanges(); selection?.addRange(range) } }, [editing])
  const commitValue = () => { const next = sanitizeRichText(ref.current?.innerHTML || ''); setEditing(false); if (next !== safeValue) onChange(next) }
  const Component = tag as React.ElementType
  if (editing) return <Component ref={ref} className={`${className} rich-inline-editable`} contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: safeValue }} onBlur={commitValue} onKeyDown={(event: React.KeyboardEvent) => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); setEditing(false) } if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); commitValue() } }} onClick={(event: React.MouseEvent) => event.stopPropagation()}/>
  return <Component className={`${className} rich-inline-render`} title={readOnly ? undefined : '더블클릭해서 수정'} onDoubleClick={(event: React.MouseEvent) => { if (readOnly) return; event.preventDefault(); event.stopPropagation(); onEditStart?.(); setEditing(true) }} dangerouslySetInnerHTML={{ __html: safeValue }}/>
}

function RichTextEditor({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const focusedRef = useRef(false)
  const composingRef = useRef(false)
  // Do not control contentEditable with innerHTML while it is being typed in.
  // Re-injecting HTML on every Korean IME composition moves the caret and makes
  // characters appear to be pushed sideways.
  useEffect(() => {
    if (ref.current && !focusedRef.current) ref.current.innerHTML = sanitizeRichText(value)
  }, [value])
  const commitValue = () => {
    const next = sanitizeRichText(ref.current?.innerHTML || '')
    if (next !== sanitizeRichText(value)) onChange(next)
  }
  const syncWhileTyping = () => {
    // The editable DOM owns text while typing. Persist once on blur instead of
    // creating an undo snapshot for every Korean syllable or space.
    if (composingRef.current) return
  }
  const applyCommand = (command: string, commandValue?: string) => {
    const editor = ref.current
    if (!editor) return
    const selection = window.getSelection()
    const selectedInsideEditor = Boolean(selection?.rangeCount && !selection.isCollapsed && selection.anchorNode && editor.contains(selection.anchorNode))
    if (!selectedInsideEditor) {
      const range = document.createRange()
      range.selectNodeContents(editor)
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
    editor.focus()
    document.execCommand(command, false, commandValue)
    onChange(sanitizeRichText(editor.innerHTML))
  }
  return <div className="field rich-text-field"><span>{label}</span><div className="rich-text-toolbar" onMouseDown={event => event.preventDefault()}><button type="button" tabIndex={-1} aria-label="굵게" title="선택 문장 굵게 · 선택하지 않으면 전체 적용" onClick={() => applyCommand('bold')}><strong>B</strong></button><span className="rich-text-divider"/>{RICH_TEXT_COLORS.map(color => <button key={color.value} type="button" tabIndex={-1} aria-label={`${color.label} 글자색`} title={`${color.label} · 선택하지 않으면 전체 적용`} className="rich-text-color" style={{ '--swatch': color.value } as React.CSSProperties} onClick={() => applyCommand('foreColor', color.value)}/>) }<span className="rich-text-divider"/>{RICH_TEXT_SIZES.map(size => <button key={size.value} type="button" tabIndex={-1} title={`글자 크기 ${size.label} · 선택하지 않으면 전체 적용`} className="rich-text-size" onClick={() => applyCommand('fontSize', size.command)}>{size.label}</button>)}</div><div ref={ref} className="rich-text-editor" role="textbox" aria-label={label} aria-multiline={rows > 1} contentEditable suppressContentEditableWarning data-rows={rows} onFocus={() => { focusedRef.current = true }} onBlur={() => { focusedRef.current = false; commitValue() }} onCompositionStart={() => { composingRef.current = true }} onCompositionEnd={() => { composingRef.current = false }} onInput={syncWhileTyping}/><small className="rich-text-hint">문장을 드래그해 서식을 적용하세요. 선택하지 않으면 전체 문장에 적용됩니다.</small></div>
}

function MultilineText({ value }: { value: string }) {
  return <>{value.split('\n').map((line, i) => <span key={i}>{line}<br/></span>)}</>
}

type CommonTextValue = { eyebrow: string; title: string; body: string }
function CommonText({ value, readOnly, onChange, onEditStart, className = '', children }: { value: CommonTextValue; readOnly: boolean; onChange: (patch: Partial<CommonTextValue>) => void; onEditStart?: () => void; className?: string; children?: React.ReactNode }) {
  return <div className={`section-text-content ${className}`.trim()} data-guide="copy-area">
    {!isRichTextEmpty(value.eyebrow) && <InlineText tag="p" className="section-eyebrow" value={value.eyebrow} readOnly={readOnly} onEditStart={onEditStart} onChange={eyebrow => onChange({ eyebrow })}/>}
    {!isRichTextEmpty(value.title) && <RichText tag="h2" value={value.title} readOnly={readOnly} onEditStart={onEditStart} onChange={title => onChange({ title })}/>} 
    {!isRichTextEmpty(value.body) && <RichText tag="p" className="section-body" value={value.body} readOnly={readOnly} onEditStart={onEditStart} onChange={body => onChange({ body })}/>} 
    {children}
  </div>
}

function SpecialLayoutSection({ section, assets, dragProps, selectedItemIndex, selectedSpecialMediaIndex, readOnly, onSelectItem, onSelectMedia, onClearTimelineMedia, onDeleteTimelineDay, onSectionChange, onUpdateItem, itemActions }: { section: Section; assets: MediaAsset[]; dragProps: (assetId: string) => React.ImgHTMLAttributes<HTMLImageElement>; selectedItemIndex: number | null; selectedSpecialMediaIndex: number | null; readOnly: boolean; onSelectItem: (index: number) => void; onSelectMedia: (index: number) => void; onClearTimelineMedia: (sectionId: string, mediaIndex: number) => void; onDeleteTimelineDay: (sectionId: string, dayIndex: number) => void; onSectionChange: (patch: Partial<Section>) => void; onUpdateItem: (index: number, value: string | string[] | Partial<IconCardItem>) => void; itemActions: (index: number, total: number) => React.ReactNode }) {
  const media = section.mediaIds.map(id => assets.find(asset => asset.id === id))
  const imageFocus = (asset?: MediaAsset): ImageFocus => asset ? section.mediaLayoutItems?.find(item => item.assetId === asset.id)?.focus || 'center center' : 'center center'
  const image = (asset: MediaAsset | undefined, mediaIndex: number, label: string, className = '') => { const hero = section.type === 'timeline' && mediaIndex === 0; if (hero && section.timelineHeroVisible === false) return null; const showRemove = section.type === 'timeline' && !hero && selectedSpecialMediaIndex === mediaIndex; return <div className={`special-media-frame ${selectedSpecialMediaIndex === mediaIndex ? 'active' : ''} ${hero ? 'timeline-hero-frame' : ''}`} onClick={event => { event.stopPropagation(); onSelectMedia(mediaIndex) }}>{hero && <button className="timeline-hero-remove" onClick={event => { event.stopPropagation(); onSectionChange({ timelineHeroVisible: false }) }}><Trash2/> 히어로 이미지 삭제</button>}{asset ? <><img className={className} src={asset.src} alt={asset.alt || asset.name} style={{ objectPosition: imageFocus(asset) }} {...dragProps(asset.id)}/><span className="special-media-label" title={asset.src.startsWith('http') ? asset.src : asset.name}>{asset.src.startsWith('http') ? asset.src : asset.name}</span>{showRemove && <button className="special-media-remove" onClick={event => { event.stopPropagation(); onClearTimelineMedia(section.id, mediaIndex) }}><Trash2/> 이미지 삭제</button>}</> : <div className={`special-media-placeholder ${className}`}><ImageIcon/><span>이미지 연결</span></div>}</div> }
  const select = (event: React.MouseEvent, itemIndex: number) => { event.stopPropagation(); onSelectItem(itemIndex) }
  if (section.type === 'caption-grid') { const caption = (itemIndex: number) => { const value = splitPair(section.items[itemIndex] || ''); const update = (title: string, body: string) => onUpdateItem(itemIndex, joinPair(title, body)); return <figcaption><InlineText tag="strong" value={value.title} readOnly={readOnly} onEditStart={() => onSelectItem(itemIndex)} onChange={title => update(title, value.body)}/><InlineText tag="span" value={value.body} multiline readOnly={readOnly} onEditStart={() => onSelectItem(itemIndex)} onChange={body => update(value.title, body)}/></figcaption> }; return <div className="special-block caption-grid-block"><CommonText className="special-common-copy caption-grid-copy" value={{ eyebrow: section.eyebrow, title: section.title, body: section.body }} readOnly={readOnly} onChange={onSectionChange}/><div className="caption-grid">{section.items.map((_, itemIndex) => <figure key={itemIndex} className={selectedItemIndex === itemIndex ? 'active' : ''} onClick={event => select(event, itemIndex)}>{itemActions(itemIndex, section.items.length)}{image(media[itemIndex], itemIndex, `이미지 ${itemIndex + 1}`)}{caption(itemIndex)}</figure>)}</div></div> }
  if (section.type === 'menu-zigzag') {
    return <div className="special-block menu-zigzag-block"><CommonText className="special-common-copy" value={{ eyebrow: section.eyebrow, title: section.title, body: section.body }} readOnly={readOnly} onChange={onSectionChange}/><div className="menu-zigzag">{section.items.map((item, itemIndex) => { const parsed = splitPair(item); const update = (title: string, body: string) => onUpdateItem(itemIndex, joinPair(title, body)); const reversed = Boolean(section.menuItemReversed?.[itemIndex]); return <article key={itemIndex} className={`${selectedItemIndex === itemIndex ? 'active' : ''} ${reversed ? 'is-reversed' : ''}`.trim()} onClick={event => select(event, itemIndex)}>{itemActions(itemIndex, section.items.length)}{image(media[itemIndex], itemIndex, `추천 이미지 ${itemIndex + 1}`)}<div><InlineText tag="h3" value={parsed.title} readOnly={readOnly} onEditStart={() => onSelectItem(itemIndex)} onChange={title => update(title, parsed.body)}/><InlineText tag="p" value={parsed.body} multiline readOnly={readOnly} onEditStart={() => onSelectItem(itemIndex)} onChange={body => update(parsed.title, body)}/></div></article> })}</div></div>
  }
  const dayStarts = section.timelineDayStarts || []
  return <div className="special-block timeline-block"><CommonText className="special-common-copy" value={{ eyebrow: section.eyebrow, title: section.title, body: section.body }} readOnly={readOnly} onChange={onSectionChange}/><div className="timeline-reference-body">{image(media[0], 0, '대표 이미지', 'timeline-hero')}<div className="timeline-list">{section.items.map((item, itemIndex) => { const parsed = splitTimeline(item); const update = (time: string, title: string, body: string) => onUpdateItem(itemIndex, joinTimeline(time, title, body)); const day = dayStarts.indexOf(itemIndex) + 1; return <div className="timeline-day" key={itemIndex}>{day > 0 && <p className="timeline-day-label"><span>{day}일차</span>{dayStarts.length > 1 && <button className="timeline-day-remove" onClick={event => { event.stopPropagation(); onDeleteTimelineDay(section.id, day - 1) }}><Trash2/> 일차 삭제</button>}</p>}<article className={selectedItemIndex === itemIndex ? 'active' : ''} onClick={event => select(event, itemIndex)}>{itemActions(itemIndex, section.items.length)}<div className="timeline-copy"><b><InlineText tag="span" value={parsed.time} readOnly={readOnly} onEditStart={() => onSelectItem(itemIndex)} onChange={time => update(time, parsed.title, parsed.body)}/> <InlineText tag="span" value={parsed.title} readOnly={readOnly} onEditStart={() => onSelectItem(itemIndex)} onChange={title => update(parsed.time, title, parsed.body)}/></b><InlineText tag="p" value={parsed.body} multiline readOnly={readOnly} onEditStart={() => onSelectItem(itemIndex)} onChange={body => update(parsed.time, parsed.title, body)}/></div>{image(media[itemIndex + 1], itemIndex + 1, `일정 이미지 ${itemIndex + 1}`)}</article></div> })}</div></div></div>
}

function SectionView({ section, assets, selected, readOnly, activeBoxId, activeItemIndex, activeSpecialMediaIndex, index, total, onSelect, onSelectBox, onSelectItem, onSelectSpecialMedia, onClearTimelineMedia, onSetTimelineHeroVisible, onDeleteTimelineDay, onSectionChange, onBoxChange, onUpdateItem, onAddFlowBox, onMoveFlowBox, onDeleteFlowBox, onAddItem, onAddTimelineDay, onInsertItem, onDuplicateItem, onMoveItem, onReorderIconCard, onDeleteItem, onToggleMenuItemLayout, onMove, onDuplicate, onDelete, onSwapMedia, onAddLibraryMedia }: { section: Section; assets: MediaAsset[]; selected: boolean; readOnly: boolean; activeBoxId: string; activeItemIndex: number | null; activeSpecialMediaIndex: number | null; index: number; total: number; onSelect: () => void; onSelectBox: (id: string) => void; onSelectItem: (index: number) => void; onSelectSpecialMedia: (index: number) => void; onClearTimelineMedia: (sectionId: string, mediaIndex: number) => void; onSetTimelineHeroVisible: (sectionId: string, visible: boolean) => void; onDeleteTimelineDay: (sectionId: string, dayIndex: number) => void; onSectionChange: (patch: Partial<Section>) => void; onBoxChange: (boxId: string, patch: Partial<BlockBox>) => void; onUpdateItem: (index: number, value: string | string[] | Partial<IconCardItem>) => void; onAddFlowBox: (sectionId: string, kind: 'text' | 'image') => void; onMoveFlowBox: (sectionId: string, boxId: string, direction: -1 | 1) => void; onDeleteFlowBox: (sectionId: string, boxId: string) => void; onAddItem: (sectionId: string) => void; onAddTimelineDay: (sectionId: string) => void; onInsertItem: (sectionId: string, index: number, placement: 'above' | 'below') => void; onDuplicateItem: (sectionId: string, index: number) => void; onMoveItem: (sectionId: string, index: number, direction: -1 | 1) => void; onReorderIconCard: (sectionId: string, fromIndex: number, insertionIndex: number) => void; onDeleteItem: (sectionId: string, index: number) => void; onToggleMenuItemLayout: (sectionId: string, index: number) => void; onMove: (id: string, d: -1 | 1) => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void; onSwapMedia: (sectionId: string, fromAssetId: string, toAssetId: string) => void; onAddLibraryMedia: (sectionId: string, boxId: string, assetId: string) => void }) {
  const boxes = normalizeLayoutBoxes(section).filter(box => !(box.kind === 'media' && !(box.assetIds || []).length && section.type !== 'image'))
  const tableHeaders = section.tableHeaders?.length ? section.tableHeaders : ['구분', '내용']
  const tableRows = (section.tableRows || []).map(row => tableHeaders.map((_, itemIndex) => row[itemIndex] || ''))
  const iconCards = section.iconCards || []
  const [draggedIconCardIndex, setDraggedIconCardIndex] = useState<number | null>(null)
  const [iconCardDropIndex, setIconCardDropIndex] = useState<number | null>(null)
  const listStyle = section.type === 'offer' || section.listStyle === 'offer' ? 'offer' : 'list'
  const isItemPreset = ['list', 'offer', 'table', 'icon-card', 'caption-grid', 'menu-zigzag', 'timeline'].includes(section.type)
  const visibleMediaBox = boxes.find(box => (box.kind === 'media' || box.kind === 'image') && (box.assetIds || []).length)
  const dragProps = (assetId: string) => ({ draggable: true, onDragStart: (event: React.DragEvent<HTMLElement>) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', assetId); event.dataTransfer.setData('application/x-naeil-canvas-asset', assetId); event.currentTarget.classList.add('is-dragging') }, onDragEnd: (event: React.DragEvent<HTMLElement>) => event.currentTarget.classList.remove('is-dragging') })
  const dropProps = (boxId: string, targetAssetId?: string) => ({
    onDragOver: (event: React.DragEvent<HTMLElement>) => { event.preventDefault(); event.dataTransfer.dropEffect = event.dataTransfer.types.includes('application/x-naeil-library-asset') ? 'copy' : 'move'; event.currentTarget.classList.add('is-drop-target') },
    onDragLeave: (event: React.DragEvent<HTMLElement>) => event.currentTarget.classList.remove('is-drop-target'),
    onDrop: (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault(); event.stopPropagation(); event.currentTarget.classList.remove('is-drop-target')
      const libraryAssetId = event.dataTransfer.getData('application/x-naeil-library-asset')
      const canvasAssetId = event.dataTransfer.getData('application/x-naeil-canvas-asset') || event.dataTransfer.getData('text/plain')
      onSelectBox(boxId)
      if (libraryAssetId) {
        if (targetAssetId) onSwapMedia(section.id, libraryAssetId, targetAssetId)
        else onAddLibraryMedia(section.id, boxId, libraryAssetId)
      } else if (canvasAssetId && targetAssetId) onSwapMedia(section.id, canvasAssetId, targetAssetId)
    },
  })
  const specialDragProps = (assetId: string) => ({
    ...dragProps(assetId),
    onDragOver: (event: React.DragEvent<HTMLElement>) => { event.preventDefault(); event.dataTransfer.dropEffect = event.dataTransfer.types.includes('application/x-naeil-library-asset') ? 'copy' : 'move'; event.currentTarget.classList.add('is-drop-target') },
    onDragLeave: (event: React.DragEvent<HTMLElement>) => event.currentTarget.classList.remove('is-drop-target'),
    onDrop: (event: React.DragEvent<HTMLElement>) => { event.preventDefault(); event.currentTarget.classList.remove('is-drop-target'); const fromAssetId = event.dataTransfer.getData('application/x-naeil-library-asset') || event.dataTransfer.getData('application/x-naeil-canvas-asset') || event.dataTransfer.getData('text/plain'); if (fromAssetId) onSwapMedia(section.id, fromAssetId, assetId) },
  })
  const itemActions = (itemIndex: number, itemTotal: number) => selected && activeItemIndex === itemIndex ? <div className="preset-item-actions" onClick={event => event.stopPropagation()}>{section.type !== 'menu-zigzag' && <button aria-label={section.type === 'caption-grid' ? '위에 이미지 1행 추가' : '위에 항목 추가'} title={section.type === 'caption-grid' ? '위에 이미지 1행 추가' : '위에 추가'} onClick={() => onInsertItem(section.id, itemIndex, 'above')}><Plus/></button>}<button aria-label="항목 위로" title="위로 이동" disabled={itemIndex === 0} onClick={() => onMoveItem(section.id, itemIndex, -1)}><ChevronUp/></button><button aria-label="항목 아래로" title="아래로 이동" disabled={itemIndex === itemTotal - 1} onClick={() => onMoveItem(section.id, itemIndex, 1)}><ChevronDown/></button>{section.type === 'menu-zigzag' ? <button aria-label="이미지와 텍스트 위치 반전" title="이미지·텍스트 반전" onClick={() => onToggleMenuItemLayout(section.id, itemIndex)}><ArrowLeftRight/></button> : <button aria-label={section.type === 'caption-grid' ? '아래에 이미지 1행 추가' : '아래에 항목 추가'} title={section.type === 'caption-grid' ? '아래에 이미지 1행 추가' : '아래에 추가'} onClick={() => onInsertItem(section.id, itemIndex, 'below')}><Plus/></button>}<button aria-label="항목 복제" title="복제" onClick={() => onDuplicateItem(section.id, itemIndex)}><Copy/></button><button aria-label="항목 삭제" title="삭제" className="danger" onClick={() => onDeleteItem(section.id, itemIndex)}><Trash2/></button></div> : null
  const updateTableCell = (rowIndex: number, cellIndex: number, value: string) => onUpdateItem(rowIndex, tableRows.map((row, index) => index === rowIndex ? row.map((cell, column) => column === cellIndex ? value : cell) : row)[rowIndex])
  const fullText = <CommonText value={{ eyebrow: section.eyebrow, title: section.title, body: section.body }} readOnly={readOnly} onChange={onSectionChange}>
    {section.type === 'table' && <div className="section-table">{[
      <div key="head" className="section-table-head" style={{ gridTemplateColumns: `repeat(${tableHeaders.length}, minmax(0, 1fr))` }}>{tableHeaders.map((header, itemIndex) => <InlineText key={itemIndex} tag="b" value={header} readOnly={readOnly} onChange={value => onSectionChange({ tableHeaders: tableHeaders.map((item, index) => index === itemIndex ? value : item) })}/>)}</div>,
      ...tableRows.map((row, rowIndex) => <div key={rowIndex} className={selected && activeItemIndex === rowIndex ? 'active' : ''} onClick={event => { event.stopPropagation(); onSelectItem(rowIndex) }} style={{ gridTemplateColumns: `repeat(${tableHeaders.length}, minmax(0, 1fr))` }}>{row.map((cell, cellIndex) => <InlineText key={cellIndex} tag="span" value={cell} readOnly={readOnly} onEditStart={() => onSelectItem(rowIndex)} onChange={value => updateTableCell(rowIndex, cellIndex, value)}/>)}{itemActions(rowIndex, tableRows.length)}</div>)
    ]}</div>}
    {section.type === 'icon-card' && <div className={`icon-card-grid icon-card-count-${Math.min(iconCards.length, 3)}`}>{iconCards.map((card, itemIndex) => { const { Icon } = iconCardOption(card.icon); const dropBefore = iconCardDropIndex === itemIndex; return <article key={card.id} className={`icon-card tone-${card.tone} ${selected && activeItemIndex === itemIndex ? 'active' : ''} ${draggedIconCardIndex === itemIndex ? 'is-dragging' : ''} ${dropBefore ? 'is-drop-target' : ''}`.trim()} onClick={event => { event.stopPropagation(); onSelectItem(itemIndex) }} onDragOver={event => { if (draggedIconCardIndex === null || draggedIconCardIndex === itemIndex) return; event.preventDefault(); setIconCardDropIndex(itemIndex) }} onDrop={event => { event.preventDefault(); if (draggedIconCardIndex !== null && draggedIconCardIndex !== itemIndex) onReorderIconCard(section.id, draggedIconCardIndex, itemIndex); setDraggedIconCardIndex(null); setIconCardDropIndex(null) }}><button className="icon-card-drag-handle" draggable aria-label={`${itemIndex + 1}번 카드 순서 변경`} title="드래그해서 카드 순서 변경" onClick={event => event.stopPropagation()} onDragStart={event => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', card.id); setDraggedIconCardIndex(itemIndex) }} onDragEnd={() => { setDraggedIconCardIndex(null); setIconCardDropIndex(null) }}><GripVertical/></button>{itemActions(itemIndex, iconCards.length)}<i><Icon/></i><InlineText tag="strong" value={card.title} readOnly={readOnly} onEditStart={() => onSelectItem(itemIndex)} onChange={title => onUpdateItem(itemIndex, { title })}/><InlineText tag="span" value={card.body} multiline readOnly={readOnly} onEditStart={() => onSelectItem(itemIndex)} onChange={body => onUpdateItem(itemIndex, { body })}/></article> })}</div>}
    {(section.type === 'list' || section.type === 'offer') && section.items.length > 0 && <div className={`section-items items-${listStyle}`}>{section.items.map((item, itemIndex) => <div key={itemIndex} className={selected && activeItemIndex === itemIndex ? 'active' : ''} onClick={event => { event.stopPropagation(); onSelectItem(itemIndex) }}><b>{String(itemIndex + 1).padStart(2, '0')}</b><InlineText tag="span" value={item} multiline readOnly={readOnly} onEditStart={() => onSelectItem(itemIndex)} onChange={value => onUpdateItem(itemIndex, value)}/>{itemActions(itemIndex, section.items.length)}</div>)}</div>}
  </CommonText>
  const mediaFor = (box: BlockBox) => {
    const ids = box.assetIds || []
    const media = ids.map(id => assets.find(asset => asset.id === id)).filter(Boolean) as MediaAsset[]
    const customItems = normalizeCustomLayout(ids, section.mediaLayoutItems)
    if (!media.length) return <div data-guide="image-box" className={`media-placeholder ${selected && activeBoxId === box.id ? 'active' : ''}`} onClick={event => { event.stopPropagation(); onSelectBox(box.id) }} {...dropProps(box.id)}><ImageIcon/><span>라이브러리 이미지를 이곳에 놓아 바로 연결하세요.</span></div>
    return <div data-guide="image-box" className={`section-media media-count-${media.length} media-auto-${media.length === 1 ? 'single' : media.length % 2 === 0 ? 'even' : 'odd'} media-layout-${section.mediaLayout} ${selected && activeBoxId === box.id ? 'active' : ''}`} onClick={event => { event.stopPropagation(); onSelectBox(box.id) }} {...dropProps(box.id)}>{media.map(asset => { const entry = customItems.find(item => item.assetId === asset.id); const sourceLabel = asset.src.startsWith('http') ? asset.src : asset.name; const label = <figcaption className="media-asset-label" title={sourceLabel}>{sourceLabel}</figcaption>; return <figure key={asset.id} className={`media-asset-frame ${section.mediaLayout === 'custom' && entry ? 'custom-media-frame' : ''}`} style={section.mediaLayout === 'custom' && entry ? { gridColumn: `${entry.column} / span ${entry.columnSpan}`, gridRow: `${entry.row} / span ${entry.rowSpan}` } : undefined} {...dropProps(box.id, asset.id)}><img src={asset.src} alt={asset.alt || asset.name} style={section.mediaLayout === 'custom' && entry ? { objectPosition: entry.focus } : undefined} {...dragProps(asset.id)}/>{label}</figure> })}</div>
  }
  const tools = selected && <div className="section-tools" onClick={e => e.stopPropagation()}><button aria-label="블록 위로 이동" disabled={index === 0} onClick={() => onMove(section.id, -1)}><ChevronUp/></button><button aria-label="블록 아래로 이동" disabled={index === total - 1} onClick={() => onMove(section.id, 1)}><ChevronDown/></button><button aria-label="블록 복제" onClick={() => onDuplicate(section.id)}><Copy/></button><button aria-label="블록 삭제" className="danger" onClick={() => onDelete(section.id)}><Trash2/></button></div>
  if (SPECIAL_LAYOUT_TYPES.has(section.type)) return <section data-section-id={section.id} className={`page-section bg-white type-${section.type} ${selected ? 'selected' : ''} ${section.hidden ? 'is-hidden' : ''}`} onClick={onSelect}>
    {tools}<div className="section-type-tag">{SECTION_LABELS[section.type]}</div><SpecialLayoutSection section={section} assets={assets} dragProps={specialDragProps} selectedItemIndex={activeItemIndex} selectedSpecialMediaIndex={activeSpecialMediaIndex} readOnly={readOnly} onSelectItem={onSelectItem} onSelectMedia={onSelectSpecialMedia} onClearTimelineMedia={onClearTimelineMedia} onDeleteTimelineDay={onDeleteTimelineDay} onSectionChange={onSectionChange} onUpdateItem={onUpdateItem} itemActions={itemActions}/>{selected && <div className={`preset-canvas-add ${section.type === 'timeline' ? 'timeline-canvas-add' : ''}`} onClick={event => event.stopPropagation()}>{section.type === 'timeline' ? <><button onClick={() => onAddItem(section.id)}><Plus/> 일정 추가</button><button onClick={() => onAddTimelineDay(section.id)}><CalendarDays/> 일차 추가</button></> : <button onClick={() => onAddItem(section.id)}><Plus/> {section.type === 'caption-grid' ? '이미지 2개 추가' : '항목 추가'}</button>}</div>}{section.note && <InlineText tag="div" className="designer-note" value={section.note} multiline readOnly={readOnly} onChange={note => onSectionChange({ note })}>DESIGN NOTE · {section.note}</InlineText>}
  </section>
  if (section.type === 'text') {
    const flowBoxes = boxes.filter(box => box.kind === 'content' || box.kind === 'text').slice().sort((a, b) => a.row - b.row || a.column - b.column)
    return <section data-section-id={section.id} className={`page-section bg-white type-text image-flow-section text-flow-section ${selected ? 'selected' : ''} ${section.hidden ? 'is-hidden' : ''}`} onClick={onSelect}>
      {tools}<div className="section-type-tag">텍스트 흐름</div>
      <div className="image-flow-list">{flowBoxes.map((box, order) => <article key={box.id} className={`image-flow-card image-flow-card-${box.kind} ${selected && activeBoxId === box.id ? 'active' : ''}`} onClick={event => { event.stopPropagation(); onSelectBox(box.id) }}>
        <span className="image-flow-card-label">{box.kind === 'content' ? '기본 텍스트' : '텍스트'} {String(order + 1).padStart(2, '0')}</span>
        {selected && activeBoxId === box.id && <div className="image-flow-card-actions" onClick={event => event.stopPropagation()}><button aria-label="카드 위로" disabled={order === 0} onClick={() => onMoveFlowBox(section.id, box.id, -1)}><ChevronUp/></button><button aria-label="카드 아래로" disabled={order === flowBoxes.length - 1} onClick={() => onMoveFlowBox(section.id, box.id, 1)}><ChevronDown/></button>{box.kind === 'text' && <button aria-label="카드 삭제" className="danger" onClick={() => onDeleteFlowBox(section.id, box.id)}><Trash2/></button>}</div>}
        {box.kind === 'content' ? fullText : <CommonText value={{ eyebrow: box.eyebrow || '', title: box.title || '', body: box.text || '' }} readOnly={readOnly} onEditStart={() => onSelectBox(box.id)} onChange={patch => onBoxChange(box.id, { eyebrow: patch.eyebrow, title: patch.title, text: patch.body })}/>} 
      </article>)}</div>
      {selected && <div className="text-flow-canvas-add" onClick={event => event.stopPropagation()}><button onClick={() => onAddFlowBox(section.id, 'text')}><Plus/> 텍스트 추가</button></div>}
      {section.note && <InlineText tag="div" className="designer-note" value={section.note} multiline readOnly={readOnly} onChange={note => onSectionChange({ note })}>DESIGN NOTE · {section.note}</InlineText>}
    </section>
  }
  if (section.type === 'image') {
    const flowBoxes = boxes.slice().sort((a, b) => a.row - b.row || a.column - b.column)
    return <section data-section-id={section.id} className={`page-section bg-white type-image image-flow-section ${selected ? 'selected' : ''} ${section.hidden ? 'is-hidden' : ''}`} onClick={onSelect}>
      {tools}<div className="section-type-tag">이미지 흐름</div>
      <div className="image-flow-list">{flowBoxes.map((box, order) => <article key={box.id} className={`image-flow-card image-flow-card-${box.kind} ${selected && activeBoxId === box.id ? 'active' : ''}`} onClick={event => { event.stopPropagation(); onSelectBox(box.id) }}>
        <span className="image-flow-card-label">{box.kind === 'content' ? '기본 텍스트' : box.kind === 'media' ? '기본 이미지' : box.kind === 'text' ? '텍스트' : '이미지'} {String(order + 1).padStart(2, '0')}</span>
        {selected && activeBoxId === box.id && <div className="image-flow-card-actions" onClick={event => event.stopPropagation()}><button aria-label="카드 위로" disabled={order === 0} onClick={() => onMoveFlowBox(section.id, box.id, -1)}><ChevronUp/></button><button aria-label="카드 아래로" disabled={order === flowBoxes.length - 1} onClick={() => onMoveFlowBox(section.id, box.id, 1)}><ChevronDown/></button><button aria-label="카드 삭제" className="danger" onClick={() => onDeleteFlowBox(section.id, box.id)}><Trash2/></button></div>}
        {box.kind === 'content' ? fullText : box.kind === 'text' ? <CommonText className="flow-extra-copy" value={{ eyebrow: box.eyebrow || '', title: box.title || '', body: box.text || '' }} readOnly={readOnly} onEditStart={() => onSelectBox(box.id)} onChange={patch => onBoxChange(box.id, { eyebrow: patch.eyebrow, title: patch.title, text: patch.body })}/> : mediaFor(box)}
      </article>)}</div>
      {selected && <div className="image-flow-canvas-add" onClick={event => event.stopPropagation()}><button onClick={() => onAddFlowBox(section.id, 'text')}><Plus/> 텍스트 추가</button><button onClick={() => onAddFlowBox(section.id, 'image')}><ImageIcon/> 이미지 추가</button></div>}
      {section.note && <InlineText tag="div" className="designer-note" value={section.note} multiline readOnly={readOnly} onChange={note => onSectionChange({ note })}>DESIGN NOTE · {section.note}</InlineText>}
    </section>
  }
  return <section data-section-id={section.id} className={`page-section bg-white type-${section.type} ${selected ? 'selected' : ''} ${section.hidden ? 'is-hidden' : ''}`} onClick={onSelect}>
    {tools}
    <div className="section-type-tag">{SECTION_LABELS[section.type]}</div><div className={`section-composition content-layout-${section.contentLayout || 'text-top'}`}>{fullText}{visibleMediaBox && mediaFor(visibleMediaBox)}</div>{selected && isItemPreset && <div className="preset-canvas-add" onClick={event => event.stopPropagation()}><button onClick={() => onAddItem(section.id)}><Plus/> {section.type === 'table' ? '행 추가' : section.type === 'icon-card' ? '카드 추가' : section.type === 'caption-grid' ? '이미지 2개 추가' : '항목 추가'}</button></div>}{section.note && <InlineText tag="div" className="designer-note" value={section.note} multiline readOnly={readOnly} onChange={note => onSectionChange({ note })}>DESIGN NOTE · {section.note}</InlineText>}
  </section>
}

function Inspector({ project, selected, selectedBox, selectedItemIndex, selectedSpecialMediaIndex, commit, updateSection, onAddBox, onDeleteBox, onChangeBox, onChangeBoxLayer, onMoveImageFlowBox, onUpdateItem, onDeleteItem, onLayoutChange, onLayoutItemChange, onLayoutPreset }: { project: Project; selected?: Section; selectedBox?: BlockBox; selectedItemIndex: number | null; selectedSpecialMediaIndex: number | null; commit: (f: (p: Project) => void) => void; updateSection: (p: Partial<Section>) => void; onAddBox: (sectionId: string, kind: 'text' | 'image') => void; onDeleteBox: (sectionId: string, boxId: string) => void; onChangeBox: (sectionId: string, boxId: string, patch: Partial<BlockBox>) => void; onChangeBoxLayer: (sectionId: string, boxId: string, amount: number) => void; onMoveImageFlowBox: (sectionId: string, boxId: string, direction: -1 | 1) => void; onUpdateItem: (sectionId: string, index: number, value: string | string[] | Partial<IconCardItem>) => void; onDeleteItem: (sectionId: string, index: number) => void; onLayoutChange: (sectionId: string, layout: Section['mediaLayout']) => void; onLayoutItemChange: (sectionId: string, assetId: string, patch: Partial<MediaLayoutItem>) => void; onLayoutPreset: (sectionId: string, items: MediaLayoutItem[]) => void }) {
  if (!selected) return <div className="inspector-body inspector-empty"><p>CANVAS</p><h2>블록을 선택하세요</h2><span>가운데 캔버스에서 편집할 블록을 선택하면 설정이 표시됩니다.</span></div>
  const copy = BLOCK_EDITOR_COPY[selected.type]
  const commonTextEditor = <CommonTextEditor value={{ eyebrow: selected.eyebrow, title: selected.title, body: selected.body }} lead={copy.lead} onChange={updateSection}/>
  if (selectedBox && (selectedBox.kind === 'media' || selectedBox.kind === 'image')) return <div className="inspector-body"><InspectorHeader eyebrow="IMAGE" title="선택 이미지 편집"/><BlockImageEditor section={selected} assets={project.assets} assetIds={selectedBox.assetIds || []} onLayout={mediaLayout => onLayoutChange(selected.id, mediaLayout)} onLayoutItemChange={(assetId, patch) => onLayoutItemChange(selected.id, assetId, patch)} onLayoutPreset={items => onLayoutPreset(selected.id, items)}/><section className="content-editor-group editor-note"><Field label="디자이너 메모"><textarea rows={2} placeholder="예: 이 이미지는 대표 컷으로 사용" value={selected.note} onChange={e => updateSection({ note: e.target.value })}/></Field></section></div>
  if (selectedItemIndex !== null && ITEM_PRESET_TYPES.has(selected.type)) return <div className="inspector-body"><InspectorHeader eyebrow="SELECTED ITEM" title="선택 항목 편집"/>{(selected.type === 'list' || selected.type === 'offer' || selected.type === 'table' || selected.type === 'icon-card' || REFERENCE_LAYOUT_TYPES.has(selected.type)) && commonTextEditor}{selected.type === 'list' && <label className="toggle list-style-toggle"><input type="checkbox" checked={selected.listStyle === 'offer'} onChange={event => updateSection({ listStyle: event.target.checked ? 'offer' : 'list' })}/><span/>특전형 강조</label>}<PresetItemEditor section={selected} index={selectedItemIndex} onChange={value => onUpdateItem(selected.id, selectedItemIndex, value)} onDelete={() => onDeleteItem(selected.id, selectedItemIndex)}/><section className="content-editor-group editor-note"><Field label="디자이너 메모"><textarea rows={3} placeholder="예: 첫 번째 이미지를 대표 컷으로, 제목은 2줄 이내" value={selected.note} onChange={event => updateSection({ note: event.target.value })}/></Field></section><p className="preset-editor-hint">아이콘 카드는 카드의 `⋮⋮` 핸들을 드래그해 순서를 바꿉니다. 복제는 가운데 캔버스의 선택 항목 도구에서 합니다.</p></div>
  const tableHeaders = selected.tableHeaders?.length ? selected.tableHeaders : ['구분', '내용']
  const tableRows = selected.tableRows || []
  const setTableColumns = (count: number) => updateSection({ tableHeaders: Array.from({ length: count }, (_, index) => tableHeaders[index] || (index === 0 ? '구분' : index === 1 ? '내용' : '비고')), tableRows: tableRows.map(row => Array.from({ length: count }, (_, index) => row[index] || '')) })
  if (selected.type === 'image') return <div className="inspector-body"><InspectorHeader eyebrow="IMAGE FLOW" title={selectedBox ? '선택 카드 편집' : '이미지 블록 편집'}/>{selectedBox && (selectedBox.kind === 'content' || selectedBox.kind === 'text') ? <FlowTextCardFields section={selected} box={selectedBox} onSectionChange={updateSection} onBoxChange={onChangeBox}/> : selectedBox ? <p className="image-flow-side-hint">이미지는 왼쪽 <b>이미지</b> 탭에서 이 카드에 연결하세요.</p> : <p className="image-flow-side-hint">가운데 캔버스에서 편집할 텍스트 또는 이미지 카드를 선택하세요.</p>}<section className="content-editor-group editor-note"><Field label="디자이너 메모"><textarea rows={2} placeholder="예: 이 이미지 아래에 안내문 추가" value={selected.note} onChange={e => updateSection({ note: e.target.value })}/></Field></section></div>
  if (selected.type === 'text') return <div className="inspector-body"><InspectorHeader eyebrow="TEXT FLOW" title={selectedBox ? '선택 텍스트 카드 편집' : '텍스트 블록 편집'}/>{selectedBox && (selectedBox.kind === 'content' || selectedBox.kind === 'text') ? <FlowTextCardFields section={selected} box={selectedBox} onSectionChange={updateSection} onBoxChange={onChangeBox}/> : <p className="image-flow-side-hint">가운데 캔버스에서 편집할 텍스트 카드를 선택하세요. 텍스트 추가는 블록 하단에서 할 수 있습니다.</p>}<section className="content-editor-group editor-note"><Field label="디자이너 메모"><textarea rows={2} placeholder="예: 이 문단 뒤에 안내 문구 추가" value={selected.note} onChange={e => updateSection({ note: e.target.value })}/></Field><label className="toggle"><input type="checkbox" checked={Boolean(selected.hidden)} onChange={e => updateSection({ hidden: e.target.checked })}/><span/>시안에서 숨기기</label></section></div>
  // @ts-expect-error Legacy image-inspector branch retained for source compatibility; handled above.
  if (selected.type === 'image' && selectedBox) return <div className="inspector-body"><InspectorHeader eyebrow="IMAGE FLOW" title="선택 카드 편집"/><ImageFlowEditor section={selected} selectedBox={selectedBox} onAdd={onAddBox} onChange={onChangeBox} onDelete={onDeleteBox} onMove={onMoveImageFlowBox}/><section className="content-editor-group editor-note"><Field label="디자이너 메모"><textarea rows={2} placeholder="예: 이 이미지 아래에 안내문 추가" value={selected.note} onChange={e => updateSection({ note: e.target.value })}/></Field></section></div>
  // When an added flow card is active, keep the inspector focused on that card.
  // The base section copy stays available only when the base text card is selected.
  // @ts-expect-error Legacy image-inspector branch retained for source compatibility; handled above.
  if (selected.type === 'image' && selectedBox && selectedBox.kind !== 'content') return <div className="inspector-body"><InspectorHeader eyebrow="IMAGE FLOW" title="선택 카드 편집"/><ImageFlowEditor section={selected} selectedBox={selectedBox} onAdd={onAddBox} onChange={onChangeBox} onDelete={onDeleteBox} onMove={onMoveImageFlowBox}/><section className="content-editor-group editor-note"><Field label="디자이너 메모"><textarea rows={2} placeholder="예: 이 이미지 아래에 안내문 추가" value={selected.note} onChange={e => updateSection({ note: e.target.value })}/></Field></section></div>
  // @ts-expect-error Legacy image-inspector branch retained for source compatibility; handled above.
  if (selected.type === 'image') return <div className="inspector-body"><InspectorHeader eyebrow="IMAGE FLOW" title="이미지 블록 편집"/><ImageFlowEditor section={selected} selectedBox={selectedBox} onAdd={onAddBox} onChange={onChangeBox} onDelete={onDeleteBox} onMove={onMoveImageFlowBox}/><section className="content-editor-group"><p>{copy.lead}</p><Field label={copy.eyebrow}><input placeholder={copy.eyebrowPlaceholder} value={selected.eyebrow} onChange={e => updateSection({ eyebrow: e.target.value })}/></Field><Field label={copy.title}><textarea rows={2} placeholder={copy.titlePlaceholder} value={selected.title} onChange={e => updateSection({ title: e.target.value })}/></Field><Field label={copy.body}><textarea rows={3} placeholder={copy.bodyPlaceholder} value={selected.body} onChange={e => updateSection({ body: e.target.value })}/></Field></section><section className="content-editor-group editor-note"><Field label="디자이너 메모"><textarea rows={3} placeholder="예: 이미지 다음에 시설 설명 추가" value={selected.note} onChange={e => updateSection({ note: e.target.value })}/></Field><label className="toggle"><input type="checkbox" checked={Boolean(selected.hidden)} onChange={e => updateSection({ hidden: e.target.checked })}/><span/>시안에서 숨기기</label></section></div>
  if (selected.type === 'list' || selected.type === 'offer') return <div className="inspector-body"><InspectorHeader eyebrow={SECTION_LABELS[selected.type].toUpperCase()} title="목록 블록 편집"/><section className="content-editor-group"><p>{copy.lead}</p><Field label={copy.eyebrow}><input placeholder={copy.eyebrowPlaceholder} value={selected.eyebrow} onChange={e => updateSection({ eyebrow: e.target.value })}/></Field><Field label={copy.title}><textarea rows={2} placeholder={copy.titlePlaceholder} value={selected.title} onChange={e => updateSection({ title: e.target.value })}/></Field><Field label={copy.body}><textarea rows={3} placeholder={copy.bodyPlaceholder} value={selected.body} onChange={e => updateSection({ body: e.target.value })}/></Field></section>{selected.type === 'list' && <label className="toggle list-style-toggle"><input type="checkbox" checked={selected.listStyle === 'offer'} onChange={e => updateSection({ listStyle: e.target.checked ? 'offer' : 'list' })}/><span/>특전형 강조</label>}<p className="preset-editor-hint">항목은 가운데 캔버스에서 선택하거나 하단 버튼으로 추가합니다.</p><section className="content-editor-group editor-note"><Field label="디자이너 메모"><textarea rows={3} placeholder="예: 첫 번째 항목을 가장 강조" value={selected.note} onChange={e => updateSection({ note: e.target.value })}/></Field><label className="toggle"><input type="checkbox" checked={Boolean(selected.hidden)} onChange={e => updateSection({ hidden: e.target.checked })}/><span/>시안에서 숨기기</label></section></div>
  return <div className="inspector-body"><InspectorHeader eyebrow={SECTION_LABELS[selected.type].toUpperCase()} title="블록 편집"/><section className="content-editor-group"><p>{copy.lead}</p><Field label={copy.eyebrow}><input placeholder={copy.eyebrowPlaceholder} value={selected.eyebrow} onChange={e => updateSection({ eyebrow: e.target.value })}/></Field><Field label={copy.title}><textarea rows={2} placeholder={copy.titlePlaceholder} value={selected.title} onChange={e => updateSection({ title: e.target.value })}/></Field><Field label={copy.body}><textarea rows={selected.type === 'timeline' ? 6 : 3} placeholder={copy.bodyPlaceholder} value={selected.body} onChange={e => updateSection({ body: e.target.value })}/></Field></section>{REFERENCE_LAYOUT_TYPES.has(selected.type) && <p className="preset-editor-hint">가운데 캔버스에서 항목 또는 이미지를 선택해 각각 편집합니다.</p>}{selected.type === 'table' ? <section className="content-editor-group"><h3>표 내용</h3><Field label="표 열"><select value={tableHeaders.length} onChange={e => setTableColumns(Number(e.target.value))}><option value={2}>2열 — 일정·조건·비교</option><option value={3}>3열 — 날짜·장소·내용</option></select></Field><div className="two-fields">{tableHeaders.map((header, index) => <Field key={index} label={`${index + 1}열 제목`}><input value={header} onChange={e => updateSection({ tableHeaders: tableHeaders.map((value, headerIndex) => headerIndex === index ? e.target.value : value) })}/></Field>)}</div><p className="preset-editor-hint">행 내용은 가운데 캔버스에서 행을 선택해 단건으로 편집합니다.</p></section> : selected.type === 'icon-card' ? <IconCardEditor cards={selected.iconCards || []} onChange={iconCards => updateSection({ iconCards })}/> : null}<section className="content-editor-group editor-note"><Field label="디자이너 메모"><textarea rows={3} placeholder="예: 첫 번째 이미지를 가장 크게, 제목은 2줄 이내" value={selected.note} onChange={e => updateSection({ note: e.target.value })}/></Field><label className="toggle"><input type="checkbox" checked={Boolean(selected.hidden)} onChange={e => updateSection({ hidden: e.target.checked })}/><span/>시안에서 숨기기</label></section>
    {!REFERENCE_LAYOUT_TYPES.has(selected.type) && <BlockImageEditor section={selected} assets={project.assets} onLayout={mediaLayout => onLayoutChange(selected.id, mediaLayout)} onLayoutItemChange={(assetId, patch) => onLayoutItemChange(selected.id, assetId, patch)} onLayoutPreset={items => onLayoutPreset(selected.id, items)}/>} 
  </div>
}
function ImageFlowEditor({ section, selectedBox, onAdd, onChange, onDelete, onMove }: { section: Section; selectedBox?: BlockBox; onAdd: (sectionId: string, kind: 'text' | 'image') => void; onChange: (sectionId: string, boxId: string, patch: Partial<BlockBox>) => void; onDelete: (sectionId: string, boxId: string) => void; onMove: (sectionId: string, boxId: string, direction: -1 | 1) => void }) {
  const boxes = normalizeLayoutBoxes(section).slice().sort((a, b) => a.row - b.row || a.column - b.column)
  const selectedIndex = selectedBox ? boxes.findIndex(box => box.id === selectedBox.id) : -1
  const label = (box: BlockBox) => box.kind === 'content' ? '기본 텍스트' : box.kind === 'media' ? '기본 이미지' : box.kind === 'text' ? (box.title || '텍스트 카드') : '이미지 카드'
  return <section className="image-flow-editor">
    <div className="image-flow-editor-head"><p>CONTENT FLOW</p><h3>텍스트·이미지 순서</h3><small>카드를 캔버스에서 선택한 뒤 위·아래 버튼으로 순서를 바꿉니다. 기본 텍스트와 기본 이미지는 삭제되지 않아 언제든 다시 구성할 수 있습니다.</small></div>
    <div className="image-flow-add"><button onClick={() => onAdd(section.id, 'text')}><Plus/> 텍스트 추가</button><button onClick={() => onAdd(section.id, 'image')}><ImageIcon/> 이미지 추가</button></div>
    <ol className="image-flow-order">{boxes.map((box, index) => <li key={box.id} className={selectedBox?.id === box.id ? 'active' : ''}><span>{String(index + 1).padStart(2, '0')}</span><b>{label(box)}</b><i>{box.kind === 'content' || box.kind === 'text' ? '텍스트' : '이미지'}</i></li>)}</ol>
    {selectedBox ? <div className="image-flow-selected"><div className="image-flow-selected-head"><b>{label(selectedBox)}</b><span>{selectedIndex + 1} / {boxes.length}</span></div><div className="image-flow-actions"><button disabled={selectedIndex <= 0} onClick={() => onMove(section.id, selectedBox.id, -1)}><ChevronUp/> 위로</button><button disabled={selectedIndex < 0 || selectedIndex >= boxes.length - 1} onClick={() => onMove(section.id, selectedBox.id, 1)}><ChevronDown/> 아래로</button>{selectedBox.kind !== 'content' && selectedBox.kind !== 'media' && <button className="danger" onClick={() => onDelete(section.id, selectedBox.id)}><Trash2/> 삭제</button>}</div>{selectedBox.kind === 'text' && <div className="image-flow-text-fields"><Field label="상단 분류"><input placeholder="예: HOTEL FACILITY" value={selectedBox.eyebrow || ''} onChange={event => onChange(section.id, selectedBox.id, { eyebrow: event.target.value })}/></Field><Field label="제목"><input placeholder="텍스트 카드 제목" value={selectedBox.title || ''} onChange={event => onChange(section.id, selectedBox.id, { title: event.target.value })}/></Field><Field label="본문"><textarea rows={4} placeholder="설명 문장을 입력하세요." value={selectedBox.text || ''} onChange={event => onChange(section.id, selectedBox.id, { text: event.target.value })}/></Field></div>}{(selectedBox.kind === 'media' || selectedBox.kind === 'image') && <p className="image-flow-image-help">왼쪽 <b>이미지</b> 탭에서 이 카드에 이미지를 연결하세요. 한 장이면 대표 이미지로, 여러 장이면 이미지 내부 레이아웃으로 표시됩니다.</p>}</div> : <p className="image-flow-empty">캔버스에서 편집할 텍스트 또는 이미지 카드를 선택하세요.</p>}
  </section>
}

function FlowTextCardFields({ section, box, onSectionChange, onBoxChange }: { section: Section; box: BlockBox; onSectionChange: (patch: Partial<Section>) => void; onBoxChange: (sectionId: string, boxId: string, patch: Partial<BlockBox>) => void }) {
  const base = box.kind === 'content'
  const value = base ? { eyebrow: section.eyebrow, title: section.title, body: section.body } : { eyebrow: box.eyebrow || '', title: box.title || '', body: box.text || '' }
  const update = (patch: Partial<CommonTextValue>) => base ? onSectionChange(patch) : onBoxChange(section.id, box.id, { eyebrow: patch.eyebrow, title: patch.title, text: patch.body })
  return <CommonTextEditor value={value} onChange={update} bodyRows={4}/>
}
function CommonTextEditor({ value, onChange, lead, bodyRows = 3 }: { value: CommonTextValue; onChange: (patch: Partial<CommonTextValue>) => void; lead?: string; bodyRows?: number }) {
  return <section className="content-editor-group common-text-editor"><h3>공통 텍스트</h3>{lead && <p>{lead}</p>}<Field label="Category Label"><input placeholder="Category Label" value={value.eyebrow} onFocus={event => event.currentTarget.select()} onChange={event => onChange({ eyebrow: event.target.value })}/></Field><RichTextEditor label="제목" value={value.title} rows={2} onChange={title => onChange({ title })}/><RichTextEditor label="본문" value={value.body} rows={bodyRows} onChange={body => onChange({ body })}/></section>
}

function BlockImageEditor({ section, assets, assetIds, onLayout, onLayoutItemChange, onLayoutPreset }: { section: Section; assets: MediaAsset[]; assetIds?: string[]; onLayout: (layout: Section['mediaLayout']) => void; onLayoutItemChange: (assetId: string, patch: Partial<MediaLayoutItem>) => void; onLayoutPreset: (items: MediaLayoutItem[]) => void }) {
  const [orientations, setOrientations] = useState<Record<string, ImageOrientation>>({})
  const activeMediaIds = assetIds || section.mediaIds
  const connected = activeMediaIds.map(id => assets.find(asset => asset.id === id)).filter(Boolean) as MediaAsset[]
  const showMosaicLayout = connected.length >= 3
  const customItems = normalizeCustomLayout(activeMediaIds, section.mediaLayoutItems)
  const imageSignature = connected.map(asset => `${asset.id}:${asset.src}`).join('|')
  useEffect(() => { let active = true; connected.forEach(asset => { const image = new Image(); image.onload = () => { if (!active) return; const orientation: ImageOrientation = Math.abs(image.naturalWidth - image.naturalHeight) < Math.min(image.naturalWidth, image.naturalHeight) * .12 ? 'square' : image.naturalHeight > image.naturalWidth ? 'portrait' : 'landscape'; setOrientations(current => current[asset.id] === orientation ? current : { ...current, [asset.id]: orientation }) }; image.src = asset.src }); return () => { active = false } }, [imageSignature])
  const recommendedPresets = layoutPresetsFor(activeMediaIds, orientations)
  if (!connected.length) return <p className="block-image-empty">왼쪽 <b>이미지</b> 탭에서 파일 또는 URL 이미지를 추가하세요.</p>
  return <section className="block-image-editor">
    <div className="block-image-editor-head"><div><b>이미지 내부 레이아웃</b><small>이미지 추가·제거는 왼쪽 이미지 라이브러리에서 합니다. 연결된 이미지의 배열과 크롭만 조절합니다.</small></div></div>
    {connected.length > 0 && <div className="image-layout-picker"><span>이미지 레이아웃</span><div>{([['auto','자동'],['stack','1열'],['grid-2','2단'],['grid-3','3단'],['custom','직접 편집']] as const).map(([layout, label]) => <button key={layout} className={section.mediaLayout === layout ? 'active' : ''} onClick={() => onLayout(layout)}>{label}</button>)}</div>{showMosaicLayout && <div className="image-layout-emphasis">{([['mosaic-left','강조 왼쪽'],['mosaic-right','강조 오른쪽'],['equal','균등형']] as const).map(([layout, label]) => <button key={layout} className={section.mediaLayout === layout ? 'active' : ''} onClick={() => onLayout(layout)}>{label}</button>)}</div>}</div>}
    {recommendedPresets.length > 0 && <div className="ratio-layout-presets"><div><b>비율 추천</b><small>세로·가로 이미지 조합을 읽어 3장 이상일 때만 제안합니다.</small></div><div className="ratio-preset-list">{recommendedPresets.map(preset => <button key={preset.id} onClick={() => onLayoutPreset(preset.items)}><span className="ratio-preset-preview">{preset.items.slice(0, 4).map(item => <i key={item.assetId} style={{ gridColumn: `${item.column} / span ${item.columnSpan}`, gridRow: `${item.row} / span ${item.rowSpan}` }}/>)}</span><span><b>{preset.label}</b><small>{preset.detail}</small></span></button>)}</div></div>}
    {section.mediaLayout === 'custom' && connected.length > 0 && <div className="custom-layout-editor"><div className="custom-layout-heading"><b>직접 배치</b><small>칸 수·높이·크롭을 조절하면 캔버스에 즉시 반영됩니다.</small></div>{connected.map((asset, index) => { const entry = customItems.find(item => item.assetId === asset.id)!; return <article key={asset.id} className="custom-layout-card"><img src={asset.src} alt=""/><div className="custom-layout-name"><b>{index + 1}</b><span>{asset.name}</span></div><div className="custom-layout-controls"><label>가로<select aria-label={`${asset.name} 가로 크기`} value={entry.columnSpan} onChange={event => onLayoutItemChange(asset.id, { columnSpan: Number(event.target.value) })}>{[3,4,5,6,7,8,9,12].map(value => <option key={value} value={value}>{value}/12</option>)}</select></label><label>세로<select aria-label={`${asset.name} 세로 크기`} value={entry.rowSpan} onChange={event => onLayoutItemChange(asset.id, { rowSpan: Number(event.target.value) })}>{[1,2,3,4,5,6].map(value => <option key={value} value={value}>{value}칸</option>)}</select></label><label>크롭<select aria-label={`${asset.name} 크롭 위치`} value={entry.focus} onChange={event => onLayoutItemChange(asset.id, { focus: event.target.value as ImageFocus })}>{FOCUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div><div className="custom-layout-move"><span>위치</span><button aria-label={`${asset.name} 위로`} onClick={() => onLayoutItemChange(asset.id, { row: entry.row - 1 })}>↑</button><button aria-label={`${asset.name} 왼쪽`} onClick={() => onLayoutItemChange(asset.id, { column: entry.column - 1 })}>←</button><button aria-label={`${asset.name} 오른쪽`} onClick={() => onLayoutItemChange(asset.id, { column: entry.column + 1 })}>→</button><button aria-label={`${asset.name} 아래로`} onClick={() => onLayoutItemChange(asset.id, { row: entry.row + 1 })}>↓</button></div></article> })}</div>}
  </section>
}
function ReferenceImageEditor({ section, assets, mediaIndex, onFocusChange }: { section: Section; assets: MediaAsset[]; mediaIndex: number; onFocusChange: (assetId: string, focus: ImageFocus) => void }) {
  const assetId = section.mediaIds[mediaIndex] || ''
  const asset = assets.find(item => item.id === assetId)
  const label = section.type === 'timeline' ? mediaIndex === 0 ? '대표 이미지' : `일정 이미지 ${mediaIndex}` : section.type === 'menu-zigzag' ? `추천 이미지 ${mediaIndex + 1}` : section.type === 'caption-grid' ? ['왼쪽 이미지', '오른쪽 이미지'][mediaIndex] || `이미지 ${mediaIndex + 1}` : `이미지 ${mediaIndex + 1}`
  const source = asset ? (asset.src.startsWith('http') ? asset.src : asset.name) : ''
  const focus = asset ? section.mediaLayoutItems?.find(item => item.assetId === asset.id)?.focus || 'center center' : 'center center'
  return <section className="reference-image-editor"><p className="preset-item-kicker">{label}</p><section className="reference-layout-setting"><b>이미지 레이아웃</b><span>레퍼런스 프리셋의 이미지 위치와 크기는 고정됩니다.</span>{asset && <label><span>크롭 위치</span><select value={focus} onChange={event => onFocusChange(asset.id, event.target.value as ImageFocus)}>{FOCUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}</section>{asset ? <><img src={asset.src} alt={asset.alt || asset.name} style={{ objectPosition: focus }}/><label><span>연결 이미지</span><input value={source} readOnly onFocus={event => event.currentTarget.select()}/></label></> : <div className="reference-image-empty"><ImageIcon/><b>아직 연결된 이미지가 없습니다.</b><span>왼쪽 이미지 탭에서 파일을 올리거나 URL을 추가한 뒤 선택하세요.</span></div>}</section>
}
function PresetItemEditor({ section, index, onChange, onDelete }: { section: Section; index: number; onChange: (value: string | string[] | Partial<IconCardItem>) => void; onDelete: () => void }) {
  if (section.type === 'table') {
    const headers = section.tableHeaders?.length ? section.tableHeaders : ['구분', '내용']
    const row = headers.map((_, column) => section.tableRows?.[index]?.[column] || '')
    return <section className="preset-item-editor"><p className="preset-item-kicker">표 행 {index + 1}</p>{headers.map((header, column) => <Field key={column} label={header}><input value={row[column]} onChange={event => onChange(row.map((cell, cellIndex) => cellIndex === column ? event.target.value : cell))}/></Field>)}</section>
  }
  if (section.type === 'icon-card') { const card = section.iconCards?.[index]; if (!card) return null; return <section className="preset-item-editor"><p className="preset-item-kicker">아이콘 카드 {index + 1}</p><div className="two-fields"><Field label="아이콘"><select value={card.icon} onChange={event => onChange({ icon: event.target.value })}>{ICON_CARD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="강조색"><select value={card.tone} onChange={event => onChange({ tone: event.target.value as IconCardItem['tone'] })}><option value="teal">청록</option><option value="orange">주황</option><option value="green">초록</option></select></Field></div><Field label="카드 제목"><input value={card.title} onChange={event => onChange({ title: event.target.value })}/></Field><Field label="카드 설명"><textarea rows={4} value={card.body} onChange={event => onChange({ body: event.target.value })}/></Field><button className="preset-item-delete-button" onClick={onDelete}><Trash2/> 카드 삭제</button></section> }
  const value = section.items[index] || ''
  if (section.type === 'menu-zigzag') { const item = splitPair(value); const update = (title: string, body: string) => onChange(joinPair(title, body)); return <section className="preset-item-editor"><p className="preset-item-kicker">추천 항목 {index + 1}</p><Field label="제목"><input value={item.title} onChange={event => update(event.target.value, item.body)}/></Field><Field label="본문"><textarea rows={5} value={item.body} onChange={event => update(item.title, event.target.value)}/></Field></section> }
  if (section.type === 'timeline') { const item = splitTimeline(value); const update = (time: string, title: string, body: string) => onChange(joinTimeline(time, title, body)); return <section className="preset-item-editor"><p className="preset-item-kicker">일정 항목 {index + 1}</p><Field label="시간"><input value={item.time} onChange={event => update(event.target.value, item.title, item.body)}/></Field><Field label="제목"><input value={item.title} onChange={event => update(item.time, event.target.value, item.body)}/></Field><Field label="설명"><textarea rows={5} value={item.body} onChange={event => update(item.time, item.title, event.target.value)}/></Field></section> }
  if (section.type === 'caption-grid') { const item = splitPair(value); const update = (title: string, body: string) => onChange(joinPair(title, body)); return <section className="preset-item-editor"><p className="preset-item-kicker">장소 정보 {index + 1}</p><Field label="제목"><input value={item.title} onChange={event => update(event.target.value, item.body)}/></Field><Field label="설명"><textarea rows={4} value={item.body} onChange={event => update(item.title, event.target.value)}/></Field></section> }
  const label = section.type === 'offer' ? '특전 또는 조건' : '핵심 내용'
  return <section className="preset-item-editor"><p className="preset-item-kicker">{label} {index + 1}</p><Field label={label}><textarea rows={4} value={value} onChange={event => onChange(event.target.value)}/></Field></section>
}
function InspectorHeader({ eyebrow, title }: { eyebrow: string; title: string }) { return <div className="inspector-heading"><p>{eyebrow}</p><h2>{title}</h2></div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label> }
function IconCardEditor({ cards, onChange }: { cards: IconCardItem[]; onChange: (cards: IconCardItem[]) => void }) {
  const update = (id: string, patch: Partial<IconCardItem>) => onChange(cards.map(card => card.id === id ? { ...card, ...patch } : card))
  const add = () => onChange([...cards, { id: crypto.randomUUID(), icon: 'sparkles', title: '새 카드 제목', body: '짧은 설명을 입력하세요.', tone: 'teal' }])
  return <section className="icon-card-editor"><p className="binding-note">카드마다 아이콘·제목·설명·강조색을 편집합니다. 2장은 2열, 3장 이상은 3열로 표시됩니다.</p>{cards.map((card, index) => <article key={card.id}><header><b>카드 {index + 1}</b><button aria-label={`카드 ${index + 1} 삭제`} onClick={() => onChange(cards.filter(item => item.id !== card.id))}><X/></button></header><div className="two-fields"><Field label="아이콘"><select value={card.icon} onChange={event => update(card.id, { icon: event.target.value })}>{ICON_CARD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="강조색"><select value={card.tone} onChange={event => update(card.id, { tone: event.target.value as IconCardItem['tone'] })}><option value="teal">청록</option><option value="orange">주황</option><option value="green">초록</option></select></Field></div><Field label="카드 제목"><input value={card.title} onChange={event => update(card.id, { title: event.target.value })}/></Field><Field label="카드 설명"><textarea rows={2} value={card.body} onChange={event => update(card.id, { body: event.target.value })}/></Field></article>)}<button className="add-row" onClick={add}><Plus/> 카드 추가</button></section>
}
function FileMenu({ hasLinkedFile, onImport, onSave, onSaveAs, onClose }: { hasLinkedFile: boolean; onImport: () => void; onSave: () => void; onSaveAs: () => void; onClose: () => void }) { return <div className="file-menu"><button onClick={onImport}><Upload/><span><b>불러오기</b><small>로드용 JSON 또는 YAML 파일 열기</small></span></button><hr/><button onClick={onSave}><Save/><span><b>저장</b><small>{hasLinkedFile ? '연결된 JSON 파일에 바로 덮어쓰기' : 'JSON 파일 위치를 선택해 저장'}</small></span></button><button onClick={onSaveAs}><FileJson/><span><b>다른 이름으로 저장</b><small>새 JSON 파일을 만들고 자동 저장 연결</small></span></button><hr/><button className="file-menu-close" onClick={onClose}><LogOut/><span><b>종료</b><small>저장 여부를 확인한 뒤 종료</small></span></button></div> }
function ExportMenu({ onExport, disabled }: { onExport: (kind: string) => void; disabled?: boolean }) { return <div className="export-menu"><button disabled={disabled} onClick={() => onExport('html')}><Eye/><span><b>독립 HTML</b><small>이미지 URL을 유지한 단일 HTML 파일</small></span></button><button disabled={disabled} onClick={() => onExport('load-json')}><FileJson/><span><b>로드용 JSON 파일</b><small>스튜디오에서 다시 불러올 수 있는 원본</small></span></button><button disabled={disabled} onClick={() => onExport('zip')}><Archive/><span><b>디자이너 전달 ZIP</b><small>index.html · assets 이미지 · 로드용 JSON</small></span></button></div> }

function ZipProgressModal({ progress }: { progress: ZipExportProgress }) {
  return <div className="modal-backdrop zip-progress-backdrop" role="presentation"><section className="zip-progress-modal" role="dialog" aria-modal="true" aria-labelledby="zip-progress-title"><header><div><p>DESIGNER HANDOFF</p><h2 id="zip-progress-title">디자이너 전달 ZIP 생성 중</h2></div></header><div className="zip-progress-body"><div className="zip-progress-status"><strong>{progress.stage === 'archiving' ? 'ZIP 압축 패키징 중…' : `현재 ${progress.completed} / ${progress.total} 이미지 처리 중`}</strong><span>{progress.percent}%</span></div><div className="zip-progress-track" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}><div className="zip-progress-fill" style={{ width: `${progress.percent}%` }}/></div><p className="zip-progress-label" title={progress.currentLabel}>{progress.currentLabel}</p><div className="zip-progress-guide"><p>이미지를 내려받고 JPG/PNG로 정리한 뒤 ZIP으로 묶습니다. 응답이 없는 이미지는 확인 목록으로 넘깁니다.</p></div></div></section></div>
}

function PreviewModal({ project, onClose }: { project: Project; onClose: () => void }) {
  return <div className="modal-backdrop preview-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title"><header><div><p>FULL PAGE PREVIEW</p><h2 id="preview-title">{project.name}</h2></div><button aria-label="미리보기 닫기" onClick={onClose}><X/></button></header><div className="preview-modal-body"><iframe title={`${project.name} 전체 미리보기`} srcDoc={standaloneHtml(project)}/></div></section></div>
}

function ProjectBoard({ projects, activeId, onClose, onNew, onOpen, onDuplicate, onDelete }: { projects: Project[]; activeId: string; onClose: () => void; onNew: () => void; onOpen: (project: Project) => void; onDuplicate: (project: Project) => void; onDelete: (id: string) => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="project-board" role="dialog" aria-modal="true" aria-labelledby="project-board-title"><header><div><p>PROJECT LIBRARY</p><h2 id="project-board-title">기획전 프로젝트</h2></div><button aria-label="닫기" onClick={onClose}><X/></button></header><div className="project-board-actions"><p>작업은 이 PC의 브라우저에 자동 저장됩니다.</p><button className="primary-button" onClick={onNew}><Plus/> 새 프로젝트</button></div><div className="project-list">{projects.slice().sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).map(item => <article key={item.id} className={item.id === activeId ? 'active' : ''}><button className="project-open" onClick={() => onOpen(item)}><span className="project-thumb"><FileText/></span><span><strong>{item.name}</strong><small>{item.category} · {item.sections.length}개 블록 · {new Date(item.updatedAt).toLocaleDateString('ko-KR')}</small></span>{item.id === activeId && <i>편집 중</i>}</button><div><button title="복제" onClick={() => onDuplicate(item)}><Copy/></button><button title="삭제" onClick={() => onDelete(item.id)}><Trash2/></button></div></article>)}</div></section></div>
}

