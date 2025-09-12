import { Component, OnInit } from '@angular/core';
import { ProductService } from '../../services/product.service';

@Component({
  selector: 'app-checkout-page',
  templateUrl: './checkout-page.component.html',
  styleUrls: ['./checkout-page.component.scss']
})
export class CheckoutPageComponent implements OnInit {
  cartItems: any[] = [];
  total: number = 0;

  constructor(private productService: ProductService) {}

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
          removeQty: 1 // default value for removing input
        };        

        this.cartItems.push(fullProduct);
        this.total = this.roundToTwo(this.total + fullProduct.totalPrice);
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

  clicked() {
    console.log('Clicked!');
  }

  removeFromCart(id: string, qtyToRemove: number) {
    const index = this.cartItems.findIndex(item => item.id === id);
    if (index === -1) return;
  
    const item = this.cartItems[index];
  
    if (qtyToRemove >= item.qty) {
      this.total = this.roundToTwo(this.total - item.totalPrice);
      this.cartItems.splice(index, 1);
    } else {
      item.qty -= qtyToRemove;
      item.totalPrice = this.roundToTwo(item.qty * item.price);
      this.total = this.roundToTwo(this.total - item.price * qtyToRemove);
    }

    this.recalculateTotal();
  
    // Update localStorage
    const updatedCart = this.cartItems.map(item => ({
      id: item.id,
      qty: item.qty
    }));
    localStorage.setItem('cart', JSON.stringify(updatedCart));
  }
  
}
