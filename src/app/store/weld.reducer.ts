import { createReducer, on } from '@ngrx/store'
import type {
  AuditEvent, InspectionPlan, LockInvalidation, ReleaseVersion, Signature,
  SignatureConflict, Weld, WeldStatus,
} from '../types'
import { contentHash, nowTime, shortHash } from '../services/versioning'
import * as A from './weld.actions'

export interface WeldState {
  welds: Weld[]
  plans: InspectionPlan[]
  selectedId: string
  statusFilter: string
  /** 工作修订号：任一计划/缺陷/返修内容变化即 +1 */
  revision: number
  /** 放行版本链，append-only，作废版本也保留 */
  releases: ReleaseVersion[]
  activeReleaseId: string | null
  invalidations: LockInvalidation[]
  conflicts: SignatureConflict[]
  audit: AuditEvent[]
  exportBlockedAt: string | null
  notice: { tone: 'info' | 'success' | 'warn' | 'danger'; text: string } | null
  loaded: boolean
}

let seq = 0
function nextId(prefix: string): string {
  seq += 1
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${seq}`
}

function auditEvent(actor: string, action: string, target: string, detail: string): AuditEvent {
  return { id: nextId('AE'), time: nowTime(), actor, action, target, detail }
}

export type StateNotice = NonNullable<WeldState['notice']>

function notice(tone: StateNotice['tone'], text: string): StateNotice {
  return { tone, text }
}

const seedAudit: AuditEvent[] = [
  { id: 'AE-1', time: '16:38', actor: '赵岚', action: '提交复检', target: 'W-104', detail: '返修后 UT 复检合格，等待审核签字' },
  { id: 'AE-2', time: '15:12', actor: '陈锋', action: '录入缺陷', target: 'W-107', detail: '翼缘板端部夹渣，长度 12mm，Ⅱ级' },
  { id: 'AE-3', time: '14:20', actor: '系统', action: '资质预警', target: 'W-109', detail: '焊工证书 2026-10-01 到期，不得列入后续检测计划' },
]

export const initialState: WeldState = {
  welds: [], plans: [], selectedId: '', statusFilter: '全部',
  revision: 12, releases: [], activeReleaseId: null, invalidations: [], conflicts: [],
  audit: seedAudit, exportBlockedAt: null, notice: null, loaded: false,
}

/** 内容变更后调用：若存在生效锁定，立即作废并保留作废现场 */
function invalidateIfLocked(
  state: WeldState,
  entry: { trigger: string; target: string; detail: string; actor: string },
  audit: AuditEvent[],
): Pick<WeldState, 'releases' | 'activeReleaseId' | 'invalidations' | 'audit'> {
  const active = state.releases.find((r) => r.id === state.activeReleaseId)
  if (!active) return { releases: state.releases, activeReleaseId: null, invalidations: state.invalidations, audit }

  const invalidation: LockInvalidation = {
    id: nextId('LI'),
    at: nowTime(),
    releaseId: active.id,
    releaseLabel: active.label,
    trigger: entry.trigger,
    target: entry.target,
    detail: entry.detail,
    actor: entry.actor,
    revisionBefore: active.revision,
    revisionAfter: state.revision,
  }
  const releases = state.releases.map((r) => r.id === active.id ? { ...r, supersededBy: invalidation.id } : r)
  const nextAudit = [
    auditEvent('系统', '锁定失效', active.label,
      `${entry.trigger}（${entry.target}）：${entry.detail}。原版本已作废，重新签字确认前禁止导出质量追溯包。`),
    ...audit,
  ]
  return { releases, activeReleaseId: null, invalidations: [invalidation, ...state.invalidations], audit: nextAudit }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const weldReducer = createReducer(
  initialState,

  on(A.loadWeldsSuccess, (state, { welds: rawWelds, plans: rawPlans }) => {
    // 只在首载迁移：后续追加记录是 append-only，绝不能被重放的查询覆盖
    if (state.loaded) return state
    const welds: Weld[] = rawWelds.map((w) => ({
      ...w,
      basis: '待补录',
      defects: (w.defects ?? []).map((d) => ({
        ...d,
        source: d.source ?? '锁定前原记录',
        recordedAt: d.recordedAt ?? '历史数据',
      })),
      transitions: [],
    }))
    const plans: InspectionPlan[] = rawPlans.map((p) => ({
      ...p,
      basis: '待补录',
      createdAt: p.createdAt ?? p.date,
      history: [],
    }))
    const audit = [
      auditEvent('系统', '旧批次转待补录', '检测批次',
        `载入 ${welds.length} 条焊缝、${plans.length} 个检测计划，均无版本依据，已转为「待补录」；原焊缝结果继续可查，补录签字前不得导出追溯包。`),
      ...state.audit,
    ]
    return {
      ...state, welds, plans, audit, loaded: true,
      selectedId: state.selectedId || welds[0]?.id || '',
      notice: notice('info', '旧批次没有版本依据，已全部转为「待补录」，原检测结果仍可查询。'),
    }
  }),

  on(A.selectWeld, (state, { id }) => ({ ...state, selectedId: id })),
  on(A.filterStatus, (state, { status }) => ({ ...state, statusFilter: status })),

  on(A.advanceWeld, (state, { id, status, actor, reason }) => {
    const weld = state.welds.find((w) => w.id === id)
    if (!weld || weld.status === status) return { ...state, notice: null }
    const at = nowTime()
    const transition = { id: nextId('ST'), at, from: weld.status, to: status, actor, reason }
    const enteringRepair = status === '返修中' && weld.status !== '返修中'
    const welds = state.welds.map((w) => w.id === id
      ? { ...w, status, repairs: w.repairs + (enteringRepair ? 1 : 0), transitions: [...w.transitions, transition] }
      : w)
    const audit = [
      auditEvent(actor, '状态流转', id,
        `状态「${weld.status}」→「${status}」，原因：${reason}${enteringRepair ? '，返修次数 +1' : ''}（流转记录 ${transition.id}，原记录保留）`),
      ...state.audit,
    ]
    const bumped: WeldState = { ...state, welds, revision: state.revision + 1, audit, notice: null }
    const lock = invalidateIfLocked(bumped, {
      trigger: '焊缝返修状态变更', target: id,
      detail: `状态由「${weld.status}」变为「${status}」`, actor,
    }, audit)
    return { ...bumped, ...lock }
  }),

  on(A.appendInspection, (state, { weldId, method, report, actor, defect }) => {
    const weld = state.welds.find((w) => w.id === weldId)
    if (!weld) return state
    const at = nowTime()
    // 复检合格（无新缺陷）关闭全部未关闭缺陷；有缺陷则进入返修。原检测记录一律不改写
    const passTransition = {
      id: nextId('ST'), at, from: weld.status, to: '合格' as WeldStatus, actor,
      reason: defect ? '追加检测发现缺陷，转返修' : '追加复检合格，原缺陷关闭',
    }
    const defects = defect
      ? [...weld.defects, {
          id: nextId('D'), position: defect.position, type: defect.type, length: defect.length,
          level: defect.level, method, report, source: state.activeReleaseId ? '锁定后追加复检' : '复检追加',
          recordedAt: at,
        }]
      : weld.defects.map((d) => (d.closedBy ? d : { ...d, closedBy: passTransition.id }))
    const toStatus: WeldStatus = defect ? '返修中' : '合格'
    // 状态实际变化时追加流转轨迹；检测记录本身无论状态是否变化都已追加留痕
    const transitions = weld.status === toStatus
      ? weld.transitions
      : [...weld.transitions, { ...passTransition, to: toStatus }]
    const welds = state.welds.map((w) => w.id === weldId
      ? {
          ...w, defects, status: toStatus, transitions,
          repairs: w.repairs + (defect && w.status !== '返修中' ? 1 : 0),
        }
      : w)
    const audit = [
      auditEvent(actor, defect ? '追加缺陷记录' : '追加复检记录', weldId,
        defect
          ? `追加 ${method} 检测发现「${defect.type} ${defect.level}」${defect.length}mm（位置 ${defect.position}%），报告 ${report}；原检测记录保留不改写。`
          : `追加 ${method} 复检合格，报告 ${report}；原缺陷记录标记关闭但保留可查。`),
      ...state.audit,
    ]
    const bumped: WeldState = { ...state, welds, revision: state.revision + 1, audit, notice: null }
    const lock = invalidateIfLocked(bumped, {
      trigger: defect ? '缺陷记录追加' : '复检结果追加', target: weldId,
      detail: defect ? `新增缺陷「${defect.type} ${defect.level}」` : `复检合格（${method}）`, actor,
    }, audit)
    return { ...bumped, ...lock }
  }),

  on(A.addPlan, (state, { plan }) => {
    const plans = [plan, ...state.plans]
    const audit = [
      auditEvent(plan.inspector, '新增检测计划', plan.id,
        `${plan.date} ${plan.method}，覆盖 ${plan.weldIds.length} 条焊缝；新计划在下次签字前为「待补录」版本依据。`),
      ...state.audit,
    ]
    const bumped: WeldState = { ...state, plans, revision: state.revision + 1, audit, notice: null }
    const lock = invalidateIfLocked(bumped, {
      trigger: '检测计划内容新增', target: plan.id,
      detail: `新增 ${plan.method} 计划，${plan.weldIds.length} 条焊缝`, actor: plan.inspector,
    }, audit)
    return { ...bumped, ...lock }
  }),

  on(A.advancePlan, (state, { id, state: to, actor }) => {
    const plan = state.plans.find((p) => p.id === id)
    if (!plan || plan.state === to) return state
    const at = nowTime()
    const plans = state.plans.map((p) => p.id === id
      ? { ...p, state: to, history: [...p.history, { at, from: p.state, to, actor }] }
      : p)
    const audit = [
      auditEvent(actor, '检测计划状态变更', id, `计划状态「${plan.state}」→「${to}」，变更轨迹已追加。`),
      ...state.audit,
    ]
    const bumped: WeldState = { ...state, plans, revision: state.revision + 1, audit, notice: null }
    const lock = invalidateIfLocked(bumped, {
      trigger: '检测计划状态变更', target: id,
      detail: `计划状态由「${plan.state}」变为「${to}」`, actor,
    }, audit)
    return { ...bumped, ...lock }
  }),

  on(A.submitSignature, (state, { reviewer, role, at, reviewerBasisHash, mode }) => {
    const weldsConfirmed = state.welds.map((w) => (w.basis === '待补录' ? { ...w, basis: '纳入版本' as const } : w))
    const plansConfirmed = state.plans.map((p) => (p.basis === '待补录' ? { ...p, basis: '纳入版本' as const } : p))
    const currentHash = contentHash(weldsConfirmed, plansConfirmed)
    const active = state.releases.find((r) => r.id === state.activeReleaseId)

    // ① 生效版本仍与当前内容一致：同一人拒绝重复；他人经签字动作再到视为并发冲突，会签须显式追加
    if (active && active.basisHash === currentHash) {
      if (active.signatures.some((s) => s.reviewer === reviewer)) {
        return { ...state, notice: notice('warn', `${reviewer} 已在 ${active.label} 签字，原审批记录保留，不重复写入。`) }
      }
      const first = active.signatures[0]
      const conflict: SignatureConflict = {
        id: nextId('CF'), at, reviewer, basisHash: reviewerBasisHash, rebased: false,
        winner: { reviewer: first.reviewer, releaseId: active.id, at: first.at },
        reason: `并发签字冲突：与 ${first.reviewer} 基于同一内容（${shortHash(reviewerBasisHash)}）同时提交，对方签字已于 ${first.at} 先到并生成 ${active.label}；本笔未写入，冲突现场保留。复核后可「刷新基线并会签」，原签字不会被改写。`,
      }
      return {
        ...state,
        conflicts: [conflict, ...state.conflicts],
        notice: notice('danger', conflict.reason),
      }
    }

    // ② CAS 失败：提交基线 ≠ 当前内容。两名审核人同基线同时提交时，后到者落入此分支
    if (reviewerBasisHash !== currentHash) {
      const winnerRelease = [...state.releases].reverse().find((r) => r.basisHash === reviewerBasisHash)
      let conflict: SignatureConflict
      if (winnerRelease && winnerRelease.signatures.length > 0) {
        const first = winnerRelease.signatures[0]
        conflict = {
          id: nextId('CF'), at, reviewer, basisHash: reviewerBasisHash, rebased: false,
          winner: { reviewer: first.reviewer, releaseId: winnerRelease.id, at: first.at },
          reason: `并发签字冲突：与 ${first.reviewer} 同时基于同一内容（${shortHash(reviewerBasisHash)}）提交，对方签字已于 ${first.at} 先到并生成 ${winnerRelease.label}；本笔未写入，冲突现场保留。`,
        }
      } else {
        conflict = {
          id: nextId('CF'), at, reviewer, basisHash: reviewerBasisHash, rebased: false,
          winner: { reviewer: '—', releaseId: '', at: '' },
          reason: `过期基线：提交所依据的内容（${shortHash(reviewerBasisHash)}）已不是当前内容（${shortHash(currentHash)}），期间计划、缺陷或返修状态发生过变化，需刷新基线重新确认。`,
        }
      }
      return {
        ...state,
        conflicts: [conflict, ...state.conflicts],
        notice: notice('danger', conflict.reason),
      }
    }

    // ③ CAS 成功：本笔为先到者，生成不可变放行版本
    const sig: Signature = { id: nextId('SG'), reviewer, at, role }
    const releaseNo = state.releases.length + 1
    const backfilled = state.welds.filter((w) => w.basis === '待补录').length
    const audit = [
      auditEvent(reviewer, mode === '补录基线' ? '补录签字' : '签字锁定', `R${releaseNo}（v${state.revision}）`,
        `${mode === '补录基线' ? `旧批次补录确认（${backfilled} 条焊缝补齐版本依据）` : '检测批次版本化放行'}；内容指纹 ${shortHash(currentHash)}，` +
        `冻结 ${weldsConfirmed.length} 条焊缝、${plansConfirmed.length} 个计划。此后任一内容变更，本版本立即失效。`),
      ...state.audit,
    ]
    // 快照在审批记录落账之后冻结：含本次签字，成为追溯包的完整依据
    const release: ReleaseVersion = {
      id: nextId('RL'),
      label: `R${releaseNo}（v${state.revision}）`,
      revision: state.revision,
      mode,
      basisHash: currentHash,
      createdAt: at,
      signatures: [sig],
      snapshot: { welds: clone(weldsConfirmed), plans: clone(plansConfirmed), audit: clone(audit) },
    }
    return {
      ...state,
      welds: weldsConfirmed, plans: plansConfirmed,
      releases: [release, ...state.releases], activeReleaseId: release.id,
      audit, exportBlockedAt: null,
      notice: notice('success', `签字成功：${release.label} 已锁定并作为追溯包唯一放行依据（指纹 ${shortHash(currentHash)}）。`),
    }
  }),

  on(A.rebaseSignature, (state, { conflictId, reviewer }) => {
    const conflict = state.conflicts.find((c) => c.id === conflictId)
    if (!conflict || conflict.rebased) return state
    const at = nowTime()
    const conflicts = state.conflicts.map((c) => c.id === conflictId ? { ...c, rebased: true, rebasedAt: at } : c)
    const audit = [
      auditEvent(reviewer, '冲突复核', conflict.winner.releaseId || '检测批次',
        `已查看并发签字冲突现场（先到者 ${conflict.winner.reviewer}），基线已刷新到当前内容，可重新提交签字；冲突记录保留不删。`),
      ...state.audit,
    ]
    return {
      ...state, conflicts, audit,
      notice: notice('info', '基线已刷新到当前内容，冲突记录保留；可在当前版本上重新提交签字。'),
    }
  }),

  on(A.countersign, (state, { reviewer, role, at }) => {
    const active = state.releases.find((r) => r.id === state.activeReleaseId)
    if (!active) {
      return { ...state, notice: notice('warn', '当前没有生效版本，无法会签；请先完成签字放行。') }
    }
    if (active.signatures.some((s) => s.reviewer === reviewer)) {
      return { ...state, notice: notice('warn', `${reviewer} 已在 ${active.label} 签字。`) }
    }
    const sig: Signature = { id: nextId('SG'), reviewer, at, role }
    const releases = state.releases.map((r) => r.id === active.id ? { ...r, signatures: [...r.signatures, sig] } : r)
    const audit = [auditEvent(reviewer, '追加会签', active.label, '锁定后追加会签，原检测记录与审批记录均未改写。'), ...state.audit]
    return { ...state, releases, audit, notice: notice('success', `会签已追加到 ${active.label}。`) }
  }),

  on(A.requestExport, (state) => {
    const active = state.releases.find((r) => r.id === state.activeReleaseId)
    const hash = contentHash(state.welds, state.plans)
    if (active && active.basisHash === hash) {
      const audit = [
        auditEvent('系统', '导出追溯包', active.label,
          `按生效版本 ${active.label} 导出（指纹 ${shortHash(hash)}）：${active.snapshot.welds.length} 条焊缝、` +
          `${active.snapshot.plans.length} 个计划、${active.signatures.length} 个签字，含完整检测与审批原始记录。`),
        ...state.audit,
      ]
      return {
        ...state, audit, exportBlockedAt: null,
        notice: notice('success', `已按 ${active.label} 冻结快照导出质量追溯包，内容与签字结论一致。`),
      }
    }
    const reason = !state.releases.length
      ? '尚无放行版本：旧批次处于待补录状态，补齐版本依据并签字前不能导出追溯包。'
      : !active
        ? `原锁定 ${state.invalidations[0]?.releaseLabel ?? ''} 已因「${state.invalidations[0]?.trigger ?? '内容变更'}」失效，必须重新签字确认。`
        : '当前计划/缺陷/返修内容与已签字版本不一致，必须重新确认后才能导出。'
    const at = nowTime()
    const audit = [auditEvent('系统', '拦截导出', '质量追溯包', reason), ...state.audit]
    return { ...state, audit, exportBlockedAt: at, notice: notice('danger', `导出被拦截：${reason}`) }
  }),

  on(A.dismissExportBlock, (state) => ({ ...state, exportBlockedAt: null })),
  on(A.dismissNotice, (state) => ({ ...state, notice: null })),
)

/** 选择器：当前生效版本（未被作废且与现内容一致才算真正可用） */
export function selectActiveRelease(state: WeldState): ReleaseVersion | null {
  const active = state.releases.find((r) => r.id === state.activeReleaseId)
  if (!active) return null
  return active.basisHash === contentHash(state.welds, state.plans) ? active : null
}

export function selectCurrentHash(state: WeldState): string {
  return contentHash(state.welds, state.plans)
}
