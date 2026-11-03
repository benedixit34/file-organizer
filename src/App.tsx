import { useState } from 'react'
import { useScan } from './components/useScan'
import { Dashboard } from './pages/Dashboard'
import { FileExplorer } from './pages/FileExplorer'
import { History } from './pages/History'
import { Settings } from './pages/Settings'
import { SmartOrganize } from './pages/SmartOrganize'
import type { ExplorerFilter, Page } from './types/file'

const NAV: { page: Page; label: string }[] = [
  { page: 'dashboard', label: 'Dashboard' },
  { page: 'organize', label: 'Smart Organize' },
  { page: 'files', label: 'Files' },
  { page: 'history', label: 'History' },
  { page: 'settings', label: 'Settings' },
]

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [filter, setFilter] = useState<ExplorerFilter>({})
  const scanner = useScan()
  const go = (p: Page, f: ExplorerFilter = {}) => {
    setFilter(f)
    setPage(p)
  }

  return (
    <div className="flex h-full">
      <nav className="flex w-52 shrink-0 flex-col bg-ink px-3 py-5 text-white" aria-label="Main">
        <div className="mb-6 px-3 font-display text-[15px] font-semibold leading-tight">Smart File<br />Organizer</div>
        {NAV.map((n) => (
          <button
            key={n.page}
            onClick={() => go(n.page)}
            aria-current={page === n.page ? 'page' : undefined}
            className={`mb-0.5 rounded-md border-l-[3px] px-3 py-2 text-left ${
              page === n.page ? 'border-go-soft bg-white/10' : 'border-transparent text-white/75 hover:bg-white/5 hover:text-white'
            }`}
          >
            {n.label}
          </button>
        ))}
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-5xl">
          {page === 'dashboard' && <Dashboard scanner={scanner} go={go} />}
          {page === 'organize' && <SmartOrganize scanner={scanner} go={go} />}
          {page === 'files' && <FileExplorer key={`${filter.category}-${filter.view}`} initial={filter} scanVersion={scanner.version} />}
          {page === 'history' && <History />}
          {page === 'settings' && <Settings />}
        </div>
      </main>
    </div>
  )
}
