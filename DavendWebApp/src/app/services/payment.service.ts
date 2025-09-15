import { Injectable } from '@angular/core';
import { OrderService } from './order.service';

export type PaymentMethod = 'CARD' | 'PAYPAL' | 'ETRANSFER';

export interface PaymentResult {
  status: 'success' | 'pending' | 'failure';
  txnId?: string;          // for success
  reference?: string;      // for pending (e-transfer)
  deadlineISO?: string;    // for pending (e-transfer)
  amount?: number;         // included for clarity
  message?: string;        // for failure
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  constructor(private orderService: OrderService) {}

  async charge(orderId: string, amount: number, method: PaymentMethod): Promise<PaymentResult> {
    if (method === 'ETRANSFER') {
      const reference = 'ET-' + Math.random().toString(36).substr(2, 6).toUpperCase();
      const deadlineISO = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

      await this.orderService.setPendingEtransfer(orderId, reference, deadlineISO, amount);

      return {
        status: 'pending',
        reference,
        deadlineISO,
        amount
      };
    }

    if (method === 'CARD' || method === 'PAYPAL') {
      // Simulate a successful txn for now
      return {
        status: 'success',
        txnId: `${method.toLowerCase()}-${Date.now()}`
      };
    }

    return {
      status: 'failure',
      message: 'Unsupported payment method'
    };
  }
}
