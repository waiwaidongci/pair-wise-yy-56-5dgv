import { Component, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { Store } from '@ngrx/store'
import { TableModule } from 'primeng/table'
import { TagModule } from 'primeng/tag'
import { ButtonModule } from 'primeng/button'
import { DialogModule } from 'primeng/dialog'
import { InputTextModule } from 'primeng/inputtext'
import { TextareaModule } from 'primeng/textarea'
import { SelectButtonModule } from 'primeng/selectbutton'
import { TooltipModule } from 'primeng/tooltip'
import { WeldState, selectActiveRelease } from '../store/weld.reducer'
import * as A from '../store/weld.actions'
import type { DefectLevel, PlanState } from '../types'

const CURRENT_USER = '陈锋（检测工程师）'

@Component({
  selector:'app-inspections', standalone:true, imports:[CommonModule,FormsModule,RouterLink,TableModule,TagModule,ButtonModule,DialogModule,InputTextModule,TextareaModule,SelectButtonModule,TooltipModule],
  template:`
    <main class="page">
      <div class="page-head">
        <div><p class="eyebrow">NDT / 返修闭环</p><h1>检测计划与返修</h1><p>检测结果只能追加、不能改写；已锁定后允许追加复检或更正，但原锁定立即失效，需重新签字。</p></div>
        <p-button label="追加检测 / 复检记录" icon="pi pi-plus" (onClick)="dialog = true" />
      </div>

      <div class="banner info" *ngIf="active">
        <i class="pi pi-lock-fill"></i>
        <span>当前 <b>{{active!.label}}</b> 已锁定（指纹一致）。下列变更属于「锁定后追加」：原检测记录与审批记录封存不动，但新追加内容将使该锁定<b>立即失效</b>，追溯包需重新签字后才能导出。</span>
      </div>
      <div class="banner danger" *ngIf="!active && state.invalidations.length">
        <i class="pi pi-exclamation-triangle"></i>
        <span>原锁定 <b>{{state.invalidations[0].releaseLabel}}</b> 已因「{{state.invalidations[0].trigger}}」失效，重新签字确认前不能导出追溯包。<a routerLink="/approvals">前往审核锁定 →</a></span>
      </div>

      <div class="grid-2">
        <section class="card">
          <h2 class="panel-title">批量检测计划</h2>
          <p-table [value]="state.plans" [paginator]="true" [rows]="6">
            <ng-template #header><tr><th>计划编号</th><th>日期 / 方法</th><th>焊缝</th><th>检测人</th><th>版本依据</th><th>状态与流转</th></tr></ng-template>
            <ng-template #body let-plan>
              <tr>
                <td>{{plan.id}}</td><td>{{plan.date}} · {{plan.method}}</td><td>{{plan.weldIds.length}} 条</td><td>{{plan.inspector}}</td>
                <td><p-tag [value]="plan.basis" [severity]="plan.basis === '待补录' ? 'warn' : 'success'" /></td>
                <td>
                  <p-tag [value]="plan.state" [severity]="plan.state === '已完成' ? 'success' : plan.state === '执行中' ? 'info' : 'warn'" />
                  <p-button label="" icon="pi pi-forward" size="small" text pTooltip="推进计划状态"
                    [disabled]="plan.state === '已完成'" (onClick)="advancePlan(plan.id, plan.state)" />
                </td>
              </tr>
            </ng-template>
          </p-table>
          <p class="plan-hint">计划状态变化属于计划内容变化：生效锁定会立即作废并记入审计。</p>
        </section>

        <aside class="card">
          <h2 class="panel-title">返修状态流转（只追加轨迹）</h2>
          <div class="step" *ngFor="let weld of repairWelds">
            <div><b>{{weld.id}} · {{weld.component}}</b><small>{{weld.defects.length}} 个缺陷 · 已返修 {{weld.repairs}} 次 · 最近流转 {{lastTransition(weld)}}</small></div>
            <p-tag [value]="weld.status" severity="warn" />
            <p-selectbutton [options]="['返修中','待复检','合格']" [ngModel]="weld.status" (ngModelChange)="advance(weld.id,$event)" />
          </div>
          <p class="muted" *ngIf="!repairWelds.length">当前没有返修中/待复检焊缝。</p>
          <p-button label="提交质量负责人审核" icon="pi pi-send" styleClass="w-full" [routerLink]="['/approvals']" />
        </aside>
      </div>

      <section class="card mt-4">
        <h2 class="panel-title">检测结果与缺陷明细（原始记录不可改写）</h2>
        <p-table [value]="defects" [paginator]="true" [rows]="8">
          <ng-template #header><tr><th>缺陷编号</th><th>焊缝</th><th>位置 / 长度</th><th>类型 / 等级</th><th>检测方法 / 报告</th><th>来源与时间</th><th>状态</th></tr></ng-template>
          <ng-template #body let-item>
            <tr>
              <td>{{item.defect.id}}</td><td>{{item.weld.id}}</td>
              <td>{{item.defect.position}}% · {{item.defect.length}}mm</td>
              <td>{{item.defect.type}} · {{item.defect.level}}</td>
              <td>{{item.defect.method}} · {{item.defect.report}}</td>
              <td><small>{{item.defect.source}}<br>{{item.defect.recordedAt}}</small></td>
              <td><p-tag [value]="item.defect.closedBy ? '已关闭(复检合格)' : '未关闭'" [severity]="item.defect.closedBy ? 'success' : 'danger'" /></td>
            </tr>
          </ng-template>
        </p-table>
      </section>

      <p-dialog header="追加检测 / 复检记录（原记录封存）" [(visible)]="dialog" [modal]="true" [style]="{width:'620px'}">
        <div class="form">
          <label>焊缝编号</label><input pInputText [(ngModel)]="form.weldId" />
          <label>检测方法</label><select [(ngModel)]="form.method"><option>UT</option><option>MT</option><option>PT</option></select>
          <div class="form-row">
            <div><label>缺陷位置（0–100%）</label><input pInputText type="number" [(ngModel)]="form.position" /></div>
            <div><label>缺陷长度 mm</label><input pInputText type="number" [(ngModel)]="form.length" /></div>
          </div>
          <label>缺陷类型</label><input pInputText [(ngModel)]="form.type" placeholder="如：未熔合" />
          <label>缺陷等级</label><select [(ngModel)]="form.level"><option>Ⅰ级</option><option>Ⅱ级</option><option>Ⅲ级</option><option>Ⅳ级</option></select>
          <label>检测人</label><input pInputText [ngModel]="currentUser" disabled />
          <label>报告编号与说明</label><textarea pTextarea [(ngModel)]="form.report" rows="3"></textarea>
          <p class="form-hint">本次复检<b>无新缺陷</b>时，清空缺陷类型再提交：原缺陷标记为「已关闭」但记录保留；锁定生效时本次追加将同时作废原锁定。</p>
        </div>
        <ng-template #footer><p-button label="取消" severity="secondary" (onClick)="dialog=false" /><p-button label="追加记录" [disabled]="!form.weldId || !form.report" (onClick)="submit()" /></ng-template>
      </p-dialog>
    </main>
  `,
  styles:[`
    .banner{display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:8px;margin-bottom:14px;font-size:13.5px;line-height:1.7;border:1px solid}
    .banner i{font-size:16px}.banner.info{background:#eff6ff;border-color:#93c5fd;color:#1d4ed8}
    .banner.danger{background:#fef2f2;border-color:#fca5a5;color:#b91c1c}.banner a{color:inherit;font-weight:700;white-space:nowrap}
    .step{display:grid;gap:9px;padding:12px 0;border-bottom:1px solid #edf0f5}.step b,.step small{display:block}.step small{color:#7a8798;margin-top:4px;font-size:12.5px}.step p-selectbutton{grid-column:1/-1}
    .form{display:grid;gap:8px}.form label{font-size:13px;color:#475569;font-weight:600}.form input,.form select,.form textarea{padding:9px;border:1px solid #cbd5e1;border-radius:6px;width:100%}
    .form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.form-hint{font-size:12px;color:#7a8798;line-height:1.6}
    .plan-hint{font-size:12px;color:#7a8798;margin-top:10px}.muted{color:#7a8798;font-size:13px}.mt-4{margin-top:16px}
  `],
})
export class InspectionsComponent {
  private readonly store = inject(Store<{ welds: WeldState }>)
  state!: WeldState
  dialog = false
  currentUser = CURRENT_USER
  form = { weldId:'W-109', method:'UT', position:42, length:10, type:'未熔合', level:'Ⅲ级' as DefectLevel, report:'UT-2026-0929-08；按 NB/T 47013.3 评定。' }

  constructor() { this.store.select('welds').subscribe((state) => this.state = state) }

  get active() { return selectActiveRelease(this.state) }
  get repairWelds() { return (this.state?.welds ?? []).filter((item) => ['返修中','待复检'].includes(item.status)) }
  get defects() {
    return (this.state?.welds ?? []).flatMap((weld) => weld.defects.map((defect) => ({ weld, defect })))
  }
  lastTransition(weld: { transitions: { at: string; to: string }[] }) {
    const t = weld.transitions[weld.transitions.length - 1]
    return t ? `${t.at} → ${t.to}` : '锁定前历史状态'
  }

  advance(id: string, status: string) {
    this.store.dispatch(A.advanceWeld({
      id, status: status as never, actor: CURRENT_USER, reason: '返修闭环页面状态流转',
    }))
  }

  advancePlan(id: string, current: PlanState) {
    const next: PlanState = current === '待执行' ? '执行中' : '已完成'
    this.store.dispatch(A.advancePlan({ id, state: next, actor: CURRENT_USER }))
  }

  submit() {
    const hasDefect = this.form.type.trim().length > 0
    this.store.dispatch(A.appendInspection({
      weldId: this.form.weldId, method: this.form.method, report: this.form.report, actor: CURRENT_USER,
      defect: hasDefect
        ? { position: Number(this.form.position), type: this.form.type, level: this.form.level, length: Number(this.form.length) }
        : undefined,
    }))
    this.dialog = false
  }
}
