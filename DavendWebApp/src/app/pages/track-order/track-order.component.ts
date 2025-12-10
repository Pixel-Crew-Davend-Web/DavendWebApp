import { Component } from '@angular/core';
import { SupabaseService, DbOrder, DbOrderItem } from '../../services/supabase.service';

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
  styleUrls: ['./track-order.component.css'],
})
export class TrackOrderComponent {
  searchTerm = '';
  loading = false;
  errorMessage = '';
  hasSearched = false;

  // When a single order is loaded for display
  order: Order | null = null;

  // When searching by email, we may have multiple matching orders
  matchingOrders: DbOrder[] = [];

  constructor(private readonly supabase: SupabaseService) {}

  async checkOrder(): Promise<void> {
    const term = (this.searchTerm || '').trim();
    this.errorMessage = '';
    this.order = null;
    this.matchingOrders = [];
    this.hasSearched = true;

    if (!term) {
      this.errorMessage = 'Please enter an Order ID or email address.';
      return;
    }

    // Detect email vs order ID
    const isEmail = term.includes('@');

    this.loading = true;
    try {
      if (isEmail) {
        await this.handleEmailSearch(term);
      } else {
        await this.loadOrderById(term);
      }
    } catch (err) {
      console.error('Error checking order', err);
      this.errorMessage = 'Something went wrong while checking your order. Please try again.';
    } finally {
      this.loading = false;
    }
  }

  private async handleEmailSearch(email: string): Promise<void> {
    const orders = await this.supabase.fetchOrdersByEmail(email);
    this.matchingOrders = orders ?? [];

    if (!this.matchingOrders.length) {
      this.errorMessage = 'No orders found for that email address.';
      return;
    }

    // If there is only one order for this email, load it directly
    if (this.matchingOrders.length === 1) {
      await this.loadOrderById(this.matchingOrders[0].draft_id);
    }
    // If there are multiple, the template will show a list to choose from
  }

  async loadOrderById(draftId: string): Promise<void> {
    const id = (draftId || '').trim();
    if (!id) {
      this.errorMessage = 'Please enter a valid Order ID.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.order = null;

    try {
      const result = await this.supabase.fetchOrderWithItems(id);
      if (!result) {
        this.errorMessage = 'No order found with that ID.';
        return;
      }

      const { order, items } = result;
      this.order = this.mapOrder(order, items);
    } catch (err) {
      console.error('Error loading order by ID', err);
      this.errorMessage = 'Could not load your order. Please try again.';
    } finally {
      this.loading = false;
    }
  }

  private mapOrder(order: DbOrder, items: DbOrderItem[]): Order {
    const itemSummary =
      items && items.length
        ? items
            .map((item) => {
              const qty = item.qty ?? 1;
              const name = item.name ?? 'Item';
              return `${qty} × ${name}`;
            })
            .join(', ')
        : 'No items found';

    const created = order.created_at
      ? new Date(order.created_at)
      : null;

    const lastUpdated =
      order.history && order.history.length
        ? new Date(order.history[order.history.length - 1]?.timestamp ?? order.created_at)
        : created;

    return {
      id: order.draft_id,
      customerName: order.full_name || 'Customer',
      email: order.email || '',
      phone: order.phone || '',
      items: itemSummary,
      date: created ? created.toLocaleString() : '',
      status: this.normalizeStatus(order.status),
      notes: order.message || '',
      lastUpdated: lastUpdated ? lastUpdated.toLocaleString() : undefined,
    };
  }

  normalizeStatus(rawStatus?: string | null): OrderStatus {
    const value = (rawStatus || '').toLowerCase();

    if (!value) return 'Pending';
    if (value.includes('cancel')) return 'Cancelled';
    if (value.includes('pickup')) return 'Ready for Pickup';
    if (value.includes('deliver')) return 'Out for Delivery';
    if (value.includes('complete') || value.includes('paid') || value.includes('success')) {
      return 'Completed';
    }

    return 'Pending';
  }

  getStatusLabel(status: OrderStatus): string {
    switch (status) {
      case 'Pending':
        return 'Pending';
      case 'Out for Delivery':
        return 'Out for Delivery';
      case 'Ready for Pickup':
        return 'Ready for Pickup';
      case 'Completed':
        return 'Completed';
      case 'Cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  }

  getStatusColor(status: OrderStatus): string {
    switch (status) {
      case 'Pending':
        return '#fbbf24'; // amber
      case 'Out for Delivery':
        return '#3b82f6'; // blue
      case 'Ready for Pickup':
        return '#10b981'; // green
      case 'Completed':
        return '#16a34a'; // darker green
      case 'Cancelled':
        return '#ef4444'; // red
      default:
        return '#9ca3af'; // gray
    }
  }

  getProgressPercent(status: OrderStatus): number {
    switch (status) {
      case 'Pending':
        return 25;
      case 'Out for Delivery':
        return 75;
      case 'Ready for Pickup':
        return 85;
      case 'Completed':
        return 100;
      case 'Cancelled':
        return 100;
      default:
        return 0;
    }
  }
}
