import { useEffect, useRef, useState } from 'react'
import { Baby, Bath, CalendarDays, CarFront, Compass, Dumbbell, Flag, Flower2, HandHeart, Hotel, MapPinned, Plane, ShoppingBag, Sparkles, Star, UsersRound, Utensils, Waves } from 'lucide-react'
import { isRichTextEmpty, RICH_TEXT_COLORS, RICH_TEXT_SIZES, sanitizeRichText } from '../rich-text'
import type { Section, SectionType } from '../types'

export const SPECIAL_LAYOUT_TYPES = new Set<SectionType>(['caption-grid', 'menu-zigzag', 'timeline', 'hero-cover', 'route-bar', 'option-grid', 'vs-compare', 'service-bar'])
export const ITEM_PRESET_TYPES = new Set<SectionType>(['list', 'offer', 'table', 'icon-card', 'caption-grid', 'menu-zigzag', 'timeline', 'hero-cover', 'route-bar', 'option-grid', 'vs-compare', 'service-bar'])
export const REFERENCE_LAYOUT_TYPES = new Set<SectionType>(['caption-grid', 'menu-zigzag', 'timeline', 'hero-cover', 'route-bar', 'option-grid', 'vs-compare'])

export const BACKGROUND_OPTIONS: Array<{ value: Section['background']; label: string }> = [
  { value: 'white', label: '화이트' },
  { value: 'sand', label: '샌드' },
  { value: 'mist', label: '민트' },
  { value: 'teal', label: '다크 틸' },
]

export const ICON_CARD_OPTIONS = [
  { value: 'calendar', label: '일정', glyph: '◷', Icon: CalendarDays },
  { value: 'car', label: '이동', glyph: '◌', Icon: CarFront },
  { value: 'hotel', label: '호텔', glyph: '⌂', Icon: Hotel },
  { value: 'plane', label: '항공', glyph: '✈', Icon: Plane },
  { value: 'map', label: '지도', glyph: '⌖', Icon: MapPinned },
  { value: 'guide', label: '가이드', glyph: '★', Icon: UsersRound },
  { value: 'compass', label: '체험', glyph: '✦', Icon: Compass },
  { value: 'star', label: '추천', glyph: '✧', Icon: Star },
  { value: 'sparkles', label: '특전', glyph: '✦', Icon: Sparkles },
  { value: 'food', label: '음식', glyph: '●', Icon: Utensils },
  { value: 'massage', label: '마사지', glyph: '✋', Icon: HandHeart },
  { value: 'spa', label: '스파', glyph: '✿', Icon: Flower2 },
  { value: 'pool', label: '수영장', glyph: '≈', Icon: Waves },
  { value: 'fitness', label: '피트니스', glyph: '◆', Icon: Dumbbell },
  { value: 'shopping', label: '쇼핑', glyph: '□', Icon: ShoppingBag },
  { value: 'family', label: '가족·키즈', glyph: '●', Icon: Baby },
  { value: 'golf', label: '골프', glyph: '⚑', Icon: Flag },
  { value: 'bath', label: '온천·목욕', glyph: '♨', Icon: Bath },
] as const

export const iconCardOption = (icon: string) => ICON_CARD_OPTIONS.find(option => option.value === icon) || ICON_CARD_OPTIONS[8]

