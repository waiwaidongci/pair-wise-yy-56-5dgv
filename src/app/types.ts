export type WeldStatus = '待检测' | '合格' | '返修中' | '待复检' | '已关闭'
export type DefectLevel = 'Ⅰ级' | 'Ⅱ级' | 'Ⅲ级' | 'Ⅳ级'
export type BasisTag = '待补录' | '纳入版本'
export type PlanState = '待执行' | '执行中' | '已完成'
export type ReleaseMode = '签字放行' | '补录基线'

export interface Defect {
  id: string
  position: number
  type: string
  length: number
  level: DefectLevel
  method: string
  report: string
  /** 追加来源：锁定前原记录 / 复检追加 / 更正追加，原记录永不改写 */
  source: string
  recordedAt: string
  /** 该缺陷被关闭的状态流转 id；未关闭为 undefined */
  closedBy?: string
}

/** 状态流转记录（append-only），焊缝当前状态是它的投影 */
export interface StatusTransition {
  id: string
  at: string
  from: WeldStatus
  to: WeldStatus
  actor: string
  reason: string
}

export interface Weld {
  id: string
  drawing: string
  component: string
  joint: string
  method: string
  welder: string
  qualification: string
  qualificationValid: boolean
  inspectionRatio: number
  requiredRatio: number
  status: WeldStatus
  x: number
  y: number
  repairs: number
  defects: Defect[]
  /** 版本依据：旧批次首载为待补录，被某个放行版本确认后转为纳入版本 */
  basis: BasisTag
  transitions: StatusTransition[]
}

export interface InspectionPlan {
  id: string
  date: string
  method: string
  weldIds: string[]
  inspector: string
  state: PlanState
  basis: BasisTag
  createdAt: string
  history: { at: string; from: PlanState; to: PlanState; actor: string }[]
}

export interface AuditEvent {
  id: string
  time: string
  actor: string
  action: string
  target: string
  detail: string
}

export interface Signature {
  id: string
  reviewer: string
  at: string
  role: string
}

/** 一次成功的签字即生成一个不可变放行版本 */
export interface ReleaseVersion {
  id: string
  /** 语义版本号：v12 为工作修订号，放行号每次签字递增 */
  label: string
  revision: number
  mode: ReleaseMode
  basisHash: string
  createdAt: string
  signatures: Signature[]
  /** 冻结当时全部业务数据与审批记录，导追溯包只能用这份 */
  snapshot: {
    welds: Weld[]
    plans: InspectionPlan[]
    audit: AuditEvent[]
  }
  /** 被后续变更作废后仍保留，supersededBy 指向作废它的变更记录 id */
  supersededBy?: string
}

export interface SignatureConflict {
  id: string
  at: string
  reviewer: string
  basisHash: string
  /** 冲突现场：已被接受的那笔签字 */
  winner: { reviewer: string; releaseId: string; at: string }
  reason: string
  /** rebase 到新版本后不再阻塞，记录保留 */
  rebased: boolean
  rebasedAt?: string
}

export interface LockInvalidation {
  id: string
  at: string
  releaseId: string
  releaseLabel: string
  trigger: string
  target: string
  detail: string
  actor: string
  revisionBefore: number
  revisionAfter: number
}

export interface ExportAttempt {
  at: string
  blocked: boolean
  releaseId?: string
  reason?: string
}
