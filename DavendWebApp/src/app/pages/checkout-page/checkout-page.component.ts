import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ProductService } from '../../services/product.service';
import { CartService } from '../../services/cart.service';
import { OrderService } from '../../services/order.service';
import { PaymentService, PaymentMethod, PaymentResult } from '../../services/payment.service';
import { EmailService } from '../../services/email.service';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { PopupService } from '../../services/popup.service';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-checkout-page',
  templateUrl: './checkout-page.component.html',
  styleUrls: ['./checkout-page.component.scss']
})
export class CheckoutPageComponent implements OnInit {
  cartItems: any[] = [];
  total: number = 0;
  isProcessing = false;
  errorMsg = '';
  pendingInfo: PaymentResult | null = null;

  // mailto fallback (free)
  adminEmail = 'orders.davendpunch@gmail.com';
  pendingMailtoUrl = '';
  pendingSummaryText = '';
  pendingCopied = false;

  closePendingModal() {
    this.pendingInfo = null;
    this.pendingMailtoUrl = '';
    this.pendingSummaryText = '';
    this.pendingCopied = false;
  }

  checkoutForm = this.fb.group({
    fullName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    address: ['', Validators.required],
    city: ['', Validators.required],
    postalCode: ['', Validators.required],
    method: ['CARD' as PaymentMethod, Validators.required],
    message: ['']  // captured and sent to backend
  });

  constructor(
    private fb: FormBuilder,
    private productService: ProductService,
    private supabase: SupabaseService,
    private orderService: OrderService,
    private paymentService: PaymentService,
    private emailService: EmailService,
    private router: Router,
    private http: HttpClient,
    private popup: PopupService
  ) { }

  async ngOnInit() {
    const localCart = JSON.parse(localStorage.getItem('cart') || '[]');

    for (const item of localCart) {
      try {
        const variantResp = await this.supabase.getVariantByID(item.id);

        if (variantResp.data) {
          const v = variantResp.data;
          const p = v.Products;

          const cartEntry = {
            id: v.id,
            name: `${p.name} (${v.size} - ${v.length_value})`,
            description: p.description,
            imageURL: p.imageURL,
            price: v.price,
            qty: item.qty,
            totalPrice: v.price * item.qty,
            removeQty: 1
          };

          this.cartItems.push(cartEntry);
          continue;
        }

        const product = await this.productService.getProductByID(item.id);
        const cartEntry = {
          id: item.id,
          name: product.name,
          description: product.description,
          imageURL: product.imageURL,
          price: product.price,
          qty: item.qty,
          totalPrice: product.price * item.qty,
          removeQty: 1
        };

        this.cartItems.push(cartEntry);

      } catch (err) {
        console.error(`Failed to fetch item with ID ${item.id}:`, err);
      }
    }
    await this.validateCartStock();
    this.recalculateTotal();
  }

  private roundToTwo(num: number): number {
    return Math.round((num + Number.EPSILON) * 100) / 100;
  }

  private recalculateTotal() {
    this.total = this.roundToTwo(
      this.cartItems.reduce((acc, item) => acc + item.totalPrice, 0)
    );
  }

  getImageUrl(fileName: string): string {
    return `https://oitjgpsicvzplwsbmxyo.supabase.co/storage/v1/object/public/product-images/${fileName}`;
  }

  removeFromCart(id: string, qtyToRemove: number) {
    const index = this.cartItems.findIndex(item => item.id === id);
    if (index !== -1) {
      const item = this.cartItems[index];
      item.qty -= qtyToRemove;
      if (item.qty <= 0) {
        this.cartItems.splice(index, 1);
      } else {
        item.totalPrice = item.price * item.qty;
      }
      localStorage.setItem('cart', JSON.stringify(this.cartItems.map(i => ({ id: i.id, qty: i.qty }))));
      this.recalculateTotal();
    }
  }

  get grandTotal(): number {
    return this.roundToTwo(this.total);
  }

