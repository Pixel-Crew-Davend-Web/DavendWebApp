import { Component } from '@angular/core';
import { Router } from '@angular/router';  // only if you want real navigation

type OrderStatus = 'Pending' | 'Completed' | 'Cancelled';

interface Order {
  id: string;
  customerName: string;
  email: string;
  phone: string;
  items: string;
  date: string;     // YYYY-MM-DD
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
export class AdminOrdersComponent {
  constructor(private router: Router) {}

  // toast
  toastMsg = '';
  toastType: 'success' | 'error' | '' = '';
  toastTimer: any;

  // filters
  searchTerm = '';
  filterStatus: 'All' | OrderStatus = 'All';
  sortNewestFirst = true;

  // demo orders
  orders: Order[] = [
    { id: '1001', customerName: 'John Doe',   email: 'john@example.com',  phone: '416-555-0001', items: 'Die Springs x2',           date: '2025-09-12', status: 'Pending',   notes: 'rush order', history: [] },
    { id: '1002', customerName: 'Jane Smith', email: 'jane@example.com',  phone: '416-555-0002', items: 'Ejector Pins x5',          date: '2025-09-10', status: 'Completed', history: [] },
    { id: '1003', customerName: 'Mike Brown', email: 'mike@example.com',  phone: '416-555-0003', items: 'Punch Guides x1',          date: '2025-09-08', status: 'Cancelled', notes: 'customer cancel', history: [] },
    { id: '1004', customerName: 'Amira Khan', email: 'amira@example.com', phone: '905-555-1004', items: 'Guide Pins and Bushings',  date: '2025-09-14', status: 'Pending',   history: [] },
    { id: '1005', customerName: 'Leo Chen',   email: 'leo@example.com',   phone: '647-555-1005', items: 'Die Buttons x3',           date: '2025-09-13', status: 'Completed', history: [] },
    { id: '1006', customerName: 'Sara Ali',   email: 'sara@example.com',  phone: '437-555-1006', items: 'Surface Grinding Service', date: '2025-09-11', status: 'Pending',   history: [] },
    { id: '1007', customerName: 'Owen King',  email: 'owen@example.com',  phone: '416-555-1007', items: 'Centerless Grinding',      date: '2025-09-09', status: 'Completed', history: [] },
    { id: '1008', customerName: 'Priya Patel',email:'priya@example.com',  phone: '905-555-1008', items: 'Punch + Die Set',          date: '2025-09-07', status: 'Cancelled', history: [] },
    { id: '1009', customerName: 'Yusuf Idris',email:'yusuf@example.com',  phone: '289-555-1009', items: 'Custom Bushing',           date: '2025-09-06', status: 'Pending',   history: [] },
    { id: '1010', customerName: 'Hannah Lee', email:'hannah@example.com', phone: '416-555-1010', items: 'Ejector Pins x12',         date: '2025-09-05', status: 'Completed', history: [] },
  ];

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
        o.items.toLowerCase().includes(q)
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

  // export CSV
  downloadCSV() {
    const header = ['ID','Customer','Email','Phone','Items','Date','Status','Notes'];
    const rows = this.filteredOrders.map(o => [
      o.id, o.customerName, o.email, o.phone, o.items, o.date, o.status, o.notes ?? ''
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
    // Replace with actual route in your app
    this.router.navigate(['/']);
  }

  logout() {
    // Replace with real logout logic
    this.showToast('You have been logged out', 'success');
    this.router.navigate(['/login']);
  }
}
