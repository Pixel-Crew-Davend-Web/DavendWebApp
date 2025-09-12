import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

  const databaseUrl = process.env['SupabaseURL'] || environment.supabaseURL;
  const databaseKey = process.env['SupabaseKey'] || environment.supabaseKey;

@Injectable({
  providedIn: 'root',
})


export class SupabaseService {
  private supabase: SupabaseClient;

  // For Production
  // constructor() {
  //   this.supabase = createClient(
  //     environment.supabaseURL, // Supabase URL
  //     environment.supabaseKey // Supabase Key
  //   );
  // }



    constructor() {
    this.supabase = createClient(
      databaseUrl, // Supabase URL
      databaseKey // Supabase Key
    );
  }

  // ADMIN AUTHENTICATION

  // Admin Signup
  async signUpAdmin(nickName: string, email: string, password: string) {
    const { data, error } = await this.supabase
      .from('AdminUsers')
      .insert([{ nickName, email, password }]);

    if (error) {
      console.error('Signup Error:', error.message);
      return false;
    }
    return true;
  }

  // Admin Login
  async loginAdmin(email: string, password: string) {
    const { data, error } = await this.supabase
      .from('AdminUsers')
      .select('*')
      .eq('email', email)
      .eq('password', password)
      .single();

    if (error || !data) {
      console.error('Login Failed:', error?.message || 'Invalid credentials');
      return false;
    }
    return true;
  }

  // Logout (No Supabase backend logout needed for database auth)
  logoutAdmin() {
    return true; // Placeholder for future improvements
  }

  // PRODUCT MANAGEMENT

  // Fetch all products
  async getProducts() {
    const { data, error } = await this.supabase.from('Products').select('*');
    if (error) {
      console.error('Error fetching products:', error.message);
      throw error;
    }
    return data || [];
  }

  // Fetch one product
  async getProductByID(id: string) {
    const { data, error } = await this.supabase.from('Products').select('*').eq('id', id).single();
    if (error) {
      console.error('Error finding product:', error.message);
      throw error;
    }
    return data || [];
  }

  // Add a new product
  async addProduct(name: string, description: string, price: number, qty: number, imageURL: string) {
    const { data, error } = await this.supabase
      .from('Products')
      .insert([{ name, description, qty, imageURL }]);
    
    if (error) {
      console.error('Error adding product:', error.message);
      throw error;
    }
    return data;
  }

  async uploadImage(filePath: string, file: File) {
    const { data, error } = await this.supabase.storage
      .from('product-images') // 👈 bucket name
      .upload(filePath, file);
  
    return { data, error };
  }  

  // Update an existing product
  async updateProduct(id: string, name: string, description: string, price: number, qty: number, imageURL: string) {
    const { data, error } = await this.supabase
      .from('Products')
      .update({ name, description, qty, imageURL, price })
      .eq('id', id);
    
    if (error) {
      console.error('Error updating product:', error.message);
      throw error;
    }
    return data;
  }

  // Delete a product
  async deleteProduct(id: string) {
    const { error } = await this.supabase.from('Products').delete().eq('id', id);
    if (error) {
      console.error('Error deleting product:', error.message);
      throw error;
    }
  }
}
