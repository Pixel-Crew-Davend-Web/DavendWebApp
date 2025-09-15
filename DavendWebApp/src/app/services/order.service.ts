import { Injectable } from '@angular/core';

export interface CustomerInfo {
  fullName: string;
  email: string;
  phone?: string;
  address: string;
  city: string;
  postalCode: string;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  async createOrderDraft(
    cart: any[],
    customer: CustomerInfo,
    method: string,
    amount: number
  ) {
    const orderId = 'ORD-' + Date.now();
    console.log('Created draft order:', {
      orderId,
      cart,
      customer,
      method,
      amount,
      status: 'DRAFT'
    });

    return { id: orderId, cart, customer, method, amount };
  }

  async finalizeOrder(orderId: string, txnId: string) {
    console.log(`Finalized order ${orderId} with txn ${txnId}`);
  }

  async setPendingEtransfer(orderId: string, reference: string, deadlineISO: string, amount: number) {
    console.log(
      `Order ${orderId} set to PENDING with ref ${reference}, deadline ${deadlineISO}, amount ${amount}`
    );
  }

  async cancelOrder(orderId: string, reason?: string) {
    console.log(`Order ${orderId} canceled. Reason: ${reason}`);
  }
}
