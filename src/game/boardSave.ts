import type { SavedBoard } from './useGame'

/** The board in progress per mode, so leaving a level never loses it. */
const KEY = 'catgrid.board.v1'

interface Slot {
  id: string
  board: SavedBoard
}

type Slots = Partial<Record<'level' | 'daily', Slot>>

function read(): Slots {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Slots
  } catch {
    return {}
  }
}

function write(slots: Slots) {
  try {
    localStorage.setItem(KEY, JSON.stringify(slots))
  } catch {
    // Storage blocked: the board just won't be resumable.
  }
}

export function loadBoard(mode: 'level' | 'daily', id: string): SavedBoard | null {
  const slot = read()[mode]
  return slot?.id === id ? slot.board : null
}

export function saveBoard(mode: 'level' | 'daily', id: string, board: SavedBoard) {
  write({ ...read(), [mode]: { id, board } })
}

export function clearBoard(mode: 'level' | 'daily') {
  const slots = read()
  delete slots[mode]
  write(slots)
}