  private buildPendingMailto() {
    this.pendingCopied = false;

    const customer = {
      fullName: this.checkoutForm.value.fullName || '',
      email: this.checkoutForm.value.email || '',
      phone: this.checkoutForm.value.phone || '',
      address: this.checkoutForm.value.address || '',
      city: this.checkoutForm.value.city || '',
      postalCode: this.checkoutForm.value.postalCode || '',
      message: this.checkoutForm.value.message || ''
    };

    const ref = this.pendingInfo?.reference || 'ET-UNKNOWN';
    const amount = Number(this.pendingInfo?.amount ?? this.grandTotal).toFixed(2);

    const lines: string[] = [];
    lines.push('New E-TRANSFER order (PENDING)');
    lines.push(`Ref: ${ref}`);
    lines.push('');
    lines.push(`Customer: ${customer.fullName}`);
    lines.push(`Email: ${customer.email}`);
    lines.push(`Phone: ${customer.phone}`);
    lines.push('');
    lines.push('Shipping:');
    lines.push(`${customer.address}`);
    lines.push(`${customer.city} ${customer.postalCode}`);
    lines.push('');
    lines.push('Items:');

    if (Array.isArray(this.cartItems) && this.cartItems.length) {
      for (const it of this.cartItems) {
        const qty = Number(it.qty ?? 0);
        const price = Number(it.price ?? 0);
        lines.push(`- ${it.name} x ${qty} @ $${price.toFixed(2)} = $${(qty * price).toFixed(2)}`);
      }
    } else {
      lines.push('(items not available)');
    }

    lines.push('');
    lines.push(`Amount Due: $${amount} CAD`);

    if (customer.message) {
      lines.push('');
      lines.push(`Message: ${customer.message}`);
    }

    const subject = `Davend Order (ETRANSFER) - ${ref}`;
    const body = lines.join('\n');

    this.pendingSummaryText = body;
    this.pendingMailtoUrl =
      `mailto:${encodeURIComponent(this.adminEmail)}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;
  }

  async copyPendingSummary() {
    try {
      if (!this.pendingSummaryText) return;
      await navigator.clipboard.writeText(this.pendingSummaryText);
      this.pendingCopied = true;
      setTimeout(() => (this.pendingCopied = false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  }

  async payNow() {
    this.errorMsg = '';
    this.isProcessing = true;

    try {
      const paymentMethod = this.checkoutForm.get('method')?.value as PaymentMethod;

      const customer = {
        fullName: this.checkoutForm.value.fullName!,
        email: this.checkoutForm.value.email!,
        phone: this.checkoutForm.value.phone || '',
        address: this.checkoutForm.value.address!,
        city: this.checkoutForm.value.city!,
        postalCode: this.checkoutForm.value.postalCode!,
        message: this.checkoutForm.value.message || ''
      };

      const amount = this.grandTotal;

      const orderDraft: any = await this.orderService.createOrderDraft(
        {
          fullName: customer.fullName,
          email: customer.email!,
          phone: customer.phone || '',
          address: customer.address!,
          city: customer.city!,
          postalCode: customer.postalCode!,
          message: customer.message || ''
        },
        paymentMethod,
        amount
      );

      if (paymentMethod === 'CARD') {
        await this.paymentService.payWithCard(this.cartItems, customer, orderDraft.id);
        return;
      }

      if (paymentMethod === 'ETRANSFER') {
        const result: any = await this.paymentService.payWithEtransfer(
          this.cartItems.map(i => ({ id: i.id, qty: i.qty })),
          customer,
          orderDraft.id
        );

        const ref = result?.order?.reference || 'ET-UNKNOWN';
        this.pendingInfo = {
          status: 'pending',
          reference: ref,
          deadlineISO: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
          amount: this.grandTotal,
          message: 'Please send an e-transfer to payments@yourshop.com with the reference in the memo.'
        };

        // build mailto + copy text now that we have ref
        this.buildPendingMailto();

        try {
          if (result?.order?.draft_id) {
            await this.emailService.sendEtransferInstructions(result.order.draft_id);
          }
        } catch { }

        return;
      }

      if (paymentMethod === 'PAYPAL') {
        const paypalSdk = (window as any).paypal;
        if (!paypalSdk || !paypalSdk.Buttons) {
          this.errorMsg = 'PayPal is not available right now. Please try again later.';
          return;
        }

        const createResp = await this.http.post<{ id: string }>(
          `${environment.apiBaseUrl}/api/payments/paypal/create-order`,
          { items: this.cartItems.map(i => ({ id: i.id, qty: i.qty })), customer, orderDraftId: orderDraft.id }
        ).toPromise();

        const orderID = createResp?.id;
        if (!orderID) {
          this.errorMsg = 'Could not start PayPal payment.';
          return;
        }

        const containerSelector = '#paypal-button-container';
        const containerEl = document.querySelector(containerSelector);
        if (containerEl) containerEl.innerHTML = '';

        paypalSdk.Buttons({
          createOrder: () => orderID,
          onApprove: async (data: any) => {
            try {
              const capture = await this.paymentService.capturePayPalOrder({
                orderID: data.orderID,
                orderDraftId: orderDraft.id,
                customer,
                items: this.cartItems,
              });

              if (capture?.status === 'success') {
                this.router.navigate(['/success', orderDraft.id]);
              } else {
                this.errorMsg = 'PayPal payment failed. Please try again.';
              }
            } catch (e) {
              console.error('PayPal capture error:', e);
              this.errorMsg = 'PayPal payment failed. Please try again.';
            }
          },

          onCancel: () => {
            this.errorMsg = 'PayPal payment was canceled.';
          },
          onError: (err: any) => {
            console.error('PayPal JS error:', err);
            this.errorMsg = 'PayPal encountered an error.';
          }
        }).render(containerSelector);

        return;
      }

      this.popup.error('Unknown payment method.');
      this.errorMsg = 'Unknown payment method.';
    } catch (err: any) {
      console.error(err);
      this.popup.error('Something went wrong. Please try again.');
      this.errorMsg = 'Something went wrong. Please try again.';
    } finally {
      this.isProcessing = false;
    }
  }

  // Existing method in your file (kept as-is in your project)
  private async validateCartStock(): Promise<void> {
    // If you already have this function below in your file, keep it.
    // This placeholder prevents TS errors if your project expects it here.
    return;
  }
}
