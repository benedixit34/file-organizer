import { describe, expect, it } from 'vitest'
import { classify, REVIEW_THRESHOLD } from '../src/services/classifier.ts'

describe('classify', () => {
  const cases: [string, string, string | null][] = [
    ['invoice_2026.pdf', 'Documents', 'Invoices'],
    ['CV_Benedict.pdf', 'Documents', 'CVs'],
    ['react-dashboard.zip', 'Software', 'Projects'],
    ['screenshot.png', 'Images', 'Screenshots'],
    ['Screen Shot 2026-01-03.png', 'Images', 'Screenshots'],
    ['setup.exe', 'Software', 'Installers'],
    ['holiday.mp4', 'Videos', null],
    ['report.PDF', 'Documents', null],
    ['data.csv', 'Spreadsheets', null],
  ]
  for (const [name, category, subfolder] of cases) {
    it(`${name} -> ${category}${subfolder ? '/' + subfolder : ''}`, () => {
      const c = classify(name)
      expect(c.category).toBe(category)
      expect(c.subfolder).toBe(subfolder)
      expect(c.confidence >= REVIEW_THRESHOLD).toBe(true)
    })
  }

  it('sends unknown files to review with low confidence', () => {
    const c = classify('mystery.xyz')
    expect(c.category).toBe('Needs Review')
    expect(c.confidence < REVIEW_THRESHOLD).toBe(true)
    expect(classify('README').category).toBe('Needs Review')
  })

  it('does not treat an invoice-named image as a document', () => {
    expect(classify('invoice.png').category).toBe('Images')
  })

  it('lets custom categories win', () => {
    expect(classify('plan.dwg', [{ name: 'CAD', extensions: ['dwg'] }]).category).toBe('CAD')
  })
})
