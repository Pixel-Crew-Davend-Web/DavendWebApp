import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  constructor(private supabaseProduct: SupabaseService) {}

  async getProducts() {
    return await this.supabaseProduct.getProducts();
  }

  async addProduct(name: string, description: string, qty: number, imageURL: string) {
    return await this.supabaseProduct.addProduct(name, description, qty, imageURL);
  }

  async updateProduct(id: string, name: string, description: string, qty: number, imageURL: string) {
    return await this.supabaseProduct.updateProduct(id, name, description, qty, imageURL);
  }

  async deleteProduct(id: string) {
    return await this.supabaseProduct.deleteProduct(id);
  }
}
