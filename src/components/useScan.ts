import { useCallback, useEffect, useState } from 'react'
import type { ScanProgress, ScanResult } from '../types/file'
import { errText } from './ui'

export function useScan() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<ScanResult | null>(null)
  const [version, setVersion] = useState(0) // bumps after each scan so pages reload

  useEffect(() => window.api.onScanProgress(setProgress), [])

  const run = useCallback(async () => {
    setRunning(true)
    setError(null)
    try {
      setLast(await window.api.scan())
      setVersion((v) => v + 1)
    } catch (e) {
      setError(errText(e))
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }, [])

  return { running, progress, error, last, version, run, cancel: () => window.api.cancelScan() }
}
export type Scanner = ReturnType<typeof useScan>