export const BLOCK_EDITOR_COPY: Record<SectionType, { lead: string; title: string; body: string; titlePlaceholder: string; bodyPlaceholder: string }> = {
  text: { lead: '한 가지 메시지와 설명을 이어 쓰는 블록입니다.', title: '핵심 메시지', body: '본문', titlePlaceholder: '고객에게 먼저 보일 핵심 문장', bodyPlaceholder: '메시지를 뒷받침하는 설명을 입력하세요.' },
  image: { lead: '이미지는 왼쪽 라이브러리에서 연결하고, 이곳에는 이미지 맥락만 작성합니다.', title: '이미지 섹션 제목', body: '이미지 소개·캡션', titlePlaceholder: '예: 객실에서 만나는 바다 전망', bodyPlaceholder: '사진에서 보여 주고 싶은 장면과 특징을 입력하세요.' },
  list: { lead: '핵심 포인트를 짧게 정리하는 블록입니다.', title: '목록 제목', body: '목록 도입 문장', titlePlaceholder: '예: 여행을 더 편하게 만드는 세 가지', bodyPlaceholder: '목록을 읽기 전에 필요한 짧은 안내를 입력하세요.' },
  table: { lead: '일정, 조건, 비교처럼 행과 열로 봐야 하는 정보에 씁니다.', title: '제목', body: '본문', titlePlaceholder: '예: 여행 일정 한눈에 보기', bodyPlaceholder: '표를 읽는 방법이나 기준을 짧게 입력하세요.' },
  'icon-card': { lead: '아이콘 카드로 상품의 선택 이유나 서비스 장점을 시각적으로 보여 줍니다.', title: '제목', body: '본문', titlePlaceholder: '예: 우리끼리만 떠나는 패키지', bodyPlaceholder: '카드 전체를 설명하는 한 문장을 입력하세요.' },
  offer: { lead: '특전, 포함 사항, 적용 조건을 한데 모아 강조하는 블록입니다.', title: '특전 제목', body: '적용 안내', titlePlaceholder: '예: 내일투어 단독 특전', bodyPlaceholder: '기간, 적용 대상, 유의사항을 짧게 안내하세요.' },
  'caption-grid': { lead: '사진 4장과 짧은 캡션을 2단 그리드로 보여 주는 포인트 소개 블록입니다.', title: '그리드 제목', body: '보조 설명', titlePlaceholder: '예: 리조트 집중 포인트', bodyPlaceholder: '필요할 때만 짧은 설명을 입력하세요.' },
  'menu-zigzag': { lead: '이미지와 설명을 좌우로 보여 주는 블록입니다. 항목마다 이미지와 텍스트 위치를 바꿀 수 있습니다.', title: '제목', body: '본문', titlePlaceholder: '예: 도쿄 미식 추천 메뉴', bodyPlaceholder: '필요할 때만 짧은 설명을 입력하세요.' },
  timeline: { lead: '대표 이미지와 시간축을 함께 보여 주는 장거리·테마 일정 블록입니다.', title: '제목', body: '본문', titlePlaceholder: '예: 스위스 패밀리 금까기', bodyPlaceholder: '일정 전체를 소개하는 핵심 내용을 입력하세요.' },
  'hero-cover': { lead: '배경 이미지 위에 대제목·부제·핵심 뱃지를 올리는 커버 히어로 블록입니다.', title: '대표 제목', body: '소개 문구', titlePlaceholder: '예: 발리 프라이빗 허니문', bodyPlaceholder: '대표 소개 문장을 입력하세요.' },
  'route-bar': { lead: '방문 도시를 가로 연결선으로 보여 주고 선택적으로 지도 이미지를 붙입니다.', title: '동선 제목', body: '동선 안내', titlePlaceholder: '예: 한눈에 보는 황금 동선', bodyPlaceholder: '이동 방식과 동선 특징을 입력하세요.' },
  'option-grid': { lead: '원형 썸네일 그리드로 선택형 프로그램(택1)을 한눈에 보여 줍니다.', title: '선택 혜택 제목', body: '선택 조건', titlePlaceholder: '예: 원데이 프로그램 택 1', bodyPlaceholder: '선택 가능 개수와 조건을 입력하세요.' },
  'vs-compare': { lead: '두 가지 여행 스타일·패스·시즌을 좌우 카드와 VS 배지로 비교합니다.', title: '비교 제목', body: '비교 요약', titlePlaceholder: '예: 실버패스 vs 골드패스', bodyPlaceholder: '비교 포인트를 짧게 입력하세요.' },
  'service-bar': { lead: '번호 배지 + 좌측 설명 + 우측 핵심 키워드로 공통 서비스를 정리합니다.', title: '서비스 제목', body: '안내 문구', titlePlaceholder: '예: 내일투어 스페셜 서비스', bodyPlaceholder: '공통 제공 혜택을 짧게 안내하세요.' },
}

export type InlineTag = 'span' | 'p' | 'h2' | 'h3' | 'div' | 'strong' | 'b' | 'figcaption'
export type CommonTextValue = { title: string; body: string }

