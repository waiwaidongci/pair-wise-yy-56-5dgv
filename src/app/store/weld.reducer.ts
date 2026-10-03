import { createReducer, on } from '@ngrx/store'
import type { AuditEvent, Baseline, InspectionPlan, InspectionRecord, SignatureRecord, Weld } from '../types'
import * as A from './weld.actions'

export interface WeldState {
  welds: Weld[]
  plans: InspectionPlan[]
  baselines: Baseline[]
  signatures: SignatureRecord[]
  selectedId: string
  statusFilter: string
  version: number
  audit: AuditEvent[]
}

const initialAudit: AuditEvent[] = [
  { id: 'AE-1', time: '16:38', actor: '赵岚', action: '提交复检', target: 'W-104', detail: '返修后 UT 复检合格，等待审核签字' },
  { id: 'AE-2', time: '15:12', actor: '陈锋', action: '录入缺陷', target: 'W-107', detail: '翼缘板端部夹渣，长度 12mm，Ⅱ级' },
  { id: 'AE-3', time: '14:20', actor: '系统', action: '资质预警', target: 'W-109', detail: '焊工证书 2026-10-01 到期，不得列入后续检测计划' },
]

export const initialState: WeldState = { welds: [], plans: [], baselines: [], signatures: [], selectedId: '', statusFilter: '全部', version: 1, audit: initialAudit }

// —— 工具函数 ——
function now() { return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) }
function rid(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}` }
function audit(actor: string, action: string, target: string, detail: string): AuditEvent {
  return { id: rid('AE'), time: now(), actor, action, target, detail }
}

/** djb2 内容指纹。 */
function hashString(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return 'H' + h.toString(16).toUpperCase().padStart(8, '0')
}

/** 内容指纹：焊缝状态 / 缺陷 / 追加记录 与 检测计划状态的确定性摘要。 */
export function contentHash(welds: Weld[], plans: InspectionPlan[]): string {
  const w = welds.map((x) => `${x.id}:${x.status}:${x.repairs}:${x.defects.length}:${x.defects.map((d) => `${d.id}:${d.level}:${d.length}`).join('/')}:${x.records.length}`).join('|')
  const p = plans.map((x) => `${x.id}:${x.state}:${x.weldIds.length}:${x.method}`).join('|')
  return hashString(`${w}#${p}`)
}

export type ReleaseStatus = '待补录' | '未锁定' | '已锁定' | '已失效'

/** 当前放行状态：旧批次待补录 → 有效基线 → 已锁定 / 已失效。 */
export function releaseStatusOf(state: WeldState): ReleaseStatus {
  if (state.welds.some((w) => w.legacy) || state.plans.some((p) => p.legacy)) return '待补录'
  const valid = state.baselines.find((b) => b.status === '有效')
  if (!valid) return state.baselines.length > 0 ? '已失效' : '未锁定'
  if (valid.version === state.version && valid.contentHash === contentHash(state.welds, state.plans)) return '已锁定'
  return '已失效'
}

/** 内容变更：版本递增，所有有效锁定立即失效（基线本身保留为历史版本，不改写）。 */
function bumpVersion(state: WeldState): WeldState {
  return {
    ...state,
    version: state.version + 1,
    baselines: state.baselines.map((b) => b.status === '有效' ? { ...b, status: '已失效' as const } : b),
  }
}

