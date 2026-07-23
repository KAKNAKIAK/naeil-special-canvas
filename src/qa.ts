import type { Project, QaItem } from './types'

export function runQa(project: Project): QaItem[] {
  const items: QaItem[] = []
  const mediaRequired = new Set(['image', 'caption-grid', 'menu-zigzag', 'timeline'])
  if (!project.page.title.trim()) items.push({ id: 'page-title', level: 'error', label: '페이지 제목 없음', detail: '고객에게 보일 대표 제목을 입력하세요.' })
  if (!project.sections.length) items.push({ id: 'sections', level: 'error', label: '블록 없음', detail: '한 개 이상의 콘텐츠 블록이 필요합니다.' })
  const performance = project.campaign.performance
  project.sections.forEach(section => {
    if (!section.title.trim()) items.push({ id: `title-${section.id}`, level: 'warning', label: '블록 제목 없음', detail: '제목을 입력하면 디자이너가 의도를 더 쉽게 파악합니다.', sectionId: section.id })
    section.mediaIds.filter(Boolean).forEach(mediaId => {
      const asset = project.assets.find(a => a.id === mediaId)
      if (!asset) items.push({ id: `missing-${section.id}-${mediaId}`, level: 'error', label: '연결 이미지 누락', detail: '이미지 연결을 다시 선택하세요.', sectionId: section.id })
    })
    if (project.deliveryStage === 'customer-final' && mediaRequired.has(section.type) && !section.mediaIds.some(Boolean)) {
      items.push({ id: `media-required-${section.id}`, level: 'error', label: `${section.title || '이미지 블록'}: 이미지 필요`, detail: '고객 최종본의 이미지형 블록에는 승인된 원본 이미지가 필요합니다.', sectionId: section.id })
    }
  })
  project.assets.forEach(asset => {
    const byteSize = asset.src.startsWith('data:') ? Math.floor((asset.src.split(',')[1]?.length || 0) * 0.75) : 0
    if (byteSize > performance.image_max_bytes && !performance.image_exceptions.includes(asset.id)) items.push({ id: `image-max-${asset.id}`, level: 'error', label: `${asset.name}: 이미지 용량 초과`, detail: `${Math.ceil(byteSize / 1024)}KB · 최대 ${Math.ceil(performance.image_max_bytes / 1024)}KB`, assetId: asset.id })
    else if (byteSize > performance.image_warning_bytes) items.push({ id: `image-warning-${asset.id}`, level: 'warning', label: `${asset.name}: 이미지 최적화 권장`, detail: `${Math.ceil(byteSize / 1024)}KB`, assetId: asset.id })
    if (asset.provider === 'web-capture' || asset.rightsStatus === 'prohibited') items.push({ id: `forbidden-${asset.id}`, level: 'error', label: `${asset.name}: 사용 금지`, detail: '웹 캡처 또는 사용 금지 이미지는 납품할 수 없습니다.', assetId: asset.id })
    if (project.deliveryStage === 'customer-final') {
      if (asset.assetStage !== 'original') items.push({ id: `original-${asset.id}`, level: 'error', label: `${asset.name}: 원본 필요`, detail: '고객 최종본은 original 자산만 허용됩니다.', assetId: asset.id })
      if (asset.rightsStatus !== 'cleared' || asset.approval !== 'approved') items.push({ id: `rights-${asset.id}`, level: 'error', label: `${asset.name}: 권리 승인 필요`, detail: 'rights cleared와 승인 완료가 모두 필요합니다.', assetId: asset.id })
      if ((asset.provider === 'getty' || asset.provider === 'winwin') && !asset.sourceId.trim()) items.push({ id: `source-${asset.id}`, level: 'error', label: `${asset.name}: source ID 없음`, detail: 'Getty/WinWin 자산은 source_id가 필수입니다.', assetId: asset.id })
      if (asset.provider === 'generated' && /hotel|resort|호텔|리조트|객실/i.test(asset.usageScope)) items.push({ id: `generated-property-${asset.id}`, level: 'error', label: `${asset.name}: 생성 이미지 역할 제한`, detail: '실제 호텔·객실을 표현하는 생성 이미지는 최종본에서 사용할 수 없습니다.', assetId: asset.id })
    }
    if (!asset.alt.trim()) items.push({ id: `alt-${asset.id}`, level: 'warning', label: `${asset.name}: 대체텍스트 없음`, detail: '이미지 내용을 설명하는 문장을 입력하세요.', assetId: asset.id })
  })
  if (!items.some(i => i.level === 'error')) items.unshift({ id: 'ready', level: 'pass', label: '필수 검수 통과', detail: project.deliveryStage === 'customer-final' ? '최종본 내보내기가 가능합니다.' : '내부 시안으로 공유할 수 있습니다.' })
  return items
}

export function hasBlockingErrors(project: Project) { return runQa(project).some(item => item.level === 'error') }
