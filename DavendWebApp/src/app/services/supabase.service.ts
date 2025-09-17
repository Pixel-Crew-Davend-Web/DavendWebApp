import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root',
})

export class SupabaseService {
  private supabase: SupabaseClient;

  // For Production
  constructor() {
    this.supabase = createClient(
      environment.supabaseURL, // Supabase URL
      environment.supabaseKey // Supabase Key
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

    if (!email || !password || email.trim() === '' || password.trim() === '') {
      console.error('Login Failed: Email and password are required.');
      return false;
    }

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
      .insert([{ name, description, price, qty, imageURL }]);
    
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

  private readonly allowedTypes = new Set<string>(['image/jpeg', 'application/pdf']);

async uploadProductAsset(file: File): Promise<string> {
  if (!this.allowedTypes.has(file.type)) {
    throw new Error('Only JPG/JPEG or PDF files are allowed.');
  }

  // Optional: validate extension too (defense-in-depth)
  const lower = (file.name || '').toLowerCase();
  if (!(lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.pdf'))) {
    throw new Error('Only .jpg, .jpeg, or .pdf files are allowed.');
  }

  const ext = lower.substring(lower.lastIndexOf('.'));
  const filename = `${crypto.randomUUID()}${ext}`; // ensure unique

  // Upload to your Supabase bucket, e.g., 'product-assets'
  const { data, error } = await this.supabase
    .storage
    .from('product-images')
    .upload(filename, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });

  if (error) throw error;

  // Return the storage path you use as imageURL in DB
  return data?.path || filename;
}
}
