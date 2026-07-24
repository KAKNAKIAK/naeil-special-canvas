export type DeliveryStage = 'internal-draft' | 'customer-final'
export type RightsStatus = 'unknown' | 'cleared' | 'restricted' | 'prohibited'
export type AssetStage = 'reference' | 'candidate' | 'original'
export type Provider = 'provided' | 'winwin' | 'getty' | 'generated' | 'official-hotel' | 'web-capture'
export type QualityGrade = 'A' | 'B' | 'C'
export type PreviewViewport = 720
export type ProjectSchemaVersion = '2.1.0'
export type MediaLayout = 'auto' | 'mosaic-left' | 'mosaic-right' | 'equal' | 'stack' | 'grid-2' | 'grid-3' | 'custom'
export type ContentLayout = 'text-top' | 'media-top' | 'media-left' | 'media-right'
export type ImageFocus = 'left top' | 'center top' | 'right top' | 'left center' | 'center center' | 'right center' | 'left bottom' | 'center bottom' | 'right bottom'
export type BlockBoxKind = 'content' | 'media' | 'text' | 'image'

export interface MediaLayoutItem {
  assetId: string
  column: number
  row: number
  columnSpan: number
  rowSpan: number
  focus: ImageFocus
}

/** A grid-snapped editable region inside one content block. Coordinates use a 12-column grid. */
export interface BlockBox {
  id: string
  kind: BlockBoxKind
  column: number
  row: number
  columnSpan: number
  rowSpan: number
  zIndex: number
  /** Optional rich text fields for sequential text cards inside image-flow blocks. */
  eyebrow?: string
  title?: string
  text?: string
  assetIds?: string[]
}

export interface CampaignBenefit { id: string; title: string; detail: string }
export interface IconCardItem { id: string; icon: string; title: string; body: string; tone: 'teal' | 'orange' | 'green' }
export interface CampaignLink { id: string; label: string; url: string; role: 'primary' | 'secondary' | 'tab' }
export interface CampaignTab { id: string; label: string; target: string }
export interface CampaignData {
  schema_version: '1.0.0'
  campaign_id: string
  product_name: string
  campaign_type: string
  status: 'draft' | 'review' | 'approved' | 'published' | 'archived'
  render_mode: 'review' | 'final'
  output_mode: 'standalone' | 'hosted'
  canonical_url: string
  source: { erp_good_cd: string; source_url: string; verified_at: string | null; verified_by: string }
  period: { starts_at: string | null; ends_at: string | null; departure_from: string | null; departure_to: string | null; expiry_action: 'block_publish' | 'hide_offer' | 'show_expired' }
  facts: { normal_price: number | null; sale_price: number | null; discount_amount: number | null; discount_formula: string; travel_days: number | null; country_count: number | null; local_flight_count: number | null; availability_status: 'unverified' | 'available' | 'limited' | 'sold_out'; availability_text: string; urgency_text: string; conditions: string[] }
  benefits: CampaignBenefit[]
  links: CampaignLink[]
  tabs: CampaignTab[]
  metadata: { title: string; description: string; h1: string; canonical_url: string; og_title: string }
  tracking: { promotion_id: string; events: string[] }
  performance: { image_warning_bytes: number; image_max_bytes: number; eager_image_budget_bytes: number; image_exceptions: string[] }
}

export type SectionType = 'text' | 'image' | 'list' | 'table' | 'icon-card' | 'offer' | 'caption-grid' | 'menu-zigzag' | 'timeline'
export type GeneratableSectionType = Exclude<SectionType, 'offer' | 'caption-grid'>
export type BriefCompositionStrategy = 'photo-led' | 'detailed-schedule' | 'summary-schedule' | 'benefit-led' | 'story-led' | 'minimal'

export interface BriefFact {
  id: string
  field: string
  value: string
  source: string
  status: 'confirmed' | 'needs-review'
}

export interface BriefImageDirection { assetId: string; role: string }

/** The editable, contract-shaped brief used before a Canvas project exists. */
export interface CanvasBriefBlock {
  type: GeneratableSectionType
  categoryLabel?: string
  title?: string
  body?: string
  items?: string[]
  mediaIds?: string[]
  mediaLayout?: MediaLayout
  contentLayout?: ContentLayout
  layoutBoxes?: BlockBox[]
  tableHeaders?: string[]
  tableRows?: string[][]
  iconCards?: IconCardItem[]
  listStyle?: 'list' | 'offer'
  menuItemReversed?: boolean[]
  timelineDayStarts?: number[]
  timelineHeroVisible?: boolean
  note?: string
}