export function InlineText({ tag = 'span', value, className = '', multiline = false, readOnly = false, onEditStart, onChange, children }: { tag?: InlineTag; value: string; className?: string; multiline?: boolean; readOnly?: boolean; onEditStart?: () => void; onChange: (value: string) => void; children?: React.ReactNode }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const prevValueRef = useRef(value)
  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value
      setEditing(false)
      setDraft(value)
    }
  }, [value])
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

export function RichText({ tag = 'span', value, className = '', readOnly = false, onEditStart, onChange }: { tag?: InlineTag; value: string; className?: string; readOnly?: boolean; onEditStart?: () => void; onChange: (value: string) => void }) {
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const safeValue = sanitizeRichText(value)
  const prevValueRef = useRef(safeValue)
  useEffect(() => {
    if (prevValueRef.current !== safeValue) {
      prevValueRef.current = safeValue
      setEditing(false)
    }
  }, [safeValue])
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus()
      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(ref.current)
      range.collapse(false)
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  }, [editing])
  const commitValue = () => { const next = sanitizeRichText(ref.current?.innerHTML || ''); setEditing(false); if (next !== safeValue) onChange(next) }
  const Component = tag as React.ElementType
  if (editing) return <Component ref={ref} className={`${className} rich-inline-editable`} contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: safeValue }} onBlur={commitValue} onKeyDown={(event: React.KeyboardEvent) => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); setEditing(false) } if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); commitValue() } }} onClick={(event: React.MouseEvent) => event.stopPropagation()}/>
  return <Component className={`${className} rich-inline-render`} title={readOnly ? undefined : '더블클릭해서 수정'} onDoubleClick={(event: React.MouseEvent) => { if (readOnly) return; event.preventDefault(); event.stopPropagation(); onEditStart?.(); setEditing(true) }} dangerouslySetInnerHTML={{ __html: safeValue }}/>
}

export function RichTextEditor({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
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
  return <div className="field rich-text-field">
    <span>{label}</span>
    <div className="rich-text-toolbar" onMouseDown={event => event.preventDefault()}>
      <button type="button" tabIndex={-1} aria-label="굵게" title="선택 문장 굵게 · 선택하지 않으면 전체 적용" onClick={() => applyCommand('bold')}><strong>B</strong></button>
      <span className="rich-text-divider"/>
      {RICH_TEXT_COLORS.map(color => <button key={color.value} type="button" tabIndex={-1} aria-label={`${color.label} 글자색`} title={`${color.label} · 선택하지 않으면 전체 적용`} className="rich-text-color" style={{ '--swatch': color.value } as React.CSSProperties} onClick={() => applyCommand('foreColor', color.value)}/>)}
      <span className="rich-text-divider"/>
      {RICH_TEXT_SIZES.map(size => <button key={size.value} type="button" tabIndex={-1} title={`글자 크기 ${size.label} · 선택하지 않으면 전체 적용`} className="rich-text-size" onClick={() => applyCommand('fontSize', size.command)}>{size.label}</button>)}
    </div>
    <div ref={ref} className="rich-text-editor" role="textbox" aria-label={label} aria-multiline={rows > 1} contentEditable suppressContentEditableWarning data-rows={rows} onFocus={() => { focusedRef.current = true }} onBlur={() => { focusedRef.current = false; commitValue() }} onCompositionStart={() => { composingRef.current = true }} onCompositionEnd={() => { composingRef.current = false }} onInput={syncWhileTyping}/>
    <small className="rich-text-hint">문장을 드래그해 서식을 적용하세요. 선택하지 않으면 전체 문장에 적용됩니다.</small>
  </div>
}

export function CommonText({ value, readOnly, onChange, onEditStart, className = '', children }: { value: CommonTextValue; readOnly: boolean; onChange: (patch: Partial<CommonTextValue>) => void; onEditStart?: () => void; className?: string; children?: React.ReactNode }) {
  return <div className={`section-text-content ${className}`.trim()} data-guide="copy-area">
    {!isRichTextEmpty(value.title) && <RichText tag="h2" value={value.title} readOnly={readOnly} onEditStart={onEditStart} onChange={title => onChange({ title })}/>}
    {!isRichTextEmpty(value.body) && <RichText tag="p" className="section-body" value={value.body} readOnly={readOnly} onEditStart={onEditStart} onChange={body => onChange({ body })}/>}
    {children}
  </div>
}
