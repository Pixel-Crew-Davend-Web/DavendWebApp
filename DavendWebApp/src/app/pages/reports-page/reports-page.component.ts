import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  SupabaseService,
  ReportParams,
  ReportType,
  GroupBy,
} from '../../services/supabase.service';
import { AdminAuthService } from '../../services/admin-auth.service';
import { PopupService } from '../../services/popup.service';
import { Router } from '@angular/router';
import { ConfirmService } from '../../services/confirm.service';

type ReportRow = {
  base: string;
  csv: { name: string; signedUrl?: string | null } | null;
  pdf: { name: string; signedUrl?: string | null } | null;
};

@Component({
  selector: 'app-reports',
  templateUrl: './reports-page.component.html', // your HTML
  styleUrls: ['./reports-page.component.css'], // your CSS (style like Inventory page)
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsComponent implements OnInit {
  form!: FormGroup;

  // UI state
  loadingGenerate = false;
  loadingList = false;
  deleting: Record<string, boolean> = {};
  hasGeneratedThisSession = false;

  // Table data
  rows: ReportRow[] = [];
  displayedColumns = ['name', 'actions']; // keep simple; expand in HTML

  // Option lists
  typeOptions: { label: string; value: ReportType }[] = [
    { label: 'By Orders', value: 'byOrders' },
    { label: 'By Products', value: 'byProducts' },
  ];

  ordersGroupByOptions: { label: string; value: GroupBy }[] = [
    { label: 'Day', value: 'day' },
    { label: 'Customer Name', value: 'name' },
    { label: 'Email', value: 'email' },
    { label: 'Status', value: 'status' },
    { label: 'Payment Method', value: 'method' },
  ];

  productsGroupByOptions: { label: string; value: GroupBy }[] = [
    { label: 'Name (1 row per product)', value: 'name' },
    { label: 'Active (true/false)', value: 'active' },
  ];

  get groupByOptions() {
    return this.form?.value?.type === 'byProducts'
      ? this.productsGroupByOptions
      : this.ordersGroupByOptions;
  }

  constructor(
    private fb: FormBuilder,
    private reports: SupabaseService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    private popup: PopupService,
    private confirm: ConfirmService,
    private adminAuthService: AdminAuthService,
    private router: Router
  ) {}

  async ngOnInit() {
    this.isAdminTokenValid();
    this.form = this.fb.group({
      type: ['byOrders' as ReportType, Validators.required],
      from: [this.defaultFromDateISO(), Validators.required],
      to: [this.defaultToDateISO(), Validators.required],
      groupBy: ['day' as GroupBy, Validators.required],
    });

    // If type changes, this makes sure a valid groupBy is selected for that type
    // Create Helpers
    this.form.get('type')!.valueChanges.subscribe((val: ReportType) => {
      const gbCtrl = this.form.get('groupBy')!;
      if (val === 'byProducts') {
        if (!['name', 'active'].includes(gbCtrl.value)) {
          gbCtrl.setValue('name');
        }
      } else {
        if (
          !['day', 'name', 'email', 'status', 'method'].includes(gbCtrl.value)
        ) {
          gbCtrl.setValue('day');
        }
      }
    });

    this.refreshList();
  }

  async onGenerate() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { type, from, to, groupBy } = this.form.value;

    // Convert string dates (yyyy-mm-dd) to Date objects for supabase query
    const params: ReportParams = {
      type,
      from: this.asDate(from),
      to: this.asDate(to, true),
      groupBy,
    };

    this.loadingGenerate = true;
    this.cdr.markForCheck();

    try {
      await this.reports.generateAndStoreReport(params);
      this.zone.run(() => {
        this.hasGeneratedThisSession = true;
        this.cdr.markForCheck();
      });
      await this.refreshList();
      // Include pop-up here for success
    } catch (err: any) {
      console.error(err);
      // Include pop-up here for error
      this.popup.error(err?.message || 'Failed to generate report.');
    } finally {
      this.zone.run(() => {
        this.loadingGenerate = false;
        this.cdr.markForCheck();
      });
    }
  }

  async refreshList() {
    // Timeout in case database is unreachable/accidental loops
    const withTimeout = <T>(p: Promise<T>, ms = 15000) =>
      Promise.race([
        p,
        new Promise<T>((_, r) =>
          setTimeout(() => r(new Error('Timed out')), ms)
        ),
      ]);

    this.loadingList = true;
    this.cdr.markForCheck();

    try {
      const data = await withTimeout(this.reports.listReports(200));
      this.zone.run(() => {
        this.rows = data;
        this.cdr.markForCheck();
      });
    } catch (err: any) {
      console.error(err);
      // Include pop-up here for error
      this.zone.run(() => {
        this.rows = [];
        this.popup.error(err?.message || 'Failed to load reports.');
        this.cdr.markForCheck();
      });
    } finally {
      this.zone.run(() => {
        this.loadingList = false;
        this.cdr.markForCheck();
      });
    }
  }

  async onView(row: ReportRow, which: 'csv' | 'pdf') {
    const file = which === 'csv' ? row.csv : row.pdf;
    if (!file) return;

    // Get a fresh signed URL
    try {
      const url = await this.reports.getSignedUrl(file.name, 60 * 15);
      window.open(url, '_blank');
    } catch (err: any) {
      console.error(err);
      this.popup.error(err?.message || 'Could not open file.');
    }
  }

  async onDownload(row: ReportRow, which: 'csv' | 'pdf') {
    const file = which === 'csv' ? row.csv : row.pdf;
    if (!file) return;

    try {
      const url = await this.reports.getSignedUrl(file.name, 60 * 15);
      // Force download by creating an anchor
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name.split('/').pop() || file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      console.error(err);
      this.popup.error(err?.message || 'Could not download file.');
    }
  }

  async onDelete(row: ReportRow) {
    const base = row.base;
    // const confirmMsg = `Delete report "${base}" (CSV and PDF)?`;
    // if (!confirm(confirmMsg)) return; // Include pop-up here for confirmation
    const ok = await this.confirm.confirm({
      kind: 'danger',
      title: `Delete report "${base}" (CSV and PDF)?`,
      message: 'This action cannot be undone.',
      okText: 'Delete',
      cancelText: 'Cancel',
    });

    if (ok) {
      this.deleting[base] = true;
      try {
        await this.reports.deleteReportByBaseName(base);
        await this.refreshList();
        // Include pop-up here for success
      } catch (err: any) {
        // Include pop-up here for error
        console.error(err);
        this.popup.error(err?.message || 'Failed to delete report.');
      } finally {
        this.deleting[base] = false;
      }

      this.popup.info('Report deleted.');
    }
  }

  /* =======================
   * Helpers
   * ======================= */

  get isEmpty(): boolean {
    return !this.loadingList && this.rows.length === 0;
  }

  get isGenerating(): boolean {
    return this.loadingGenerate;
  }

  // Defaults: last 30 days
  private defaultFromDateISO(): string {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return this.toISODate(d);
    // yyyy-mm-dd
  }

  private defaultToDateISO(): string {
    return this.toISODate(new Date());
  }

  private toISODate(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private asDate(value: string | Date, endOfDay = false): Date {
    if (value instanceof Date) {
      return value;
    }
    const [y, m, d] = value.split('-').map((n: string) => parseInt(n, 10));
    const date = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
    if (endOfDay) {
      date.setHours(23, 59, 59, 999);
    }
    return date;
  }

  private async isAdminTokenValid(): Promise<void> {
    const adminEmail = localStorage.getItem('email');
    if (!adminEmail) {
      this.adminAuthService.logoutAdmin();
      this.router.navigate(['/login']);
      return;
    }
    const adminID = await this.adminAuthService.getAdminIDByEmail(adminEmail);
    const localToken = localStorage.getItem('adminToken');
    const valid = await this.adminAuthService.isAdminTokenValid(
      adminID,
      localToken || undefined
    );
    if (!valid) {
      this.popup.error('Session expired. Please log in again.');
      this.adminAuthService.logoutAdmin();
      this.router.navigate(['/login']);
    }

    this.popup.info('Admin Session valid!'); // Remove later
  }
}
