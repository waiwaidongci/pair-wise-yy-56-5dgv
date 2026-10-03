import { Component, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Store } from '@ngrx/store'
import { ButtonModule } from 'primeng/button'
import { TimelineModule } from 'primeng/timeline'
import { TagModule } from 'primeng/tag'
import { WeldState, releaseStatusOf } from '../store/weld.reducer'
import * as A from '../store/weld.actions'

interface ReleaseView {
  status: string
  label: string
  severity: 'success' | 'warn' | 'danger' | 'info'
  tone: string
  title: string
  desc: string
}

@Component({
  selector: 'app-approvals', standalone: true, imports: [CommonModule, ButtonModule, TimelineModule, TagModule],
  template: `
    <main class="page">
      <div class="page-head">
        <div>
          <p class="eyebrow">签字、版本与追溯</p>
          <h1>逐段确认与锁定</h1>
          <p>焊缝台账、检测计划与审核锁定按版本放行：两名审核人同时提交签字时先到先得；任一计划内容、缺陷或返修状态变更，原锁定立即失效，重新确认前不得导出追溯包。</p>
        </div>
        <div class="head-actions">
          <p-tag [value]="release.label" [severity]="release.severity" />
          <p-button label="导出质量追溯包" icon="pi pi-file-export" severity="secondary" [disabled]="release.status !== '已锁定'" (onClick)="export()" />
        </div>
      </div>

      <div class="banner" [class]="release.tone">
        <i class="pi" [class.pi-info-circle]="release.status==='未锁定' || release.status==='待补录'" [class.pi-exclamation-triangle]="release.status==='已失效'" [class.pi-check-circle]="release.status==='已锁定'"></i>
        <div class="banner-body">
          <b>{{release.title}}</b>
          <p>{{release.desc}}</p>
        </div>
        <p-button *ngIf="release.status==='待补录'" label="补录版本依据" icon="pi pi-database" (onClick)="supplement()" />
      </div>

      <div class="grid-2">
        <section class="card">
          <h2 class="panel-title">待审核焊缝</h2>
          <div class="review" *ngFor="let weld of reviewWelds">
            <div><b>{{weld.id}} · {{weld.component}}</b><small>{{weld.method}} · {{weld.welder}} · 返修 {{weld.repairs}} 次 · v{{weld.version}}<span *ngIf="weld.legacy" class="legacy"> · 待补录</span></small></div>
            <p-tag [value]="weld.status" [severity]="weld.status === '待复检' ? 'warn' : 'danger'" />
            <p-button label="要求复检" severity="danger" text size="small" (onClick)="recheck(weld.id)" />
            <p-button label="确认合格" size="small" (onClick)="confirm(weld.id)" />
          </div>
          <p class="muted" *ngIf="!reviewWelds.length">当前无待审核焊缝。</p>
        </section>

        <aside class="card">
          <h2 class="panel-title">两名审核人同时签字</h2>
          <p class="muted">签字携带当前内容版本 v{{state.version}} 提交。两人同时提交时仅先到一笔通过，另一笔保留冲突现场；内容已变更则需重新确认。</p>
          <div class="sign-row">
            <p-button label="赵岚 签字" icon="pi pi-pencil" (onClick)="sign('赵岚')" [disabled]="release.status==='待补录'" />
            <p-button label="陈锋 签字" icon="pi pi-pencil" severity="secondary" (onClick)="sign('陈锋')" [disabled]="release.status==='待补录'" />
          </div>
          <p-button label="模拟两人同时提交签字" icon="pi pi-users" styleClass="w-full mt-2" (onClick)="signBoth()" [disabled]="release.status==='待补录'" />

          <h3 class="panel-title mt-3">签字记录（含冲突现场）</h3>
          <div class="sig" *ngFor="let s of state.signatures" [class.conflict]="s.result==='冲突'">
            <div><b>{{s.actor}}</b><span>{{s.time}} · 基于 v{{s.basedOnVersion}}</span></div>
            <p-tag [value]="s.result" [severity]="s.result==='通过' ? 'success' : 'danger'" />
            <p *ngIf="s.result==='冲突'" class="reason"><i class="pi pi-exclamation-triangle"></i> {{s.reason}}</p>
          </div>
          <p class="muted" *ngIf="!state.signatures.length">尚未提交签字。</p>
        </aside>
      </div>

      <section class="card mt-4">
        <h2 class="panel-title">版本快照与锁定基线</h2>
        <div class="snapshot" *ngFor="let b of state.baselines" [class.void]="b.status==='已失效'">
          <div><b>v{{b.version}}</b><small>基线 {{b.id}} · {{b.lockedAt}} · 指纹 {{b.contentHash}}</small></div>
          <p-tag [value]="b.status" [severity]="b.status==='有效' ? 'success' : 'danger'" />
          <small class="signers">签字：{{b.signers.join('、') || '—'}}</small>
        </div>
        <p class="muted" *ngIf="!state.baselines.length">尚未生成锁定基线。签字后在此保留只读版本快照；内容变更后旧基线标记失效，需重新签字派生新版本。</p>
      </section>

      <section class="card mt-4">
        <h2 class="panel-title">完整审计时间线</h2>
        <p-timeline [value]="state.audit" align="left">
          <ng-template #content let-event>
            <div class="audit"><div><b>{{event.actor}} · {{event.action}}</b><span>{{event.time}}</span></div><p><strong>{{event.target}}</strong> {{event.detail}}</p></div>
          </ng-template>
        </p-timeline>
      </section>
    </main>
  `,
  styles: [`
    .head-actions{display:flex;gap:10px;align-items:center}
    .banner{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-radius:8px;margin-bottom:16px;border:1px solid #e1e7ef}
    .banner>i{font-size:20px;margin-top:2px}
    .banner-body{flex:1}.banner-body b{font-size:15px}.banner-body p{margin:3px 0 0;font-size:13px;color:#475467}
    .banner.tone-ok{background:#ecfdf3;border-color:#abefc6}.banner.tone-ok>i{color:#15803d}
    .banner.tone-bad{background:#fef3f2;border-color:#fda29b}.banner.tone-bad>i{color:#dc2626}
    .banner.tone-warn{background:#fffaeb;border-color:#fedf89}.banner.tone-warn>i{color:#d97706}
    .banner.tone-info{background:#eff8ff;border-color:#b2ddff}.banner.tone-info>i{color:#2563eb}
    .review{display:grid;grid-template-columns:1fr auto auto auto;gap:8px;align-items:center;padding:12px 0;border-bottom:1px solid #edf0f5}
    .review b,.review small{display:block}.review small{color:#7a8798;margin-top:4px}.review .legacy{color:#d97706}
    .sign-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.mt-2{margin-top:8px}.mt-3{margin-top:16px}
    .sig{display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center;padding:10px;border:1px solid #e1e7ef;border-radius:6px;margin-bottom:8px}
    .sig.conflict{background:#fef3f2;border-color:#fda29b}.sig b,.sig span{display:block}.sig span{color:#7a8798;font-size:12px}
    .sig .reason{grid-column:1/-1;margin:0;font-size:12px;color:#b42318}.sig .reason i{margin-right:4px}
    .snapshot{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:12px;background:#f8fafc;border-radius:6px;margin-bottom:8px}
    .snapshot.void{opacity:.6}.snapshot b,.snapshot small{display:block}.snapshot small{color:#7a8798;margin-top:4px}.signers{color:#475467;font-size:12px}
    .audit{background:#fff;border:1px solid #e1e7ef;border-radius:6px;padding:10px}.audit>div{display:flex;justify-content:space-between}.audit span{color:#7a8798;font-size:12px}.audit p{margin:5px 0 0;font-size:13px}
    .muted{color:#7a8798;font-size:13px}
    @media(max-width:760px){.review{grid-template-columns:1fr auto}.review .p-button{width:100%}.head-actions{flex-wrap:wrap}}
  `],
})
export class ApprovalsComponent {
  private readonly store = inject(Store<{ welds: WeldState }>)
  state!: WeldState
  constructor() { this.store.select('welds').subscribe((state) => this.state = state) }

