// 通用工具函数
export function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

export function fmtTime(ts?: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function fmtDateTime(ts?: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fmtDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayStr(): string {
  return fmtDate(Date.now())
}

/** 将 HH:mm 与某日期结合，返回时间戳 */
export function atTime(base: Date, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(base)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

export function hhmmToTs(hhmm: string): number {
  return atTime(new Date(), hhmm)
}

/** 倒计时（毫秒），支持已过闭馆时间的负数 */
export function msToClose(now: number, closeTs: number): number {
  return closeTs - now
}

export function fmtCountdown(ms: number): string {
  const sign = ms < 0 ? '已闭馆 ' : ''
  let s = Math.floor(Math.abs(ms) / 1000)
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  s -= m * 60
  return `${sign}${pad(h)}:${pad(m)}:${pad(s)}`
}

export function fmtDuration(from: number, to: number = Date.now()): string {
  const mins = Math.max(0, Math.round((to - from) / 60000))
  if (mins < 60) return `${mins} 分钟`
  return `${Math.floor(mins / 60)} 小时 ${mins % 60} 分`
}

let seq = 0
export function uid(prefix = 'id'): string {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}_${seq}_${Math.floor(Math.random() * 1e4).toString(36)}`
}

export function maskIdCard(id: string): string {
  return id.replace(/^(.{4}).*(.{4})$/, '$1**********$2')
}

export function creditLevel(credit: number): { label: string; cls: string } {
  if (credit >= 90) return { label: '优秀', cls: 'good' }
  if (credit >= 70) return { label: '良好', cls: 'ok' }
  if (credit >= 50) return { label: '一般', cls: 'warn' }
  return { label: '受限', cls: 'bad' }
}
