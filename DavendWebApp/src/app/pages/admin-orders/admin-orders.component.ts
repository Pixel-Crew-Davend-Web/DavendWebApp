import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AdminAuthService } from '../../services/admin-auth.service';
import { PopupService } from '../../services/popup.service';
import { SupabaseService, DbOrder } from '../../services/supabase.service';

type OrderStatus = 'Pending' | 'Completed' | 'Cancelled';

interface Order {
  id: string;
  customerName: string;
  email: string;
  phone: string;
  items: string;
  method?: string;           // e.g. card, e-transfer, etc.
  date: string;              // YYYY-MM-DD
  status: OrderStatus;
  notes?: string;
  history: string[];
  _editing?: boolean;
  _pendingStatus?: OrderStatus;
}

@Component({
  selector: 'app-admin-orders',
  templateUrl: './admin-orders.component.html',
  styleUrls: ['./admin-orders.component.css']
})
export class AdminOrdersComponent implements OnInit {
  constructor(
    private router: Router,
    private adminAuthService: AdminAuthService,
    private popup: PopupService,
    private supabase: SupabaseService
  ) {}

  ngOnInit() {
    this.validateSession();
    this.loadOrders();
  }

  // toast
  toastMsg = '';
  toastType: 'success' | 'error' | '' = '';
  toastTimer: any;

  loading = false;
  errorMsg = '';

  // filters
  searchTerm = '';
  filterStatus: 'All' | OrderStatus = 'All';
  sortNewestFirst = true;

  // orders now come from Supabase
  orders: Order[] = [];

  private mapDbStatus(status: string | null | undefined): OrderStatus {
    const s = (status || '').toLowerCase();

    if (s.startsWith('pend')) return 'Pending';
    if (s.startsWith('comp') || s === 'paid') return 'Completed';
    if (s.startsWith('cancel')) return 'Cancelled';

    return 'Pending';
  }

  async loadOrders() {
    this.loading = true;
    this.errorMsg = '';

    try {
      const data = await this.supabase.fetchAllOrders();

      this.orders = (data || []).map((o: DbOrder) => ({
        id: o.draft_id,
        customerName: o.name || '',
        email: o.email || '',
        phone: o.phone || '',
        // can enhance later to show actual items summary
        items: 'See order items',
        method: o.method || '—',
        date: (o.created_at || '').slice(0, 10),
        status: this.mapDbStatus(o.status),
        notes: o.message || '',
        history: [],
      }));
    } catch (err) {
      console.error('Failed to load orders', err);
      this.errorMsg = 'Could not load orders. Please try again.';
      this.showToast('Failed to load orders', 'error');
    } finally {
      this.loading = false;
    }
  }

  async validateSession() {
    const email = localStorage.getItem('email');
    if (!email) {
      this.router.navigate(['/login']);
      return;
    }

    const adminID = await this.adminAuthService.getAdminIDByEmail(email);
    const localToken = localStorage.getItem('adminToken');
    const valid = await this.adminAuthService.isAdminTokenValid(adminID, localToken || undefined);

    if (!valid) {
      this.popup.error('Session expired. Please log in again.');
      this.adminAuthService.logoutAdmin();
      this.router.navigate(['/login']);
    }

    this.popup.info('Admin Session valid!'); // Remove later
  }

  // filtered + sorted
  get filteredOrders(): Order[] {
    let list = [...this.orders];

    if (this.filterStatus !== 'All') {
      list = list.filter(o => o.status === this.filterStatus);
    }

    const q = this.searchTerm.trim().toLowerCase();
    if (q) {
      list = list.filter(o =>
        o.id.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.items.toLowerCase().includes(q) ||
        (o.method || '').toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      return this.sortNewestFirst ? -cmp : cmp;
    });

    return list;
  }

  // status badge classes
  statusClass(s: OrderStatus) {
    return {
      badge: true,
      pending: s === 'Pending',
      completed: s === 'Completed',
      cancelled: s === 'Cancelled'
    };
  }

  // toast
  showToast(msg: string, type: 'success' | 'error' = 'success') {
    clearTimeout(this.toastTimer);
    this.toastMsg = msg;
    this.toastType = type;
    this.toastTimer = setTimeout(() => {
      this.toastMsg = '';
      this.toastType = '';
    }, 2500);
  }

  // row actions
  beginEdit(o: Order) {
    o._editing = true;
    o._pendingStatus = o.status;
  }

  cancelEdit(o: Order) {
    o._editing = false;
    o._pendingStatus = undefined;
  }

  saveEdit(o: Order) {
    if (!o._editing || o._pendingStatus === undefined) return;
    const old = o.status;
    const next = o._pendingStatus;

    if (old !== next) {
      o.status = next;
      const timestamp = new Date().toLocaleString();
      o.history.push(`Status changed from ${old} to ${next} on ${timestamp}`);
      this.showToast(`Order ${o.id} updated to ${next}`, 'success');
    }

    o._editing = false;
    o._pendingStatus = undefined;
  }

  // modal
  selected: Order | null = null;
  openDetails(o: Order) { this.selected = o; }
  closeDetails() { this.selected = null; }

  // export CSV – include Method + Notes
  downloadCSV() {
    const header = ['ID','Customer','Email','Phone','Items','Method','Date','Status','Notes'];
    const rows = this.filteredOrders.map(o => [
      o.id,
      o.customerName,
      o.email,
      o.phone,
      o.items,
      o.method ?? '',
      o.date,
      o.status,
      o.notes ?? ''
    ]);
    const csv = [header, ...rows].map(r =>
      r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // navigation buttons
  goHome() {
    this.router.navigate(['/']);
  }

  logout() {
    this.showToast('You have been logged out', 'success');
    this.router.navigate(['/login']);
  }
}
