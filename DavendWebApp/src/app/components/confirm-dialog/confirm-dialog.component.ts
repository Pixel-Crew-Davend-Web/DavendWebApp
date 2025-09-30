import { Component, OnDestroy, OnInit, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ConfirmService } from '../../services/confirm.service';
import { ConfirmState } from '../../services/confirm.model';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.css']
})
export class ConfirmDialogComponent implements OnInit, OnDestroy {
  private sub?: Subscription;
  state = signal<ConfirmState | null>(null);
  isVisible = computed(() => !!this.state()?.visible);

  constructor(private confirm: ConfirmService) {}

  ngOnInit(): void {
    this.sub = this.confirm.stream.subscribe(s => this.state.set(s));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  onOk()    { this.confirm.ok(); }
  onCancel(){ this.confirm.cancel(); }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (!this.isVisible()) return;
    if (e.key === 'Escape') { e.preventDefault(); this.onCancel(); }
    if (e.key === 'Enter')  { e.preventDefault(); this.onOk(); }
  }

  wrapperClass(kind?: string) {
    return {
      'default': 'dialog',
      'danger': 'dialog danger',
      'warning': 'dialog warning'
    }[kind ?? 'default'];
  }
}
