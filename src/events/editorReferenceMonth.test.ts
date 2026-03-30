import { describe, expect, it } from 'vitest'
import { createDefaultInvestmentEvent } from './defaults'
import { editorReferenceStartMonth } from './editorReferenceMonth'

describe('editorReferenceStartMonth', () => {
  const inv = createDefaultInvestmentEvent(0)

  it('uses drag preview when dragging same draft', () => {
    expect(
      editorReferenceStartMonth({
        draft: inv,
        graphPinnedMonth: 5,
        isDragging: true,
        dragPreviewMonth: 40,
        draggingDraft: inv,
        simulationLength: 100,
      }),
    ).toBe(40)
  })

  it('uses pinned month when not dragging same handle', () => {
    expect(
      editorReferenceStartMonth({
        draft: inv,
        graphPinnedMonth: 12,
        isDragging: false,
        dragPreviewMonth: null,
        draggingDraft: null,
        simulationLength: 100,
      }),
    ).toBe(12)
  })

  it('falls back to draft.startMonth when no pin or drag', () => {
    const d = { ...inv, startMonth: 7 }
    expect(
      editorReferenceStartMonth({
        draft: d,
        graphPinnedMonth: null,
        isDragging: false,
        dragPreviewMonth: null,
        draggingDraft: null,
        simulationLength: 100,
      }),
    ).toBe(7)
  })
})
