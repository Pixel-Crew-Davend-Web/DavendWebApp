export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface PopupConfig {
  type: NotificationType;
  message: string;
  // optional
  title?: string;
  autoCloseMs?: number;   // e.g., 2500
  dismissible?: boolean;  // show × button
}

export interface PopupState extends PopupConfig {
  visible: boolean;
}