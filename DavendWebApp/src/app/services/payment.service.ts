import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { catchError } from 'rxjs/operators';
import { throwError, Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';



export type PaymentMethod = 'CARD' | 'PAYPAL' | 'ETRANSFER';

export interface PaymentResult {
  status: 'success' | 'pending' | 'failure';
  txnId?: string;
  reference?: string;
  deadlineISO?: string;
  amount?: number;
  message?: string;
}

type CartItemInput = { id: string; qty: number; name?: string };
type CustomerPayload = {
  fullName: string;
  email: string;
  phone?: string;
  address: string;
  city: string;
  postalCode: string;
  message?: string;
};

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly stripePromise = loadStripe(environment.stripePublishableKey);
  private readonly api = environment.apiBaseUrl;

  /* =========================
     STRIPE (CARD)
     ========================= */
  async payWithCard(items: any[], customer: any, orderDraftId?: string): Promise<void> {
    const stripe = await this.getStripe();

    const body = {
      orderDraftId,
      customer: this.buildCustomer(customer),
      items: this.mapItems(items),
    };

    const { id: sessionId } = await firstValueFrom(
      this.http.post<{ id: string }>(`${this.api}/api/payments/checkout-session`, body)
    );

    const { error } = await stripe.redirectToCheckout({ sessionId });
    if (error) throw error;
  }

  /** Success page (Stripe session) -> { session, order } */
  getSession(sessionId: string) {
    return this.http.get<{ session: any; order: any }>(`${this.api}/api/payments/session/${sessionId}`);
  }

  /* =========================
     E-TRANSFER
     ========================= */
  async payWithEtransfer(items: any[], customer: any, orderDraftId?: string, reference?: string): Promise<any> {
    const body = {
      orderDraftId,
      reference,
      customer: this.buildCustomer(customer),
      items: this.mapItems(items),
    };

    return await firstValueFrom(this.http.post(`${this.api}/api/payments/etransfer-order`, body));
  }

  /* =========================
     PAYPAL
     ========================= */

  /** Create a PayPal order on the server using SERVER prices. Returns PayPal orderID. */
  async createPayPalOrder(items: any[], customer: any, orderDraftId: string): Promise<string> {
    const body = {
      orderDraftId,
      customer: this.buildCustomer(customer),
      items: this.mapItems(items),
    };

    const res = await firstValueFrom(
      this.http.post<{ id: string }>(`${this.api}/api/payments/paypal/create-order`, body)
    );

    return res?.id as string;
  }

  /** Capture a PayPal order on the server and persist to DB. Returns { status, order }. */
  async capturePayPalOrder(params: {
    orderID: string;
    orderDraftId: string;
    customer: any;
    items?: any[];
  }): Promise<{ status: string; order: any }> {
    const body = {
      orderID: params.orderID,
      orderDraftId: params.orderDraftId,
      customer: this.buildCustomer(params.customer),
      items: this.mapItems(params.items || [], true), // keep names if provided
    };

    const res = await firstValueFrom(
      this.http.post<{ status: string; order: any }>(`${this.api}/api/payments/paypal/capture-order`, body)
    );
    return res;
  }

  /** Success page helper (PayPal draft) -> { order } in the same shape as Stripe’s success route */
  getPaypalSuccessByDraft(draftId: string) {
    return this.http.get<{ order: any }>(`${this.api}/api/payments/success/${encodeURIComponent(draftId)}`);
  }

  getReceiptByDraftId(draftId: string) {
    return this.http.get<{ order: any; items: any[]; totals: { subtotal: number; total: number; currency: string } }>(
      `${this.api}/api/orders/${encodeURIComponent(draftId)}`
    );
  }

  getSuccessAuto(id: string): Observable<{ order: any; session?: any }> {
    return this.getSession(id).pipe(
      catchError((err) => {
        if (err?.status === 404) {
          return this.getPaypalSuccessByDraft(id);
        }
        return throwError(() => err);
      })
    );
  }
  /* =========================
     Private helpers
     ========================= */

  private async getStripe(): Promise<Stripe> {
    const stripe = await this.stripePromise;
    if (!stripe) throw new Error('Stripe failed to initialize');
    return stripe;
  }

  private buildCustomer(c: any): CustomerPayload {
    return {
      fullName: c.fullName,
      email: c.email,
      phone: c.phone,
      address: c.address,
      city: c.city,
      postalCode: c.postalCode,
      message: c.message ?? '',
    };
  }

  private mapItems(items: any[], keepName = false): CartItemInput[] {
    return (items || []).map((i: any) =>
      keepName ? { id: i.id, qty: i.qty, name: i.name } : { id: i.id, qty: i.qty }
    );
  }
}
