import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ConfirmOptions, ConfirmState } from './confirm.model';

@Injectable({
  providedIn: 'root'
})
export class ConfirmService {
  private state$ = new BehaviorSubject<ConfirmState | null>(null);
  private resolver: ((val: boolean) => void) | null = null;

  stream = this.state$.asObservable();

  confirm(options: ConfirmOptions): Promise<boolean> {
    // close any prior dialog
    this.close(false, true);

    const state: ConfirmState = {
      title: options.title ?? 'Please confirm',
      message: options.message,
      okText: options.okText ?? 'OK',
      cancelText: options.cancelText ?? 'Cancel',
      kind: options.kind ?? 'default',
      visible: true
    };

    this.state$.next(state);

    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
    });
  }

  ok() {
    this.close(true);
  }

  cancel() {
    this.close(false);
  }

  private close(result: boolean, silent = false) {
    const current = this.state$.value;
    if (current?.visible) {
      // small fade-out window (optional)
      this.state$.next({ ...current, visible: false });
      setTimeout(() => this.state$.next(null), 140);
    } else {
      this.state$.next(null);
    }

    if (!silent && this.resolver) {
      const res = this.resolver;
      this.resolver = null;
      res(result);
    }
  }
}
