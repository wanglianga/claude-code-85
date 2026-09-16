import { reactive } from 'vue'

export interface Toast {
  id: number
  text: string
  kind: 'ok' | 'bad' | 'info'
}

const state = reactive<{ items: Toast[] }>({ items: [] })
let seq = 0

function push(text: string, kind: Toast['kind'] = 'info', timeout = 2600) {
  const id = ++seq
  state.items.push({ id, text, kind })
  window.setTimeout(() => {
    const idx = state.items.findIndex((t) => t.id === id)
    if (idx >= 0) state.items.splice(idx, 1)
  }, timeout)
}

export function useToast() {
  return {
    items: state.items,
    ok: (t: string) => push(t, 'ok'),
    bad: (t: string) => push(t, 'bad'),
    info: (t: string) => push(t, 'info')
  }
}
