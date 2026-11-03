export interface Classification {
  category: string
  subfolder: string | null
  confidence: number
}
export interface CustomRule {
  name: string
  extensions: string[]
}

export const NEEDS_REVIEW = 'Needs Review'
// Below this, a suggestion goes to the review queue instead of being pre-approved.
export const REVIEW_THRESHOLD = 0.6

export const BUILTIN: Record<string, string[]> = {
  Documents: ['pdf', 'docx', 'doc', 'txt', 'rtf', 'odt', 'md'],
  Images: ['jpg', 'jpeg', 'png', 'webp', 'svg', 'gif', 'bmp', 'heic'],
  Videos: ['mp4', 'mov', 'avi', 'mkv', 'webm'],
  Audio: ['mp3', 'wav', 'flac', 'm4a', 'ogg'],
  Archives: ['zip', 'rar', '7z', 'tar', 'gz'],
  Software: ['exe', 'msi'],
  Spreadsheets: ['xlsx', 'xls', 'csv'],
  Presentations: ['pptx', 'ppt'],
  Development: ['js', 'ts', 'tsx', 'jsx', 'json', 'sql', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'html', 'css', 'sh'],
}
export const CATEGORY_NAMES = [...Object.keys(BUILTIN), NEEDS_REVIEW]

// shortcut: filename keywords only; upgrade to looking inside the archive if misfiles show up.
const PROJECT_WORDS = ['react', 'vue', 'angular', 'next', 'node', 'django', 'flask', 'starter', 'template', 'dashboard', 'main', 'master', 'repo', 'source', 'src']

export function classify(filename: string, customs: CustomRule[] = []): Classification {
  const dot = filename.lastIndexOf('.')
  const ext = dot > 0 ? filename.slice(dot + 1).toLowerCase() : ''
  const stem = (dot > 0 ? filename.slice(0, dot) : filename).toLowerCase()
  const words = new Set(stem.split(/[^a-z0-9]+/))
  const has = (...w: string[]) => w.some((x) => words.has(x))

  const custom = customs.find((c) => c.extensions.includes(ext))
  if (custom) return { category: custom.name, subfolder: null, confidence: 0.95 }

  const category = Object.keys(BUILTIN).find((c) => BUILTIN[c].includes(ext))
  if (!category) return { category: NEEDS_REVIEW, subfolder: null, confidence: 0.2 }

  if (category === 'Documents') {
    if (has('invoice', 'receipt')) return { category, subfolder: 'Invoices', confidence: 0.9 }
    if (has('cv', 'resume')) return { category, subfolder: 'CVs', confidence: 0.9 }
  }
  if (category === 'Images' && (has('screenshot') || (has('screen') && has('shot')))) {
    return { category, subfolder: 'Screenshots', confidence: 0.9 }
  }
  if (category === 'Software') return { category, subfolder: 'Installers', confidence: 0.95 }
  if (category === 'Archives' && has(...PROJECT_WORDS)) {
    return { category: 'Software', subfolder: 'Projects', confidence: 0.7 }
  }
  return { category, subfolder: null, confidence: 0.95 }
}
