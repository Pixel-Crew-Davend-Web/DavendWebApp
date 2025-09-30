import { Injectable } from '@angular/core';
import { BehaviorSubject, timer, Subscription } from 'rxjs';
import { PopupConfig, PopupState } from './notification.model';

@Injectable({
  providedIn: 'root'
})
export class PopupService {

  private state$ = new BehaviorSubject<PopupState | null>(null);
  private autoSub?: Subscription;

  getStream() {
    return this.state$.asObservable();
  }

  open(config: PopupConfig) {
    // cancel previous auto-close
    this.autoSub?.unsubscribe();

    const dismissible = config.dismissible ?? true;
    const next: PopupState = {
      title: config.title,
      message: config.message,
      type: config.type,
      autoCloseMs: config.autoCloseMs,
      dismissible,
      visible: true
    };

    this.state$.next(next);

    if (config.autoCloseMs && config.autoCloseMs > 0) {
      this.autoSub = timer(config.autoCloseMs).subscribe(() => this.close());
    }
  }

  close() {
    const current = this.state$.getValue();
    if (!current) {
      return;
    }
    this.state$.next({ ...current, visible: false });
    // give a tiny delay for fade-out in case of animation; then clear
    setTimeout(() => this.state$.next(null), 150);
  }

  // deafault messages
  success(message: string, opts: Partial<PopupConfig> = {}) {
    this.open({ type: 'success', message, autoCloseMs: 2200, ...opts });
  }
  error(message: string, opts: Partial<PopupConfig> = {}) {
    this.open({ type: 'error', message, dismissible: true, ...opts });
  }
  info(message: string, opts: Partial<PopupConfig> = {}) {
    this.open({ type: 'info', message, autoCloseMs: 2200, ...opts });
  }
  warning(message: string, opts: Partial<PopupConfig> = {}) {
    this.open({ type: 'warning', message, dismissible: true, ...opts });
  }

  constructor() { }
}
