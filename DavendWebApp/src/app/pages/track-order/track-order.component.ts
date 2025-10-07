import { Component } from '@angular/core';

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

  orders: Order[] = [
    { id: 'ORD-1759787115401', customerName: 'John Doe', email: 'john@example.com', phone: '416-555-0001', items: 'Die Springs x2', date: '2025-09-12', status: 'Pending', notes: 'Rush order', lastUpdated: '2025-09-13 11:15 AM' },
    { id: 'ORD-1759787115402', customerName: 'Jane Smith', email: 'jane@example.com', phone: '416-555-0002', items: 'Ejector Pins x5', date: '2025-09-10', status: 'Completed', lastUpdated: '2025-09-11 09:40 AM' },
    { id: 'ORD-1759787115403', customerName: 'Mike Brown', email: 'mike@example.com', phone: '416-555-0003', items: 'Punch Guides x1', date: '2025-09-08', status: 'Cancelled', lastUpdated: '2025-09-08 02:30 PM' },
    { id: 'ORD-1759787115404', customerName: 'Amira Khan', email: 'amira@example.com', phone: '905-555-1004', items: 'Guide Pins and Bushings', date: '2025-09-14', status: 'Pending', lastUpdated: '2025-09-14 08:15 AM' },
    { id: 'ORD-1759787115405', customerName: 'Leo Chen', email: 'leo@example.com', phone: '647-555-1005', items: 'Die Buttons x3', date: '2025-09-13', status: 'Out for Delivery', lastUpdated: '2025-09-13 03:45 PM' },
    { id: 'ORD-1759787115406', customerName: 'Sara Ali', email: 'sara@example.com', phone: '437-555-1006', items: 'Surface Grinding Service', date: '2025-09-11', status: 'Ready for Pickup', lastUpdated: '2025-09-12 10:00 AM' },
    { id: 'ORD-1759787115407', customerName: 'Owen King', email: 'owen@example.com', phone: '416-555-1007', items: 'Centerless Grinding', date: '2025-09-09', status: 'Completed', lastUpdated: '2025-09-09 04:10 PM' },
    { id: 'ORD-1759787115408', customerName: 'Priya Patel', email: 'priya@example.com', phone: '905-555-1008', items: 'Punch + Die Set', date: '2025-09-07', status: 'Cancelled', lastUpdated: '2025-09-07 01:55 PM' },
    { id: 'ORD-1759787115409', customerName: 'Yusuf Idris', email: 'yusuf@example.com', phone: '289-555-1009', items: 'Custom Bushing', date: '2025-09-06', status: 'Pending', lastUpdated: '2025-09-07 09:25 AM' },
    { id: 'ORD-1759787115410', customerName: 'Hannah Lee', email: 'hannah@example.com', phone: '416-555-1010', items: 'Ejector Pins x12', date: '2025-09-05', status: 'Completed', lastUpdated: '2025-09-05 05:00 PM' }
  ];

  checkOrder() {
    const query = this.searchTerm.trim().toLowerCase();
    this.result = null;
    this.notFound = false;

    if (!query) return;

    const match = this.orders.find(o =>
      o.id.toLowerCase() === query || o.email.toLowerCase() === query
    );

    if (match) {
      this.result = match;
    } else {
      this.notFound = true;
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
