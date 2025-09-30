export type ConfirmKind = 'default' | 'danger' | 'warning';

export interface ConfirmOptions {
  title?: string;
  message: string;
  okText?: string;       // default: "OK"
  cancelText?: string;   // default: "Cancel"
  kind?: ConfirmKind;    // default | danger | warning
}

export interface ConfirmState extends Required<ConfirmOptions> {
  visible: boolean;
}
