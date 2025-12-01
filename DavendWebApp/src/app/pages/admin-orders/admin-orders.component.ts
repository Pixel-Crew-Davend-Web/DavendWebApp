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

  method?: string | null;
  reference?: string | null;

  date: string; // YYYY-MM-DD
  status: OrderStatus;
  notes?: string | null;

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

  orders: Order[] = [];
  selected: Order | null = null;

  ngOnInit() {
    this.validateSession();
    this.loadOrders();
  }

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
  // items: 'See order items',   <-- REMOVE this line
  items: (o as any).items || '', // <-- ADD this
  method: o.method || '',
  reference: o.reference || '',
  date: (o.created_at || '').slice(0, 10),
  status: this.mapDbStatus(o.status),
  notes: o.message || '',
  history: []
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
    const valid = await this.adminAuthService.isAdminTokenValid(
      adminID,
      localToken || undefined
    );

    if (!valid) {
      this.popup.error('Session expired. Please log in again.');
      this.adminAuthService.logoutAdmin();
      this.router.navigate(['/login']);
    }
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
        o.email.toLowerCase().includes(q) ||
        (o.method || '').toLowerCase().includes(q) ||
        (o.reference || '').toLowerCase().includes(q) ||
        (o.notes || '').toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      return this.sortNewestFirst ? -cmp : cmp;
    });

    return list;
  }

  // --- Display helpers ---

  formatMethod(method?: string | null): string {
    if (!method || method === '—') {
      return 'Unknown';
    }

    const m = method.toLowerCase();

    if (m === 'etransfer' || m === 'e-transfer' || m === 'etrans') {
      return 'E-Transfer';
    }
    if (m === 'stripe') return 'Stripe';
    if (m === 'paypal') return 'PayPal';
    if (m === 'cash') return 'Cash';

    return m.charAt(0).toUpperCase() + m.slice(1);
  }

  displayCustomerName(o: Order): string {
    if (o.customerName && o.customerName !== '—') return o.customerName;
    return 'Guest checkout';
  }

  displayNotes(o: Order): string {
    const raw = (o.notes || '').trim();
    if (!raw || raw === '—') return 'No notes';
    if (raw.length <= 40) return raw;
    return raw.slice(0, 37) + '…';
  }

    // Dot-jot style items for the table
  getItemsForDisplay(o: Order): string[] {
    const src = (o.items || '').trim();
    if (!src) return [];

    // Split on comma, semicolon, or new line
    const parts = src
      .split(/[;,\n]/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    // Show up to 3 items in the cell
    return parts.slice(0, 3);
  }


  getSelectedNotesText(): string {
    if (!this.selected || !this.selected.notes) {
      return 'No notes have been added for this order.';
    }

    const n = this.selected.notes.trim();
    if (!n || n === '—') {
      return 'No notes have been added for this order.';
    }

    return n;
  }

  // toast
  showToast(msg: string, type: 'success' | 'error' = 'success') {
    clearTimeout(this.toastTimer);
    this.toastMsg = msg;
    this.toastType = type;
    this.toastTimer = setTimeout(() => {
      this.toastMsg = '';
      this.toastType = '';
    }, 2200);
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
  openDetails(o: Order) {
    this.selected = o;
  }

  closeDetails() {
    this.selected = null;
  }

  // export CSV
  downloadCSV() {
    const header = [
      'ID',
      'Customer',
      'Email',
      'Phone',
      'Method',
      'Reference',
      'Date',
      'Status',
      'Notes'
    ];

    const rows = this.filteredOrders.map(o => [
      o.id,
      o.customerName,
      o.email,
      o.phone,
      o.method ?? '',
      o.reference ?? '',
      o.date,
      o.status,
      o.notes ?? ''
    ]);

    const csv = [header, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // navigation
  goHome() {
    this.router.navigate(['/']);
  }

  logout() {
    this.showToast('You have been logged out', 'success');
    this.router.navigate(['/login']);
  }
}
