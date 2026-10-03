import type { InspectionPlan, Weld } from '../types'

/** 内容指纹：计划内容 / 焊缝状态 / 缺陷 / 返修任一变化都会得到不同哈希 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function pickWeld(weld: Weld) {
  return {
    id: weld.id, status: weld.status, repairs: weld.repairs,
    defects: weld.defects.map((d) => ({
      id: d.id, position: d.position, type: d.type, length: d.length,
      level: d.level, method: d.method, report: d.report,
      source: d.source, recordedAt: d.recordedAt, closedBy: d.closedBy ?? null,
    })),
    transitions: weld.transitions.map((t) => ({ id: t.id, to: t.to, at: t.at })),
  }
}

function pickPlan(plan: InspectionPlan) {
  return {
    id: plan.id, date: plan.date, method: plan.method, weldIds: [...plan.weldIds],
    inspector: plan.inspector, state: plan.state,
    history: plan.history.map((h) => ({ at: h.at, to: h.to })),
  }
}

export function contentHash(welds: Weld[], plans: InspectionPlan[]): string {
  const payload = JSON.stringify({
    welds: welds.map(pickWeld),
    plans: plans.map(pickPlan),
  })
  return fnv1a(payload)
}

export function shortHash(hash: string): string {
  return hash.slice(0, 8)
}

export function nowTime(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

export function nowStamp(): string {
  return new Date().toISOString()
}
