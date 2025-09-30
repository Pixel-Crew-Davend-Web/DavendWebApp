import { Component, computed, signal, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { PopupService } from '../../services/popup.service';
import { PopupState } from '../../services/notification.model';

@Component({
  selector: 'app-popup-notification',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './popup-notification.component.html',
  styleUrls: ['./popup-notification.component.css']
})

export class PopupNotificationComponent implements OnInit, OnDestroy {
  private sub?: Subscription;
  state = signal<PopupState | null>(null);
  isVisible = computed(() => !!this.state()?.visible);

  constructor(private popup: PopupService) {}

  ngOnInit(): void {
    this.sub = this.popup.getStream().subscribe(s => this.state.set(s));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  close() {
    this.popup.close();
  }

  iconPath(type: string): string {
    // basic inline SVG selection; you can swap with your own assets
    switch (type) {
      case 'success': return 'M5 13l4 4L19 7';       // check
      case 'error':   return 'M6 6l12 12M18 6L6 18'; // cross
      case 'info':    return 'M12 8v.01M12 12v4';    // i
      case 'warning': return 'M12 9v4M12 17h.01';    // !
      default:        return 'M5 13l4 4L19 7';
    }
  }

  wrapperClass(type?: string) {
    return {
      'success': 'popup success',
      'error': 'popup error',
      'info': 'popup info',
      'warning': 'popup warning'
    }[type ?? 'success'];
  }
}
