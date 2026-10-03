import { Component, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { Store } from '@ngrx/store'
import { TableModule } from 'primeng/table'
import { TagModule } from 'primeng/tag'
import { ButtonModule } from 'primeng/button'
import { DialogModule } from 'primeng/dialog'
import { InputTextModule } from 'primeng/inputtext'
import { TextareaModule } from 'primeng/textarea'
import { SelectButtonModule } from 'primeng/selectbutton'
import { WeldState, releaseStatusOf } from '../store/weld.reducer'
import * as A from '../store/weld.actions'
import type { Defect, DefectLevel } from '../types'

@Component({
  selector: 'app-inspections', standalone: true, imports: [CommonModule, FormsModule, TableModule, TagModule, ButtonModule, DialogModule, InputTextModule, TextareaModule, SelectButtonModule],
  template: `
    <main class="page">
      <div class="page-head"><div><p class="eyebrow">NDT / 返修闭环</p><h1>检测计划与返修</h1><p>检测结果绑定缺陷位置、等级、照片、报告和返修方案；失败与复检不可无痕跳过。</p></div><p-button label="新增检测结果" icon="pi pi-plus" (onClick)="dialog = true" /></div>

      <div class="banner" [class]="release.tone">
        <i class="pi" [class.pi-exclamation-triangle]="release.status==='已失效' || release.status==='待补录'" [class.pi-info-circle]="release.status==='未锁定'" [class.pi-check-circle]="release.status==='已锁定'"></i>
        <div><b>{{release.title}}</b><p>{{release.desc}}；任何计划内容、缺陷或返修状态变更都将使原锁定立即失效，需重新确认后方可导出追溯包。</p></div>
      </div>

      <div class="grid-2">
        <section class="card">
          <h2 class="panel-title">批量检测计划</h2>
          <p-table [value]="state.plans" [paginator]="true" [rows]="6">
            <ng-template #header><tr><th>计划编号</th><th>日期</th><th>方法</th><th>焊缝</th><th>检测人</th><th>状态</th><th></th></tr></ng-template>
            <ng-template #body let-plan>
              <tr><td>{{plan.id}}<small class="block">v{{plan.version}}<span *ngIf="plan.legacy" class="legacy"> · 待补录</span></small></td><td>{{plan.date}}</td><td>{{plan.method}}</td><td>{{plan.weldIds.length}} 条</td><td>{{plan.inspector}}</td><td><p-tag [value]="plan.state" [severity]="plan.state === '已完成' ? 'success' : plan.state === '执行中' ? 'info' : 'warn'" /></td>
              <td><p-button [label]="plan.state === '待执行' ? '开始执行' : plan.state === '执行中' ? '完成' : '已完成'" size="small" [disabled]="plan.state==='已完成'" (onClick)="advancePlan(plan)" /></td></tr>
            </ng-template>
          </p-table>
        </section>
        <aside class="card">
          <h2 class="panel-title">返修状态流转</h2>
          <div class="step" *ngFor="let weld of repairWelds">
            <div><b>{{weld.id}} · {{weld.component}}</b><small>{{weld.defects.length}} 个缺陷 · 已返修 {{weld.repairs}} 次 · v{{weld.version}}</small></div>
            <p-tag [value]="weld.status" severity="warn" />
            <p-selectbutton [options]="['返修中','待复检','合格']" [ngModel]="weld.status" (ngModelChange)="advance(weld.id,$event)" />
            <div class="append-row">
              <p-button label="追加复检（待复检）" icon="pi pi-history" size="small" severity="secondary" outlined (onClick)="append(weld.id,'复检','追加返修后复检', '待复检')" />
              <p-button label="复检合格" icon="pi pi-check" size="small" (onClick)="append(weld.id,'复检','复检合格，关闭返修', '合格')" />
            </div>
          </div>
          <p-button label="提交质量负责人审核" icon="pi pi-send" styleClass="w-full" />
        </aside>
      </div>

      <section class="card mt-4">
        <h2 class="panel-title">检测结果与缺陷明细</h2>
        <p-table [value]="defects" [paginator]="true" [rows]="8">
          <ng-template #header><tr><th>缺陷编号</th><th>焊缝</th><th>位置 / 长度</th><th>类型 / 等级</th><th>检测方法</th><th>报告</th><th>处置</th></tr></ng-template>
          <ng-template #body let-item>
            <tr><td>{{item.defect.id}}</td><td>{{item.weld.id}}</td><td>{{item.defect.position}}% · {{item.defect.length}}mm</td><td>{{item.defect.type}} · {{item.defect.level}}</td><td>{{item.defect.method}}</td><td>{{item.defect.report}}</td>
            <td><p-button label="退回方案" severity="danger" size="small" text /><p-button label="确认复检" size="small" (onClick)="append(item.weld.id,'复检','缺陷确认复检', '待复检')" /></td></tr>
          </ng-template>
        </p-table>
      </section>

      <section class="card mt-4">
        <h2 class="panel-title">追加检测 / 复检记录（只追加，不改写历史）</h2>
        <div class="rec" *ngFor="let rec of records">
          <div><b>{{rec.weldId}} · {{rec.type}}</b><small>{{rec.time}} · {{rec.operator}} · 修订 r{{rec.revision}}<span *ngIf="rec.fromStatus"> · {{rec.fromStatus}} → {{rec.toStatus}}</span></small></div>
          <span>{{rec.result}}</span>
        </div>
        <p class="muted" *ngIf="!records.length">暂无追加记录。锁定后仍可追加复检或更正，原检测记录与审批记录保持只读、不被覆盖。</p>
      </section>

      <p-dialog header="录入检测结果" [(visible)]="dialog" [modal]="true" [style]="{width:'620px'}">
        <div class="form"><label>焊缝编号</label><input pInputText [(ngModel)]="form.weldId" /><label>检测方法</label><select [(ngModel)]="form.method"><option>UT</option><option>MT</option><option>PT</option></select><label>缺陷位置（0–100%）</label><input pInputText type="number" [(ngModel)]="form.position" /><label>缺陷类型与等级</label><input pInputText [(ngModel)]="form.type" placeholder="如：未熔合 / Ⅲ级" /><label>报告编号与说明</label><textarea pTextarea [(ngModel)]="form.report" rows="4"></textarea></div>
        <ng-template #footer><p-button label="取消" severity="secondary" (onClick)="dialog=false" /><p-button label="提交结果" [disabled]="!form.weldId || !form.report" (onClick)="submit()" /></ng-template>
      </p-dialog>
    </main>
  `,
  styles: [`
    .banner{display:flex;gap:12px;align-items:flex-start;padding:13px 16px;border-radius:8px;margin-bottom:16px;border:1px solid #e1e7ef}.banner>i{font-size:20px;margin-top:2px}.banner div{flex:1}.banner b{font-size:15px}.banner p{margin:3px 0 0;font-size:13px;color:#475467}
    .banner.tone-ok{background:#ecfdf3;border-color:#abefc6}.banner.tone-ok>i{color:#15803d}.banner.tone-bad{background:#fef3f2;border-color:#fda29b}.banner.tone-bad>i{color:#dc2626}.banner.tone-warn{background:#fffaeb;border-color:#fedf89}.banner.tone-warn>i{color:#d97706}.banner.tone-info{background:#eff8ff;border-color:#b2ddff}.banner.tone-info>i{color:#2563eb}
    .block{display:block;color:#7a8798;margin-top:3px}.legacy{color:#d97706}
    .step{display:grid;grid-template-columns:1fr auto;gap:9px;padding:12px 0;border-bottom:1px solid #edf0f5}.step>div,.step small{display:block}.step small{color:#7a8798;margin-top:4px}.step p-selectbutton{grid-column:1/-1}.append-row{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap}
    .form{display:grid;gap:9px}.form input,.form select,.form textarea{padding:9px;border:1px solid #cbd5e1;border-radius:6px;width:100%}.mt-3{margin-top:12px}.mt-4{margin-top:16px}
    .rec{display:grid;grid-template-columns:1fr 1.4fr;gap:10px;padding:10px;border-bottom:1px solid #edf0f5}.rec b,.rec small{display:block}.rec small{color:#7a8798;margin-top:3px}.rec span{color:#475467;font-size:13px}.muted{color:#7a8798;font-size:13px}
  `],
})
export class InspectionsComponent {
  private readonly store = inject(Store<{ welds: WeldState }>)
  state!: WeldState
  dialog = false
  form = { weldId: 'W-109', method: 'UT', position: 42, type: '未熔合 / Ⅲ级', report: 'UT-2026-0929-08；按 NB/T 47013.3 评定。' }
  constructor() { this.store.select('welds').subscribe((state) => this.state = state) }

  get release() {
    const status = releaseStatusOf(this.state)
    const map: Record<string, { tone: string; title: string; desc: string }> = {
      待补录: { tone: 'tone-warn', title: '旧批次无版本依据（待补录）', desc: '原焊缝结果继续可查；补录版本依据前无法锁定放行' },
      未锁定: { tone: 'tone-info', title: '当前版本未锁定', desc: '内容变更将生成新版本并在签字后锁定' },
      已锁定: { tone: 'tone-ok', title: `v${this.state.version} 已签字锁定`, desc: '锁定后仍可追加复检 / 更正，但将派生新修订并使本版锁定失效' },
      已失效: { tone: 'tone-bad', title: '原锁定已失效', desc: '内容已变更，需重新签字确认后方可导出追溯包' },
    }
    return { status, ...map[status] }
  }

  get repairWelds() { return (this.state?.welds ?? []).filter((item) => ['返修中','待复检'].includes(item.status)) }
  get defects() { return (this.state?.welds ?? []).flatMap((weld) => weld.defects.map((defect) => ({ weld, defect }))) }
  get records() { return (this.state?.welds ?? []).flatMap((weld) => weld.records).sort((a, b) => (a.time < b.time ? 1 : -1)) }

  advance(id: string, status: string) { this.store.dispatch(A.advanceWeld({ id, status: status as never })) }
  append(weldId: string, recordType: '复检' | '更正', result: string, toStatus: '待复检' | '合格') { this.store.dispatch(A.appendInspection({ weldId, recordType, result, toStatus })) }
  advancePlan(plan: { id: string; state: string }) {
    const next = plan.state === '待执行' ? '执行中' : '已完成'
    this.store.dispatch(A.updatePlanState({ id: plan.id, planState: next as never }))
  }
  submit() {
    const parts = this.form.type.split('/').map((s) => s.trim())
    const defect: Defect = {
      id: `DF-${Date.now().toString(36)}`,
      position: Number(this.form.position) || 0,
      type: parts[0] || '未熔合',
      length: 12,
      level: (parts[1] || 'Ⅲ级') as DefectLevel,
      method: this.form.method,
      report: this.form.report,
    }
    this.store.dispatch(A.addDefect({ weldId: this.form.weldId, defect }))
    this.dialog = false
  }
}
