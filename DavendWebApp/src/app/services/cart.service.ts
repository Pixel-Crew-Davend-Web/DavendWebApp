// cart.service.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CartService {
  private storageKey = 'cart';

  getCart() {
    return JSON.parse(localStorage.getItem(this.storageKey) || '[]');
  }

  saveCart(cart: any[]) {
    localStorage.setItem(this.storageKey, JSON.stringify(cart));
  }

  clear() {
    localStorage.removeItem(this.storageKey);
  }

  total() {
    const cart = this.getCart();
    return cart.reduce((acc: number, item: any) => acc + (item.price * item.qty), 0);
  }
}
