import { Component, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { Store } from '@ngrx/store'
import { ButtonModule } from 'primeng/button'
import { TimelineModule } from 'primeng/timeline'
import { TagModule } from 'primeng/tag'
import { WeldState, selectActiveRelease, selectCurrentHash } from '../store/weld.reducer'
import { shortHash } from '../services/versioning'
import * as A from '../store/weld.actions'

const REVIEWERS = [
  { name: '周正', role: '质量负责人' },
  { name: '高宁', role: '技术负责人' },
]

@Component({
  selector:'app-approvals', standalone:true, imports:[CommonModule,FormsModule,ButtonModule,TimelineModule,TagModule],
  template:`
    <main class="page">
      <div class="page-head">
        <div><p class="eyebrow">签字、版本与追溯</p><h1>版本化放行与审核锁定</h1><p>签字即冻结版本快照与内容指纹；计划、缺陷、返修状态任一变化，原锁定立即失效，重新签字前追溯包不可导出。</p></div>
        <p-button [label]="active ? '导出质量追溯包' : '导出已被禁止'" [icon]="active ? 'pi pi-file-export' : 'pi pi-lock'" [severity]="active ? 'success' : 'secondary'" [disabled]="!active" (onClick)="exportPkg()" />
      </div>

      <!-- 全局通知 -->
      <div class="banner" *ngIf="state.notice" [ngClass]="state.notice.tone">
        <i [class]="toneIcon(state.notice.tone)"></i><span>{{state.notice.text}}</span>
        <button class="banner-close" (click)="dismiss()"><i class="pi pi-times"></i></button>
      </div>

      <!-- 锁定状态条：生效 / 已失效 / 待补录 -->
      <section class="card lockbar" *ngIf="active">
        <i class="pi pi-lock-fill locked"></i>
        <div class="lock-main">
          <b>{{active!.label}} 已生效 · {{active!.mode}}</b>
          <small>内容指纹 <code>{{short(active!.basisHash)}}</code> 与当前台账一致 · 签字时间 {{active!.createdAt}} · 冻结 {{active!.snapshot.welds.length}} 条焊缝 / {{active!.snapshot.plans.length}} 个计划</small>
        </div>
        <div class="sigs">
          <span class="sig" *ngFor="let s of active!.signatures"><i class="pi pi-check-circle"></i>{{s.reviewer}}（{{s.role}}）<em>{{s.at}}</em></span>
        </div>
      </section>
      <section class="card lockbar invalid" *ngIf="!active && state.releases.length">
        <i class="pi pi-exclamation-triangle"></i>
        <div class="lock-main">
          <b>原锁定已失效，追溯包暂停放行</b>
          <small *ngIf="lastInvalidation">{{lastInvalidation.releaseLabel}} 于 {{lastInvalidation.at}} 因「{{lastInvalidation.trigger}}（{{lastInvalidation.target}}）」作废：{{lastInvalidation.detail}}。原检测与审批记录均已封存，确认当前内容后重新签字即可形成新版本。</small>
        </div>
      </section>
      <section class="card lockbar pending" *ngIf="!active && !state.releases.length">
        <i class="pi pi-question-circle"></i>
        <div class="lock-main">
          <b>旧批次待补录，尚无版本依据</b>
          <small>载入的焊缝与计划均无版本指纹，已转为「待补录」，原焊缝结果继续可查。由审核人补录签字确认后才生成首个放行版本。</small>
        </div>
      </section>

      <div class="grid-2">
        <section class="card">
          <h2 class="panel-title">提交签字（先到先得 · CAS）</h2>
          <div class="sign-box">
            <label>审核人</label>
            <select [(ngModel)]="signer">
              <option *ngFor="let r of reviewers" [value]="r.name">{{r.name}}（{{r.role}}）</option>
            </select>
            <label>提交基线指纹</label>
            <div class="basis"><code>{{short(hash)}}</code><small>即当前页面看到的全部计划内容、焊缝状态、缺陷与返修记录</small></div>
            <div class="basis-row">
              <p-tag [value]="mode" [severity]="mode === '补录基线' ? 'warn' : 'success'" />
              <p-tag [value]="backfillCount ? backfillCount + ' 条待补录' : '全部已纳入版本'" [severity]="backfillCount ? 'warn' : 'success'" />
            </div>
            <div class="sign-actions">
              <p-button [label]="mode === '补录基线' ? '补录并签字锁定' : '提交签字锁定'" icon="pi pi-sign-in" (onClick)="submit()" />
              <p-button label="模拟两名审核人同时提交" icon="pi pi-bolt" severity="warn" styleClass="w-full" (onClick)="simulateConcurrent()" />
            </div>
            <p class="hint">两人基于同一指纹同时提交时，仅先到一笔写入并生成版本；另一笔原样保留为冲突，不会覆盖或静默成功。</p>
          </div>

          <h2 class="panel-title mt-4">签字冲突现场</h2>
          <div class="conflict" *ngFor="let c of state.conflicts" [class.resolved]="c.rebased">
            <div class="conflict-head">
              <b><i class="pi pi-bolt"></i> {{c.reviewer}} 的签字未通过</b>
              <p-tag [value]="c.rebased ? '已刷新基线' : '待处理'" [severity]="c.rebased ? 'success' : 'danger'" />
            </div>
            <p>{{c.reason}}</p>
            <div class="conflict-meta">
              <span>提交时间 {{c.at}}</span><span>提交指纹 <code>{{short(c.basisHash)}}</code></span>
              <span *ngIf="c.winner.releaseId">先到版本 <code>{{c.winner.releaseId.slice(-6)}}</code></span>
            </div>
            <p-button *ngIf="!c.rebased && active && c.basisHash === active.basisHash" label="刷新基线并在当前版本会签" size="small" (onClick)="rebaseAndCountersign(c)" />
            <p-button *ngIf="!c.rebased" label="仅刷新基线（稍后重新签字）" size="small" severity="secondary" text (onClick)="rebase(c)" />
          </div>
          <p class="muted" *ngIf="!state.conflicts.length">暂无并发冲突。</p>
        </section>

        <aside class="card">
          <h2 class="panel-title">完整审计时间线</h2>
          <p-timeline [value]="state.audit" align="left" styleClass="max-audit">
            <ng-template #content let-event>
              <div class="audit" [class.invalid-audit]="event.action === '锁定失效'"><div><b>{{event.actor}} · {{event.action}}</b><span>{{event.time}}</span></div><p><strong>{{event.target}}</strong> {{event.detail}}</p></div>
            </ng-template>
          </p-timeline>
        </aside>
      </div>

      <section class="card mt-4">
        <h2 class="panel-title">放行版本链（快照不可变）</h2>
        <div class="release" *ngFor="let r of state.releases">
          <div class="release-head">
            <div><b>{{r.label}}</b><small>创建于 {{r.createdAt}} · {{r.mode}} · 指纹 <code>{{short(r.basisHash)}}</code></small></div>
            <p-tag *ngIf="r.id === state.activeReleaseId" value="生效中" severity="success" />
            <p-tag *ngIf="r.supersededBy" value="已作废（记录封存）" severity="danger" />
          </div>
          <div class="release-sigs"><span *ngFor="let s of r.signatures">{{s.reviewer}} {{s.at}}；</span></div>
          <button class="snap-toggle" (click)="toggle(r.id)"><i [class]="expanded === r.id ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"></i> {{expanded === r.id ? '收起版本快照' : '查看版本快照内容'}}</button>
          <div class="snapshot" *ngIf="expanded === r.id">
            <div class="snap-grid">
              <div><b>焊缝结果（{{r.snapshot.welds.length}}）</b>
                <p *ngFor="let w of r.snapshot.welds">{{w.id}} · {{w.status}} · 返修 {{w.repairs}} 次 · 缺陷 {{w.defects.length}} 个<span class="snap-basis" [class.pending-basis]="w.basis === '待补录'">{{w.basis}}</span></p>
              </div>
              <div><b>检测计划（{{r.snapshot.plans.length}}）</b>
                <p *ngFor="let p of r.snapshot.plans">{{p.id}} · {{p.method}} · {{p.state}} · {{p.weldIds.length}} 条焊缝 · {{p.inspector}}</p>
              </div>
            </div>
            <small>该快照为签字当时数据的只读冻结；后续追加的复检、更正与新签字不会改写这里的任何记录。</small>
          </div>
        </div>
      </section>
    </main>
  `,
  styles:[`
    .banner{display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:8px;margin-bottom:14px;font-size:14px;border:1px solid}
    .banner i{font-size:16px}.banner.success{background:#f0fdf4;border-color:#86efac;color:#15803d}
    .banner.info{background:#eff6ff;border-color:#93c5fd;color:#1d4ed8}
    .banner.warn{background:#fffbeb;border-color:#fcd34d;color:#b45309}
    .banner.danger{background:#fef2f2;border-color:#fca5a5;color:#b91c1c}
    .banner-close{margin-left:auto;border:none;background:transparent;cursor:pointer;color:inherit;opacity:.7}
    .lockbar{display:flex;align-items:center;gap:14px;margin-bottom:16px;padding:16px 18px}
    .lockbar>i{font-size:26px}.lockbar.invalid{border-color:#fca5a5;background:#fef2f2}.lockbar.invalid>i{color:#dc2626}
    .lockbar.pending{border-color:#fcd34d;background:#fffbeb}.lockbar.pending>i{color:#d97706}
    .locked{color:#16a34a}.lock-main{flex:1}.lock-main b{display:block;font-size:16px}.lock-main small{display:block;color:#667085;margin-top:4px;font-size:13px;line-height:1.6}
    code{background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:12px;color:#334155}
    .sigs{display:flex;flex-direction:column;gap:6px;align-items:flex-end}.sig{display:inline-flex;align-items:center;gap:5px;background:#f0fdf4;border:1px solid #86efac;color:#15803d;border-radius:20px;padding:4px 12px;font-size:13px;white-space:nowrap}.sig em{font-style:normal;color:#667085;font-size:11px;margin-left:2px}
    .sign-box{display:grid;gap:8px}.sign-box label{font-size:13px;color:#475569;font-weight:600}
    .sign-box select{padding:9px;border:1px solid #cbd5e1;border-radius:6px;width:100%}
    .basis{background:#f8fafc;border:1px solid #e1e7ef;border-radius:6px;padding:9px 11px}.basis small{display:block;color:#7a8798;margin-top:3px;font-size:12px}
    .basis-row{display:flex;gap:8px}.sign-actions{display:grid;gap:8px;margin-top:4px}.hint{font-size:12px;color:#7a8798;line-height:1.6}
    .conflict{border:1px solid #fca5a5;background:#fef2f2;border-radius:8px;padding:12px;margin-bottom:10px}.conflict.resolved{border-color:#86efac;background:#f0fdf4}
    .conflict-head{display:flex;justify-content:space-between;align-items:center}.conflict-head b{font-size:14px}.conflict p{font-size:13px;line-height:1.6;margin:7px 0;color:#57534e}
    .conflict-meta{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:#7a8798;margin-bottom:9px}
    .audit{background:#fff;border:1px solid #e1e7ef;border-radius:6px;padding:10px}.audit.invalid-audit{border-color:#fca5a5;background:#fef2f2}.audit>div{display:flex;justify-content:space-between;gap:8px}.audit span{color:#7a8798;font-size:12px;white-space:nowrap}.audit p{margin:5px 0 0;font-size:13px;line-height:1.6}
    ::ng-deep .max-audit{max-height:560px;overflow:auto}
    .release{border:1px solid #e1e7ef;border-radius:8px;padding:13px;margin-bottom:10px}.release-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
    .release-head b,.release-head small{display:block}.release-head small{color:#7a8798;margin-top:4px;font-size:12px}.release-sigs{font-size:13px;color:#475569;margin:8px 0}
    .snap-toggle{border:none;background:none;color:#2563eb;cursor:pointer;font-size:13px;padding:0}.snapshot{margin-top:10px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:6px;padding:12px}
    .snap-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.snap-grid p{font-size:12.5px;margin:5px 0;color:#475569;display:flex;justify-content:space-between;gap:8px}
    .snapshot>small{color:#7a8798;font-size:12px;margin-top:8px;display:block}.snap-basis{color:#15803d}.pending-basis{color:#b45309}
    .mt-4{margin-top:16px}.muted{color:#7a8798;font-size:13px}
    @media(max-width:760px){.lockbar{flex-direction:column;align-items:flex-start}.sigs{align-items:flex-start}.snap-grid{grid-template-columns:1fr}}
  `],
})
export class ApprovalsComponent {
  private readonly store = inject(Store<{ welds: WeldState }>)
  state!: WeldState
  reviewers = REVIEWERS
  signer = REVIEWERS[0].name
  expanded = ''

  constructor() { this.store.select('welds').subscribe((state) => this.state = state) }

  get active() { return selectActiveRelease(this.state) }
  get hash() { return selectCurrentHash(this.state) }
  get backfillCount() { return this.state.welds.filter((w) => w.basis === '待补录').length + this.state.plans.filter((p) => p.basis === '待补录').length }
  get mode() { return this.backfillCount ? '补录基线' as const : '签字放行' as const }
  get lastInvalidation() { return this.state.invalidations[0] }
  short = shortHash

  toneIcon(tone: string) {
    return tone === 'success' ? 'pi pi-check-circle' : tone === 'danger' ? 'pi pi-ban' : tone === 'warn' ? 'pi pi-exclamation-triangle' : 'pi pi-info-circle'
  }

  private reviewerRole(name: string) { return REVIEWERS.find((r) => r.name === name)?.role ?? '审核人' }

  submit() {
    this.store.dispatch(A.submitSignature({
      reviewer: this.signer, role: this.reviewerRole(this.signer), at: now(),
      reviewerBasisHash: this.hash, mode: this.mode,
    }))
  }

  /** 两名审核人基于完全相同的页面基线同时提交：先到者生成版本，后到者冲突留场 */
  simulateConcurrent() {
    const basis = this.hash
    const at = now()
    this.store.dispatch(A.submitSignature({ reviewer: REVIEWERS[0].name, role: REVIEWERS[0].role, at, reviewerBasisHash: basis, mode: this.mode }))
    this.store.dispatch(A.submitSignature({ reviewer: REVIEWERS[1].name, role: REVIEWERS[1].role, at, reviewerBasisHash: basis, mode: this.mode }))
  }

  rebase(conflict: { id: string; reviewer: string }) {
    this.store.dispatch(A.rebaseSignature({ conflictId: conflict.id, reviewer: conflict.reviewer }))
  }

  /** 冲突现场确认无误后：标记冲突已复核，并以追加会签方式进入生效版本，原签字不动 */
  rebaseAndCountersign(conflict: { id: string; reviewer: string }) {
    this.rebase(conflict)
    this.store.dispatch(A.countersign({ reviewer: conflict.reviewer, role: this.reviewerRole(conflict.reviewer), at: now() }))
  }

  exportPkg() { this.store.dispatch(A.requestExport()) }
  dismiss() { this.store.dispatch(A.dismissNotice()) }
  toggle(id: string) { this.expanded = this.expanded === id ? '' : id }
}

function now(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}
