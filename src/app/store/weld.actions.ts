import { createAction, props } from '@ngrx/store'
import type { Defect, InspectionPlan, RecordType, Weld, WeldStatus } from '../types'

export const loadWelds = createAction('[Weld] Load')
export const loadWeldsSuccess = createAction('[Weld API] Load Success', props<{ welds: Weld[]; plans: InspectionPlan[] }>())
export const selectWeld = createAction('[Weld] Select', props<{ id: string }>())
export const filterStatus = createAction('[Weld] Filter Status', props<{ status: string }>())

// —— 内容变更：任一计划内容、缺陷或返修状态一变，版本递增并使原锁定立即失效 ——
export const advanceWeld = createAction('[Weld] Advance', props<{ id: string; status: WeldStatus }>())
export const createPlan = createAction('[Inspection] Create Plan', props<{ plan: InspectionPlan }>())
export const updatePlanState = createAction('[Inspection] Update Plan State', props<{ id: string; planState: InspectionPlan['state'] }>())
export const addDefect = createAction('[Inspection] Add Defect', props<{ weldId: string; defect: Defect }>())
/** 锁定后允许追加复检 / 更正：只追加新修订，原检测记录与审批记录不改写。 */
export const appendInspection = createAction('[Inspection] Append Record', props<{ weldId: string; recordType: RecordType; result: string; toStatus?: WeldStatus }>())

// —— 版本化签字放行 ——
export const signLock = createAction('[Approval] Sign Lock', props<{ actor: string; basedOnVersion: number }>())
/** 旧批次补录版本依据：原焊缝结果继续有效、可查询。 */
export const supplementBasis = createAction('[Approval] Supplement Basis')
/** 导出质量追溯包：仅当存在对当前版本的有效锁定时放行。 */
export const exportPackage = createAction('[Approval] Export Package')
