import { Component, inject } from '@angular/core'
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router'
import { Store } from '@ngrx/store'
import { ButtonModule } from 'primeng/button'
import { TagModule } from 'primeng/tag'
import { WeldState, releaseStatusOf } from './store/weld.reducer'

@Component({
  selector: 'app-root', standalone: true, imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonModule, TagModule],
  template: `
    <header class="topbar"><div class="brand"><span>焊</span><div><b>钢结构焊缝质量平台</b><small>WELD & NDT CONTROL</small></div></div><nav><a routerLink="/overview" routerLinkActive="active">台账总览</a><a routerLink="/map" routerLinkActive="active">构件定位</a><a routerLink="/inspections" routerLinkActive="active">检测返修</a><a routerLink="/approvals" routerLinkActive="active">审核锁定</a></nav><span class="spacer"></span>
      <p-tag [value]="release.label" [severity]="release.severity" [icon]="release.icon" />
      <p-tag value="项目：东海会展中心" severity="success" /><p-button label="新建检测计划" icon="pi pi-plus" /></header>
    <router-outlet />
  `,
  styles: [`
    .topbar{height:68px;background:#0f172a;color:#fff;display:flex;align-items:center;gap:14px;padding:0 22px;position:sticky;top:0;z-index:50}.brand{display:flex;gap:10px;align-items:center;min-width:265px}.brand>span{display:grid;place-items:center;width:36px;height:36px;border-radius:7px;background:#2563eb;font-weight:900}.brand b,.brand small{display:block}.brand small{font-size:9px;color:#8290a7;letter-spacing:1px}nav{display:flex;gap:3px}nav a{color:#cbd5e1;text-decoration:none;padding:10px 12px;border-radius:6px;font-size:14px}nav a.active{background:#1e293b;color:#fff}.spacer{flex:1}
    @media(max-width:950px){.topbar{height:auto;min-height:64px;padding:10px;flex-wrap:wrap}.brand{min-width:210px}nav{order:3;width:100%;overflow:auto}.topbar p-tag{display:none}}
  `],
})
export class AppComponent {
  private readonly store = inject(Store<{ welds: WeldState }>)
  state!: WeldState
  constructor() { this.store.select('welds').subscribe((state) => this.state = state) }
  get release() {
    const status = releaseStatusOf(this.state ?? { welds: [], plans: [], baselines: [], signatures: [], selectedId: '', statusFilter: '全部', version: 1, audit: [] })
    const map: Record<string, { label: string; severity: 'success' | 'warn' | 'danger' | 'info'; icon: string }> = {
      待补录: { label: '待补录', severity: 'warn', icon: 'pi pi-database' },
      未锁定: { label: '未锁定', severity: 'info', icon: 'pi pi-lock-open' },
      已锁定: { label: '已锁定', severity: 'success', icon: 'pi pi-lock' },
      已失效: { label: '已失效', severity: 'danger', icon: 'pi pi-exclamation-triangle' },
    }
    return { status, ...map[status] }
  }
}
