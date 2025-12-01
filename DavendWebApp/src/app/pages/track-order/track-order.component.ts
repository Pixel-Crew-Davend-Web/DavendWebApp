import { Component } from '@angular/core';
import { SupabaseService } from '../../services/supabase.service';

type OrderStatus = 'Pending' | 'Out for Delivery' | 'Ready for Pickup' | 'Completed' | 'Cancelled';

interface Order {
  id: string;
  customerName: string;
  email: string;
  phone: string;
  items: string;
  date: string;
  status: OrderStatus;
  notes?: string;
  lastUpdated?: string;
}

@Component({
  selector: 'app-track-order',
  templateUrl: './track-order.component.html',
  styleUrls: ['./track-order.component.css']
})
export class TrackOrderComponent {
  searchTerm: string = '';
  result: Order | null = null;
  notFound = false;
  loading = false;

  constructor(private supabase: SupabaseService) {}

  private mapDbStatus(status: string | null | undefined): OrderStatus {
    const s = (status || '').toLowerCase();

    if (s.startsWith('pend')) return 'Pending';
    if (s.startsWith('comp') || s === 'paid') return 'Completed';
    if (s.startsWith('cancel')) return 'Cancelled';

    // If your DB later stores "out_for_delivery" / "ready_for_pickup", you can map them here.
    return 'Pending';
  }

  async checkOrder() {
    const query = this.searchTerm.trim();
    this.result = null;
    this.notFound = false;

    if (!query) return;

    this.loading = true;

    try {
      // Look up by order ID (draft_id in Supabase Orders table)
      const data = await this.supabase.fetchOrderWithItems(query);

      if (!data) {
        this.notFound = true;
        return;
      }

      const { order, items } = data;

      const itemsText =
        Array.isArray(items) && items.length
          ? items
              .map((it: any) => `${it.qty ?? 0} × ${it.name ?? 'Item'}`)
              .join(', ')
          : 'Items not available';

      const created = order.created_at || '';
      const status = this.mapDbStatus(order.status);

      this.result = {
        id: order.draft_id,
        customerName: order.full_name || '',
        email: order.email || '',
        phone: order.phone || '',
        items: itemsText,
        date: created ? created.slice(0, 10) : '',
        status,
        notes: order.message || '',
        lastUpdated: created ? new Date(created).toLocaleString() : undefined,
      };
    } catch (err) {
      console.error('Failed to load order', err);
      this.notFound = true;
    } finally {
      this.loading = false;
    }
  }

  getStatusColor(status: OrderStatus): string {
    switch (status) {
      case 'Pending': return '#f7b500'; 
      case 'Out for Delivery': return '#3498db'; 
      case 'Ready for Pickup': return '#9b59b6'; 
      case 'Completed': return '#2ecc71'; 
      case 'Cancelled': return '#e74c3c'; 
      default: return '#999';
    }
  }

  getProgressPercent(status: OrderStatus): number {
    switch (status) {
      case 'Pending': return 25;
      case 'Out for Delivery': return 75;
      case 'Ready for Pickup': return 85;
      case 'Completed': return 100;
      default: return 0;
    }
  }
}
