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
  ) {}

  async ngOnInit() {
    const localCart = JSON.parse(localStorage.getItem('cart') || '[]');

for (const item of localCart) {
  try {
    // 1. Try to load variant
    const variantResp = await this.supabase.getVariantByID(item.id);

    if (variantResp.data) {
      const v = variantResp.data;
      const p = v.Products; // parent product

      const cartEntry = {
        id: v.id,
        name: `${p.name} (${v.size} - ${v.length_value})`,
        description: p.description,
        imageURL: p.imageURL,  // variant uses product image
        price: v.price,
        qty: item.qty,
        totalPrice: v.price * item.qty,
        removeQty: 1
      };

      this.cartItems.push(cartEntry);
      continue; // go to next cart item
    }

    // 2. If not a variant → fallback to product
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
    if (index === -1) return;

    const item = this.cartItems[index];

    if (qtyToRemove >= item.qty) {
      this.cartItems.splice(index, 1);
    } else {
      item.qty -= qtyToRemove;
      item.totalPrice = this.roundToTwo(item.qty * item.price);
    }

    this.recalculateTotal();

    const updatedCart = this.cartItems.map(item => ({
      id: item.id,
      qty: item.qty
    }));
    localStorage.setItem('cart', JSON.stringify(updatedCart));
    this.popup.info('Cart updated.');
  }

  clearCart() {
    this.cartItems = [];
    this.total = 0;
    localStorage.removeItem('cart');
    this.popup.info('Cart cleared.');
  }

  private async validateCartStock() {
  const updatedCart: any[] = [];
  const validItems: any[] = [];

  // Check each cart item
  for (const item of this.cartItems) {
    try {
      // 1. Try to load as a variant
      const variantResp = await this.supabase.getVariantByID(item.id);

      if (variantResp.data) {
        const v = variantResp.data;

        // If NO STOCK → skip (auto-remove)
        if (item.qty > v.qty || v.qty <= 0) {
          this.popup.error(`Variant ${item.id} removed from cart due to insufficient stock`);
          continue;
        }

        // Valid → keep it
        updatedCart.push({ id: item.id, qty: item.qty });
        validItems.push(item);
        continue;
      }

      // 2. If not a variant → try loading as product
      const product = await this.productService.getProductByID(item.id);

      if (item.qty > product.qty || product.qty <= 0) {
        this.popup.error(`Product ${item.name} removed from cart due to insufficient stock`);
        continue;
      }

      updatedCart.push({ id: item.id, qty: item.qty });
      validItems.push(item);

    } catch (e) {
      console.error(`Could not validate stock for ${item.id}:`, e);
      // Remove item if lookup fails entirely
    }
  }

  // Update component + localStorage
  this.cartItems = validItems;
  localStorage.setItem('cart', JSON.stringify(updatedCart));

  // Recalculate totals
  this.recalculateTotal();
}


  async payNow() {
    if (this.checkoutForm.invalid) {
      this.errorMsg = 'Please complete all required fields.';
      return;
    }
    if (!this.cartItems.length) {
      this.errorMsg = 'Your cart is empty.';
      return;
    }

    this.isProcessing = true;
    this.errorMsg = '';
    this.pendingInfo = null;

    try {
      const customer: any = this.checkoutForm.value;
      const amount = this.total;
      const paymentMethod: PaymentMethod = customer.method ?? 'CARD';
      const orderDraft = await this.orderService.createOrderDraft(
        this.cartItems,
        {
          fullName: customer.fullName!,
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
          this.cartItems,
          customer,
          orderDraft.id
          
        );

        const ref = result?.order?.reference || 'ET-UNKNOWN';
        this.pendingInfo = {
          status: 'pending',
          reference: ref,
          deadlineISO: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
          amount: this.total,
          message: 'Please send an e-transfer to payments@yourshop.com with the reference in the memo.'
        };

        try {
          if (result?.order?.draft_id) {
            await this.emailService.sendEtransferInstructions(result.order.draft_id);
          }
        } catch {  }

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
        if (containerEl) containerEl.innerHTML = ''; // clear any prior button

        paypalSdk.Buttons({
          createOrder: () => orderID,
          onApprove: async (data: any) => {
            try {
              const capture: any = await this.http.post(
                `${environment.apiBaseUrl}/api/payments/paypal/capture-order`,
                { orderID: data.orderID, orderDraftId: orderDraft.id, customer }
              ).toPromise();

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
}
