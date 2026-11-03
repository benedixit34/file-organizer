export interface FileRecord {
  id: number
  filename: string
  original_path: string
  current_path: string
  extension: string
  mime_type: string | null
  size: number
  created_at: number
  modified_at: number
  hash: string | null
  category_id: number | null
  confidence_score: number | null
  last_scanned_at: number
}
export interface FileRow extends FileRecord {
  category: string | null
}
export interface Category {
  id: number
  name: string
  parent_category_id: number | null
  destination_path: string
  is_custom: number
  created_at: number
  extensions: string // comma-separated; only used by custom categories
}

export type ProposalStatus = 'ready' | 'review' | 'conflict'
export interface Proposal {
  fileId: number
  filename: string
  size: number
  modified_at: number
  from: string
  to: string
  category: string
  confidence: number
  status: ProposalStatus
  existing?: { size: number; modified_at: number }
  renamedTo?: string
}
export interface MoveRequest {
  fileId: number
  to: string
}
export interface MoveResult {
  fileId: number
  filename: string
  ok: boolean
  error?: string
}

export interface OperationItem {
  id: number
  operation_id: number
  file_id: number
  filename: string
  original_path: string
  destination_path: string
  status: 'pending' | 'done' | 'failed' | 'undone'
  error_message: string | null
}
export interface Operation {
  id: number
  operation_type: string
  status: 'running' | 'completed' | 'partial' | 'failed' | 'undone'
  created_at: number
  completed_at: number | null
  items: OperationItem[]
}

export interface Stats {
  total: number
  totalSize: number
  categorized: number
  uncategorized: number
  duplicates: number
  toOrganize: number
  lastScan: number | null
  categories: { name: string; count: number }[]
  recent: Operation[]
}
export interface SearchParams {
  query?: string
  extension?: string
  category?: string
  minSize?: number
  maxSize?: number
  modifiedAfter?: number
}
export interface DuplicateGroup {
  hash: string
  size: number
  files: FileRecord[]
}

export interface ScanProgress {
  phase: 'reading' | 'hashing'
  done: number
  total: number
}
export interface ScanResult {
  scanned: number
  skipped: number
  errors: { path: string; error: string }[]
  cancelled: boolean
}

export interface Api {
  getRoot(): Promise<string>
  chooseRoot(): Promise<string>
  scan(): Promise<ScanResult>
  cancelScan(): Promise<void>
  onScanProgress(cb: (p: ScanProgress) => void): () => void
  stats(): Promise<Stats>
  search(p: SearchParams): Promise<FileRow[]>
  duplicates(): Promise<DuplicateGroup[]>
  preview(): Promise<Proposal[]>
  retarget(fileId: number, category: string): Promise<Proposal>
  organize(items: MoveRequest[]): Promise<MoveResult[]>
  history(): Promise<Operation[]>
  undo(operationId: number): Promise<MoveResult[]>
  categories(): Promise<Category[]>
  addCategory(name: string, extensions: string): Promise<void>
  removeCategory(id: number): Promise<void>
}

export type Page = 'dashboard' | 'files' | 'organize' | 'history' | 'settings'
export interface ExplorerFilter {
  category?: string
  view?: 'all' | 'duplicates'
}

declare global {
  interface Window {
    api: Api
  }
}
