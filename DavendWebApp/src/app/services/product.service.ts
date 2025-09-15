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

  async getProductByID(id: string) {
    return await this.supabaseProduct.getProductByID(id)
  }

  async addProduct(name: string, description: string, price: number, qty: number, imageURL: string) {
    return await this.supabaseProduct.addProduct(name, description, price, qty, imageURL);
  }

  async uploadImage(filePath: string, file: File) {
    return await this.supabaseProduct.uploadImage(filePath, file);
  }

  async updateProduct(id: string, name: string, description: string, price: number, qty: number, imageURL: string) {
    return await this.supabaseProduct.updateProduct(id, name, description, price, qty, imageURL);
  }

  async deleteProduct(id: string) {
    return await this.supabaseProduct.deleteProduct(id);
  }

  private readonly allowedTypes = new Set<string>(['image/jpeg', 'application/pdf']);

  async uploadProductAsset(file: File): Promise<string | null> {
    return await this.supabaseProduct.uploadProductAsset(file);
  }
}
