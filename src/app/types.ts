export type WeldStatus = '待检测' | '合格' | '返修中' | '待复检' | '已关闭'
export type DefectLevel = 'Ⅰ级' | 'Ⅱ级' | 'Ⅲ级' | 'Ⅳ级'
export type ReleaseStatus = '待补录' | '未锁定' | '已锁定' | '已失效'
export type RecordType = '检测' | '复检' | '更正' | '返修确认'

export interface Defect {
  id: string
  position: number
  type: string
  length: number
  level: DefectLevel
  method: string
  report: string
}

/** 追加的检测 / 复检 / 更正记录：只追加，不改写历史。 */
export interface InspectionRecord {
  id: string
  weldId: string
  time: string
  type: RecordType
  result: string
  operator: string
  fromStatus?: WeldStatus
  toStatus?: WeldStatus
  revision: number
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
  records: InspectionRecord[]
  /** 内容版本：计划内容、缺陷或返修状态每变更一次即递增。 */
  version: number
  /** 旧批次无版本依据 → 待补录；原焊缝结果继续可查。 */
  legacy: boolean
}

export interface InspectionPlan {
  id: string
  date: string
  method: string
  weldIds: string[]
  inspector: string
  state: '待执行' | '执行中' | '已完成'
  version: number
  legacy: boolean
}

/** 版本化锁定基线：签字只对锁定当时的内容版本与指纹负责。 */
export interface Baseline {
  id: string
  version: number
  contentHash: string
  lockedAt: string
  status: '有效' | '已失效'
  signers: string[]
}

/** 签字记录（含并发冲突现场）。 */
export interface SignatureRecord {
  id: string
  time: string
  actor: string
  basedOnVersion: number
  result: '通过' | '冲突'
  reason: string
}

export interface AuditEvent {
  id: string
  time: string
  actor: string
  action: string
  target: string
  detail: string
}