export interface CanvasBrief {
  status: 'draft' | 'approved'
  approvedAt: string
  updatedAt: string
  product: { name: string; category: Project['category']; layout: Project['layout']; destination: string; subtitle: string }
  common: { categoryLabel: string; title: string; body: string }
  audience: string
  message: string
  /** Why this draft uses its particular block flow. Stored for review, not as a sales claim. */
  composition?: { strategy: BriefCompositionStrategy; reason: string }
  blockOrder: GeneratableSectionType[]
  blocks: CanvasBriefBlock[]
  imageIds: string[]
  confirmedFacts: Array<{ field: string; value: string; source: string }>
  needsReview: Array<{ field: string; reason: string }>
  imageDirections: BriefImageDirection[]
}

/** Original input is retained locally and never copied into exports unless the user explicitly exports the brief. */
export interface BriefWorkspace {
  rawText: string
  sourceUrls: string[]
  facts: BriefFact[]
  selectedImageIds: string[]
  /** Optional manual choice when auto-analysis is not the desired presentation order. */
  compositionHint?: 'auto' | BriefCompositionStrategy
  brief?: CanvasBrief
}

export interface MediaAsset {
  id: string
  name: string
  src: string
  provider: Provider
  sourceId: string
  assetStage: AssetStage
  usageScope: string
  rightsStatus: RightsStatus
  qualityGrade: QualityGrade
  approval: 'pending' | 'approved' | 'rejected'
  evidence: string
  alt: string
  download?: {
    status: 'pending' | 'downloaded' | 'failed' | 'local'
    source: string
    packagedPath?: string
    transformedFormat?: 'jpg' | 'png'
    failureReason?: string
  }
}

export interface Section {
  id: string
  type: SectionType
  eyebrow: string
  title: string
  body: string
  items: string[]
  tableHeaders?: string[]
  tableRows?: string[][]
  iconCards?: IconCardItem[]
  listStyle?: 'list' | 'offer'
  menuItemReversed?: boolean[]
  timelineDayStarts?: number[]
  timelineHeroVisible?: boolean
  mediaIds: string[]
  mediaLayout: MediaLayout
  contentLayout: ContentLayout
  layoutBoxes?: BlockBox[]
  /** Base text/media cards removed from an image-flow block. */
  removedLayoutBoxIds?: string[]
  mediaLayoutItems?: MediaLayoutItem[]
  note: string
  background: 'white' | 'mist' | 'teal' | 'sand'
  hidden?: boolean
  /** Preserve data introduced by a newer app without making it editable in this version. */
  extensions?: Record<string, unknown> & {
    /** Raw block payload retained when this app does not recognize its type yet. */
    unsupportedBlock?: { type: string; data: Record<string, unknown> }
  }
}

export interface ProjectGenerator {
  name: string
  version: string
  contractHash?: string
  generatedAt?: string
}

export interface MigrationLogEntry {
  id: string
  migratedAt: string
  from: string
  to: ProjectSchemaVersion
  changes: string[]
}

/** Editor-only grouping for consecutive blocks that together form one content unit. */
export interface ContentGroup {
  id: string
  name: string
  sectionIds: string[]
  collapsed?: boolean
}

export interface Project {
  schemaVersion: ProjectSchemaVersion
  catalogVersion?: string
  id: string
  name: string
  layout: 'destination-catalog' | 'hotel-detail' | 'hotel-sales' | 'theme-package' | 'journey-longform' | 'golf-standard' | 'offer-promotion'
  category: '금까기' | '우리만' | '특별한' | '골프'
  deliveryStage: DeliveryStage
  updatedAt: string
  page: { title: string; subtitle: string; destination: string; internalMemo: string }
  campaign: CampaignData
  sections: Section[]
  contentGroups?: ContentGroup[]
  assets: MediaAsset[]
  generator?: ProjectGenerator
  migrationLog?: MigrationLogEntry[]
  briefWorkspace?: BriefWorkspace
  /** Lossless container for root properties not understood by the current editor. */
  extensions?: Record<string, unknown>
}

export interface QaItem { id: string; level: 'error' | 'warning' | 'pass'; label: string; detail: string; sectionId?: string; assetId?: string }