  get release(): ReleaseView {
    const status = releaseStatusOf(this.state)
    const map: Record<string, Omit<ReleaseView, 'status'>> = {
      待补录: { label: '待补录', severity: 'warn', tone: 'tone-warn', title: '旧批次无版本依据，已转为待补录', desc: '原焊缝检测结果继续可查；请先补录版本依据，再进入签字锁定与追溯包导出。' },
      未锁定: { label: '未锁定', severity: 'info', tone: 'tone-info', title: '当前版本未锁定', desc: '内容变更后需两名审核人签字锁定；锁定只对当前版本与内容指纹负责。' },
      已锁定: { label: '已锁定', severity: 'success', tone: 'tone-ok', title: `v${this.state.version} 已签字锁定`, desc: '版本基线有效，质量追溯包可导出。此后追加复检 / 更正将生成新修订并使原锁定失效，需重新确认。' },
      已失效: { label: '已失效', severity: 'danger', tone: 'tone-bad', title: '原锁定已失效', desc: '计划内容、缺陷或返修状态已变更，请重新签字确认；重新确认前不得导出追溯包。' },
    }
    return { status, ...map[status] }
  }

  get reviewWelds() { return (this.state?.welds ?? []).filter((item) => ['待复检', '返修中', '待检测'].includes(item.status)) }

  confirm(id: string) { this.store.dispatch(A.appendInspection({ weldId: id, recordType: '复检', result: '复检合格，确认关闭', toStatus: '合格' })) }
  recheck(id: string) { this.store.dispatch(A.appendInspection({ weldId: id, recordType: '复检', result: '要求复检，待复检结果', toStatus: '待复检' })) }
  sign(actor: string) { this.store.dispatch(A.signLock({ actor, basedOnVersion: this.state.version })) }
  signBoth() {
    const v = this.state.version
    this.store.dispatch(A.signLock({ actor: '赵岚', basedOnVersion: v }))
    this.store.dispatch(A.signLock({ actor: '陈锋', basedOnVersion: v }))
  }
  supplement() { this.store.dispatch(A.supplementBasis()) }
  export() { this.store.dispatch(A.exportPackage()) }
}
