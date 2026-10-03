import { createAction, props } from '@ngrx/store'
import type {
  DefectLevel, InspectionPlan, PlanState, ReleaseMode, Weld, WeldStatus,
} from '../types'

export const loadWelds = createAction('[Weld] Load')
export const loadWeldsSuccess = createAction('[Weld API] Load Success', props<{ welds: Weld[]; plans: InspectionPlan[] }>())
export const selectWeld = createAction('[Weld] Select', props<{ id: string }>())
export const filterStatus = createAction('[Weld] Filter Status', props<{ status: string }>())

/** 焊缝状态流转：只追加 transition；若锁有效则同时作废旧锁 */
export const advanceWeld = createAction(
  '[Weld] Advance',
  props<{ id: string; status: WeldStatus; actor: string; reason: string }>(),
)

/** 追加检测记录（可带缺陷）；原检测记录不改写 */
export const appendInspection = createAction(
  '[Inspection] Append Record',
  props<{
    weldId: string
    method: string
    report: string
    actor: string
    defect?: { position: number; type: string; level: DefectLevel; length: number }
  }>(),
)

export const addPlan = createAction('[Inspection] Add Plan', props<{ plan: InspectionPlan }>())

/** 计划状态变化属于计划内容变化，锁有效时立即作废 */
export const advancePlan = createAction(
  '[Inspection] Advance Plan',
  props<{ id: string; state: PlanState; actor: string }>(),
)

/**
 * 签字（CAS）：以 reviewerBasisHash 为并发凭证。
 * 两名审核人同基线同时提交，仅先到一笔生成放行版本；后到一笔落冲突记录并保留现场。
 */
export const submitSignature = createAction(
  '[Approval] Submit Signature',
  props<{
    reviewer: string
    role: string
    at: string
    /** 提交人看到的基线哈希；与当前内容不一致则直接冲突 */
    reviewerBasisHash: string
    mode: ReleaseMode
  }>(),
)

/** 冲突后复核人刷新基线（不清除冲突，仅标记已复核，可在新版本上重提） */
export const rebaseSignature = createAction(
  '[Approval] Rebase After Conflict',
  props<{ conflictId: string; reviewer: string }>(),
)

/** 锁后追加会签：只向已生效版本追加签字记录，原签字不动 */
export const countersign = createAction(
  '[Approval] Countersign',
  props<{ reviewer: string; role: string; at: string }>(),
)

/** 导出质量追溯包：仅当前内容与生效版本一致时放行 */
export const requestExport = createAction('[Traceability] Request Export')
export const dismissExportBlock = createAction('[Traceability] Dismiss Block')
export const dismissNotice = createAction('[UI] Dismiss Notice')
