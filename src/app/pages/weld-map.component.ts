import { Component, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Store } from '@ngrx/store'
import { ButtonModule } from 'primeng/button'
import { TagModule } from 'primeng/tag'
import { DialogModule } from 'primeng/dialog'
import { WeldState, selectActiveRelease } from '../store/weld.reducer'
import { nowTime } from '../services/versioning'
import * as A from '../store/weld.actions'
import type { Weld } from '../types'

@Component({
  selector:'app-weld-map', standalone:true, imports:[CommonModule,ButtonModule,TagModule,DialogModule],
  template:`
    <main class="page"><div class="page-head"><div><p class="eyebrow">二维构件定位</p><h1>构件焊缝地图</h1><p>在构件展开图上定位焊缝、缺陷和返修位置，颜色代表当前质量状态。</p></div><p-button label="批量生成检测计划" icon="pi pi-calendar-plus" (onClick)="planDialog = true" /></div>
      <div class="banner info" *ngIf="active"><i class="pi pi-lock-fill"></i><span>{{active!.label}} 已锁定；新生成计划属于计划内容变更，将立即作废原锁定。</span></div>
      <div class="map-grid"><section class="card drawing-card"><div class="drawing-head"><span>构件图 SG-07-屋面梁 · 展开示意</span><span>单位：mm · 比例 1:50</span></div><svg viewBox="0 0 100 90" class="weld-map"><defs><pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="#dbe2ea" stroke-width=".2"/></pattern></defs><rect x="3" y="3" width="94" height="84" fill="url(#grid)" stroke="#334155"/><path d="M8 20H92M8 42H92M8 66H92" stroke="#94a3b8" stroke-width="4"/><path d="M16 12V78M42 12V78M70 12V78M86 12V78" stroke="#cbd5e1" stroke-width="7"/><g *ngFor="let weld of state.welds"><circle [attr.cx]="weld.x" [attr.cy]="weld.y" r="3.2" [attr.fill]="color(weld)" stroke="#fff" stroke-width="1" (click)="select(weld)" /><text [attr.x]="weld.x+4" [attr.y]="weld.y-4" class="label">{{weld.id}}</text><circle *ngFor="let defect of weld.defects" [attr.cx]="weld.x + defect.position / 30" [attr.cy]="weld.y + 4" r="1.4" [attr.fill]="defect.closedBy ? '#94a3b8' : '#dc2626'" /></g><text x="50" y="86" class="axis">红=未关闭缺陷 · 灰=复检关闭（记录保留） →</text></svg></section>
        <aside class="card"><h2 class="panel-title">焊缝明细</h2><div *ngIf="selected" class="detail"><div class="detail-head"><div><small>{{selected.drawing}}</small><h3>{{selected.id}} · {{selected.component}}</h3></div><p-tag [value]="selected.status" [severity]="selected.status === '合格' || selected.status === '已关闭' ? 'success' : selected.status === '返修中' ? 'danger' : 'warn'" /></div><div class="kv"><span>版本依据</span><b [class.pending]="selected.basis === '待补录'">{{selected.basis}}</b></div><div class="kv"><span>焊接方法</span><b>{{selected.method}} / {{selected.joint}}</b></div><div class="kv"><span>焊工</span><b>{{selected.welder}}</b></div><div class="kv"><span>检测比例</span><b [class.danger]="selected.inspectionRatio < selected.requiredRatio">{{selected.inspectionRatio}}% / {{selected.requiredRatio}}%</b></div><div class="kv"><span>返修次数</span><b>{{selected.repairs}}</b></div><h3>缺陷记录（追加留痕）</h3><div *ngFor="let defect of selected.defects" class="defect" [class.closed]="!!defect.closedBy"><b>{{defect.id}} · {{defect.type}}</b><p>位置 {{defect.position}}% · 长度 {{defect.length}}mm · {{defect.level}} · {{defect.method}}</p><small>{{defect.source}} · {{defect.recordedAt}}<span *ngIf="defect.closedBy"> · 已由复检关闭</span></small></div><p class="muted" *ngIf="!selected.defects.length">当前无缺陷记录。</p><h3>状态流转轨迹</h3><p class="muted" *ngIf="!selected.transitions.length">锁定前历史批次，流转轨迹待补录。</p><div class="tr" *ngFor="let t of selected.transitions"><span>{{t.at}} {{t.actor}}</span><b>{{t.from}} → {{t.to}}</b></div><p-button label="进入返修闭环" icon="pi pi-wrench" styleClass="w-full" routerLink="/inspections" /></div></aside></div>
      <p-dialog header="生成批量检测计划" [(visible)]="planDialog" [modal]="true" [style]="{width:'560px'}"><div class="dialog-form"><label>检测方法</label><select><option>UT 超声检测</option><option>MT 磁粉检测</option><option>UT + MT</option></select><label>计划日期</label><input type="date" value="2026-10-03" /><label>检测人员</label><select><option>陈锋</option><option>赵岚</option></select><p>新计划先为「待补录」版本依据，需经审核签字才纳入放行版本；若当前已有锁定，将立即作废原锁定。</p></div><ng-template #footer><p-button label="取消" severity="secondary" (onClick)="planDialog = false" /><p-button label="生成计划" (onClick)="createPlan()" /></ng-template></p-dialog>
    </main>
  `,
  styles:[`.map-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(310px,.65fr);gap:16px}.drawing-card{padding:0;overflow:hidden}.drawing-head{display:flex;justify-content:space-between;padding:13px 16px;background:#f8fafc;border-bottom:1px solid #e1e7ef;color:#64748b;font-size:13px}.weld-map{width:100%;height:min(68vh,680px);display:block;background:#fff}.weld-map circle{cursor:pointer}.label{font-size:2.4px;font-weight:700;fill:#334155}.axis{font-size:2.2px;fill:#94a3b8}.banner{display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:8px;margin-bottom:14px;font-size:13.5px;border:1px solid;background:#eff6ff;border-color:#93c5fd;color:#1d4ed8}.detail-head{display:flex;justify-content:space-between}.detail-head small{color:#7a8798}.detail-head h3{margin:5px 0}.kv{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #edf0f5}.kv span{color:#667085}.kv .pending{color:#b45309}.defect{margin-top:10px;padding:10px;background:#fff1f2;border-left:3px solid #ef4444;border-radius:5px}.defect.closed{background:#f1f5f9;border-left-color:#94a3b8}.defect p{margin:4px 0;font-size:13px}.defect small{color:#7a8798;font-size:11.5px}.tr{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #edf0f5;font-size:13px}.tr span{color:#7a8798}.dialog-form{display:grid;gap:8px}.dialog-form input,.dialog-form select{padding:9px;border:1px solid #cbd5e1;border-radius:6px}.muted{color:#7a8798;font-size:12.5px}.detail h3{font-size:14px;margin:14px 0 6px}`],
})
export class WeldMapComponent {
  readonly store = inject(Store<{ welds: WeldState }>)
  state!: WeldState
  planDialog = false
  constructor() { this.store.select('welds').subscribe((state) => this.state = state) }
  get selected() { return this.state?.welds.find((item) => item.id === this.state.selectedId) }
  get active() { return selectActiveRelease(this.state) }
  select(weld: Weld) { this.store.dispatch(A.selectWeld({ id: weld.id })) }
  color(weld: Weld) { return weld.status === '合格' || weld.status === '已关闭' ? '#16a34a' : weld.status === '返修中' || !weld.qualificationValid ? '#dc2626' : weld.status === '待复检' ? '#7c3aed' : '#f59e0b' }
  createPlan() {
    this.store.dispatch(A.addPlan({
      plan: {
        id: `IP-${Date.now().toString().slice(-6)}`, date: '2026-10-03', method: 'UT + MT',
        weldIds: ['W-105', 'W-106', 'W-108'], inspector: '陈锋', state: '待执行',
        basis: '待补录', createdAt: nowTime(), history: [],
      },
    }))
    this.planDialog = false
  }
}
