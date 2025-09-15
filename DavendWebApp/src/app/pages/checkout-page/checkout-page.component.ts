import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ProductService } from '../../services/product.service';
import { CartService } from '../../services/cart.service';
import { OrderService } from '../../services/order.service';
import { PaymentService, PaymentMethod, PaymentResult } from '../../services/payment.service';
import { EmailService } from '../../services/email.service';
import { Router } from '@angular/router';

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

  // Strongly typed form with default method
checkoutForm = this.fb.group({
  fullName: ['', Validators.required],
  email: ['', [Validators.required, Validators.email]],
  phone: [''],
  address: ['', Validators.required],
  city: ['', Validators.required],
  postalCode: ['', Validators.required],
  method: ['CARD' as PaymentMethod, Validators.required],
  message: ['']
});


  constructor(
    private fb: FormBuilder,
    private productService: ProductService,
    private cartService: CartService,
    private orderService: OrderService,
    private paymentService: PaymentService,
    private emailService: EmailService,
    private router: Router
  ) {}

  async ngOnInit() {
    const localCart = JSON.parse(localStorage.getItem('cart') || '[]');

    for (const item of localCart) {
      try {
        const product = await this.productService.getProductByID(item.id);
        const fullProduct = {
          id: item.id,
          name: product.name,
          description: product.description,
          imageURL: product.imageURL,
          price: product.price,
          qty: item.qty,
          totalPrice: product.price * item.qty,
          removeQty: 1
        };        
        this.cartItems.push(fullProduct);
      } catch (error) {
        console.error(`Failed to fetch product with ID ${item.id}:`, error);
      }
    }
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
    return `https://oitjgpsicvzplwsbmxyo.supabase.co/storage/v1/object/public/product-images/${fileName}`; // CHANGED URL TO oitjgpsicvzplwsbmxyo MIGHT NEED TO CHANGE OTHER FUNCTIONS
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
  }

async payNow() {
  this.isProcessing = true;
  this.errorMsg = '';
  this.pendingInfo = null;

  try {
    const customer = this.checkoutForm.value;
    const amount = this.total;

    // Fallback default
    const paymentMethod: PaymentMethod = customer.method ?? 'CARD';

    // Step 1: Create draft order
    const order = await this.orderService.createOrderDraft(
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

    // Step 2: Attempt payment
    const result = await this.paymentService.charge(order.id, amount, paymentMethod);

    if (result.status === 'success') {
      await this.orderService.finalizeOrder(order.id, result.txnId!);
      await this.emailService.sendReceipt(order.id);
      this.router.navigate(['/success', order.id]);
    } else if (result.status === 'pending') {
      this.pendingInfo = result;
      await this.emailService.sendEtransferInstructions(order.id);
    } else {
      this.errorMsg = result.message || 'Payment failed. Please try again.';
    }
  } catch (err: any) {
    this.errorMsg = 'Something went wrong. Please try again.';
  } finally {
    this.isProcessing = false;
  }
}

}