export const weldReducer = createReducer(
  initialState,

  on(A.loadWeldsSuccess, (state, { welds, plans }) => {
    // 旧批次没有版本依据 → 待补录；原焊缝结果继续可查，记录数组补齐。
    const legacyWelds = welds.map((w) => ({ ...w, version: w.version ?? 1, legacy: w.version == null, records: w.records ?? [] }))
    const legacyPlans = plans.map((p) => ({ ...p, version: p.version ?? 1, legacy: p.version == null }))
    return { ...state, welds: legacyWelds, plans: legacyPlans, baselines: [], signatures: [], version: 1, selectedId: state.selectedId || legacyWelds[0]?.id || '' }
  }),

  on(A.selectWeld, (state, { id }) => ({ ...state, selectedId: id })),
  on(A.filterStatus, (state, { status }) => ({ ...state, statusFilter: status })),

  on(A.advanceWeld, (state, { id, status }) => {
    const target = state.welds.find((w) => w.id === id)
    const welds = state.welds.map((w) => w.id === id
      ? { ...w, status, version: w.version + 1, records: [...w.records, { id: rid('RR'), weldId: id, time: now(), type: '返修确认', result: `状态流转为 ${status}`, operator: '当前审核人', fromStatus: w.status, toStatus: status, revision: w.records.length + 1 } as InspectionRecord] }
      : w)
    const next = bumpVersion(state)
    return { ...next, welds, audit: [audit('当前审核人', '返修状态流转', id, `${target?.status ?? ''} → ${status}；已追加返修确认记录，原检测记录保持只读`), ...state.audit] }
  }),

  on(A.appendInspection, (state, { weldId, recordType, result, toStatus }) => {
    const welds = state.welds.map((w) => {
      if (w.id !== weldId) return w
      const rec: InspectionRecord = { id: rid('RR'), weldId, time: now(), type: recordType, result, operator: '当前审核人', fromStatus: w.status, toStatus, revision: w.records.length + 1 }
      return { ...w, records: [...w.records, rec], status: toStatus ?? w.status, version: w.version + 1 }
    })
    const next = bumpVersion(state)
    return { ...next, welds, audit: [audit('当前审核人', `追加${recordType}记录`, weldId, `${result}${toStatus ? `，状态 → ${toStatus}` : ''}；追加新修订，原检测记录与审批记录不改写`), ...state.audit] }
  }),

  on(A.addDefect, (state, { weldId, defect }) => {
    const welds = state.welds.map((w) => w.id === weldId
      ? { ...w, defects: [...w.defects, defect], version: w.version + 1, status: ['待检测', '待复检'].includes(w.status) ? '返修中' as const : w.status }
      : w)
    const next = bumpVersion(state)
    return { ...next, welds, audit: [audit('当前审核人', '录入缺陷', weldId, `新增缺陷 ${defect.type} / ${defect.level}，长度 ${defect.length}mm；缺陷记录追加，不覆盖历史结论`), ...state.audit] }
  }),

  on(A.createPlan, (state, { plan }) => {
    const next = bumpVersion(state)
    const plans = [{ ...plan, version: next.version, legacy: false }, ...state.plans]
    return { ...next, plans, audit: [audit('计划员', '新建检测计划', plan.id, `方法 ${plan.method}，检测人 ${plan.inspector}，焊缝 ${plan.weldIds.length} 条；计划内容变更已使原锁定失效`), ...state.audit] }
  }),

  on(A.updatePlanState, (state, { id, planState }) => {
    const plans = state.plans.map((p) => p.id === id ? { ...p, state: planState, version: p.version + 1 } : p)
    const next = bumpVersion(state)
    return { ...next, plans, audit: [audit('计划员', '计划状态变更', id, `计划状态 → ${planState}；计划内容变更已使原锁定失效，需重新确认`), ...state.audit] }
  }),

  on(A.supplementBasis, (state) => {
    const welds = state.welds.map((w) => w.legacy ? { ...w, legacy: false, version: state.version } : w)
    const plans = state.plans.map((p) => p.legacy ? { ...p, legacy: false, version: state.version } : p)
    return { ...state, welds, plans, audit: [audit('系统', '补录版本依据', `全部 ${welds.length} 条焊缝、${plans.length} 个检测计划`, '旧批次原检测结果继续有效、可查询；补录后进入签字锁定流程'), ...state.audit] }
  }),

  on(A.signLock, (state, { actor, basedOnVersion }) => {
    const status = releaseStatusOf(state)
    let reason = ''
    if (status === '待补录') reason = '存在无版本依据的旧批次（待补录），不予锁定'
    else if (status === '已锁定') reason = `v${state.version} 已完成签字锁定，签字权先到先得`
    else if (basedOnVersion !== state.version) reason = `签字基于 v${basedOnVersion}，内容已变更至 v${state.version}，请重新确认`
    if (reason) {
      const sig: SignatureRecord = { id: rid('SIG'), time: now(), actor, basedOnVersion, result: '冲突', reason }
      return { ...state, signatures: [sig, ...state.signatures], audit: [audit(actor, '签字冲突', '锁定申请未通过', reason), ...state.audit] }
    }
    const hash = contentHash(state.welds, state.plans)
    const baseline: Baseline = { id: rid('BL'), version: state.version, contentHash: hash, lockedAt: now(), status: '有效', signers: [actor] }
    const sig: SignatureRecord = { id: rid('SIG'), time: now(), actor, basedOnVersion, result: '通过', reason: '' }
    return { ...state, baselines: [baseline, ...state.baselines], signatures: [sig, ...state.signatures], audit: [audit(actor, '签字锁定', `检测批次 v${state.version}`, `版本基线已确认，内容指纹 ${hash}；质量追溯包现可导出`), ...state.audit] }
  }),

  on(A.exportPackage, (state) => {
    const status = releaseStatusOf(state)
    if (status !== '已锁定') {
      const reason = status === '待补录' ? '存在待补录旧批次，无版本依据' : status === '已失效' ? '内容变更后原锁定已失效，未重新确认' : '尚未签字锁定'
      return { ...state, audit: [audit('系统', '追溯包导出被拦截', '质量追溯包', `当前状态「${status}」，${reason}；重新确认前不得导出`), ...state.audit] }
    }
    const valid = state.baselines.find((b) => b.status === '有效')!
    return { ...state, audit: [audit('系统', '导出质量追溯包', `v${state.version}`, `基线 ${valid.id} 有效，指纹 ${valid.contentHash}；含焊缝 ${state.welds.length} 条、检测计划 ${state.plans.length} 个、缺陷与审批记录`), ...state.audit] }
  }),
)
