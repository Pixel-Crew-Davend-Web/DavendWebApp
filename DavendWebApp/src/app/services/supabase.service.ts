import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type ReportType =
  | 'byProducts'
  | 'byOrders'
  | 'reportCustomer'
  | 'orderFrequencyReport'
  | 'frequentCustomersReport';
export type OrdersGroupBy = 'day' | 'name' | 'email' | 'status' | 'method';
export type ProductsGroupBy = 'name' | 'active';
export type GroupBy = OrdersGroupBy | ProductsGroupBy;

export interface ReportParams {
  type: ReportType;
  from: Date; // inclusive
  to: Date; // inclusive
  groupBy: GroupBy;
}

export interface GeneratedReportInfo {
  bucket: string;
  baseName: string; // without extension
  csvPath: string;
  pdfPath: string;
  itemsCount: number;
  signedCsvUrl?: string;
  signedPdfUrl?: string;
}

export interface DbOrder {
  draft_id: string;
  created_at: string;
  amount?: number | null;
  amount_total?: number | null;
  currency?: string | null;
  status?: string | null;
  method?: string | null;
  reference?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  history?: any[] | null;
}

export interface DbOrderItem {
  order_id?: string | null;
  product_id?: string | null;
  name?: string | null;
  price?: number | null;
  qty?: number | null;
  subtotal?: number | null;
}

export interface DbOrderWithItems extends DbOrder {
  itemsSummary?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private readonly BUCKET = 'Reports';
  private supabase: SupabaseClient;

  // For Production
  constructor() {
    this.supabase = createClient(
      environment.supabaseURL, // Supabase URL
      environment.supabaseKey, // Supabase Key
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // 👇 override the lock to a no-op so it never uses Navigator LockManager
          lock: async (
            _name: string,
            _timeout: number,
            fn: () => Promise<any>
          ) => await fn(),
        },
      }
    );
  }

  // ADMIN AUTHENTICATION

  // Admin Signup
  async signUpAdmin(nickName: string, email: string, password: string) {
    const { data, error } = await this.supabase
      .from('AdminUsers')
      .insert([{ nickName, email, password }])
      .select('id')
      .single();

    if (error) {
      console.error('Signup Error:', error.message);
      return false;
    }

    const adminID = data?.id;

    if (!adminID) {
      console.error('Signup Error: No admin ID returned.');
      return false;
    }

    try {
      await this.createAdminToken(adminID);
    } catch (error) {
      console.error(
        'Error creating admin token:',
        (error as any)?.message ?? error
      );
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
      .single();

    if (error || !data) {
      console.error('Login Failed:', error?.message || 'Invalid credentials');
      return false;
    }

    try {
      await this.createAdminToken(data.id);
    } catch (error) {
      console.error(
        'Error creating admin token:',
        (error as any)?.message ?? error
      );
      return false;
    }

    return true;
  }

  // Logout (No Supabase backend logout needed for database auth)
  logoutAdmin() {
    return true; // Placeholder for future improvements
  }

  // GET Admin ID by email
  async getAdminIDByEmail(email: string) {
    const { data, error } = await this.supabase
      .from('AdminUsers')
      .select('id')
      .eq('email', email)
      .single();

    if (error) {
      console.error('Error fetching admin ID:', error.message);
      throw error;
    }
    return data?.id || null;
  }

  // Get Admin Nickname by ID
  async getAdminNickNameByID(adminID: string) {
    const { data, error } = await this.supabase
      .from('AdminUsers')
      .select('nickName')
      .eq('id', adminID)
      .single();
    if (error) {
      console.error('Error fetching admin nickname:', error.message);
      throw error;
    }
    return data?.nickName || null;
  }

  // Create Admin TOKEN
  async createAdminToken(adminID: string) {
    const token = this.generateToken();
    const timeStamp = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('AdminLoginToken')
      .upsert(
        [
          {
            AdminID: adminID,
            ADMIN_TOKEN_KEY: token,
            ADMIN_TOKEN_EXPIRY: timeStamp,
          },
        ],
        { onConflict: 'AdminID' }
      )
      .select('"AdminID","ADMIN_TOKEN_KEY","ADMIN_TOKEN_EXPIRY"')
      .single();

    if (error) {
      console.error('Error creating admin token:', error.message);
      throw error;
    }

    return data; // contains adminID, token, timeStamp
  }

  private generateToken(): string {
    // Browser-safe UUID token. If you want longer/opaque, concat two UUIDs.
    return (crypto as any).randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  }

  async getAdminToken(adminID: string, localToken?: string) {
    const { data, error } = await this.supabase
      .from('AdminLoginToken')
      .select('"ADMIN_TOKEN_KEY","ADMIN_TOKEN_EXPIRY"')
      .eq('AdminID', adminID)
      .single();

    if (localToken && data?.ADMIN_TOKEN_KEY !== localToken) {
      throw new Error('Token mismatch');
    }

    if (error) {
      console.error('Error fetching admin token:', error.message);
      throw error;
    }
    return data;
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
    const { data, error } = await this.supabase
      .from('Products')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      console.error('Error finding product:', error.message);
      throw error;
    }
    return data || [];
  }

  // Add a new product
  async addProduct(
    name: string,
    description: string,
    price: number,
    qty: number,
    imageURL: string
  ) {
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
  async updateProduct(
    id: string,
    name: string,
    description: string,
    price: number,
    qty: number,
    imageURL: string
  ) {
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
    const { error } = await this.supabase
      .from('Products')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Error deleting product:', error.message);
      throw error;
    }
  }
  private readonly allowedTypes = new Set<string>([
    'image/jpeg',
    'image/png',
  ]);

  async uploadProductAsset(file: File): Promise<string> {
    if (!this.allowedTypes.has(file.type)) {
      throw new Error('Only JPG, JPEG, or PNG files are allowed.');
    }

    // Optional: validate extension too (defense-in-depth)
    const lower = (file.name || '').toLowerCase();
    if (
      !(lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png'))
    ) {
      throw new Error('Only .jpg, .jpeg, or .png files are allowed.');
    }

    const ext = lower.substring(lower.lastIndexOf('.'));
    const filename = `${crypto.randomUUID()}${ext}`; // ensure unique

    // Upload to your Supabase bucket, e.g., 'product-assets'
    const { data, error } = await this.supabase.storage
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

  async getVariantsByProduct(productId: string) {
    const response = await this.supabase
      .from('ProductVariants')
      .select('*')
      .eq('product_id', productId);

    return response; // <-- return full { data, error }
  }

  async getVariantByID(id: string) {
    return this.supabase
      .from('ProductVariants')
      .select('*, Products(*)') // fetch parent product for image + name
      .eq('id', id)
      .single();
  }

  async getAllProductsWithVariants() {
    const { data, error } = await this.supabase
      .from('Products')
      .select('*, ProductVariants:ProductVariants(*)');
    if (error) {
      console.error('Error fetching products with variants:', error.message);
      throw error;
    }
    return data || [];
  }

  async addVariant(variant: any) {
    const { data, error } = await this.supabase
      .from('ProductVariants')
      .insert(variant);

    if (error) {
      console.error('ADD VARIANT ERROR:', error);
    }

    return { data, error };
  }

  async updateVariant(id: string, data: any) {
    return this.supabase.from('ProductVariants').update(data).eq('id', id);
  }

  async deleteVariant(id: string) {
    return this.supabase.from('ProductVariants').delete().eq('id', id);
  }

  // ------------------------
  // Orders (simple helpers)
  // ------------------------

  async fetchAllOrders(): Promise<DbOrderWithItems[]> {
    // 1) Load all orders
    const { data, error } = await this.supabase
      .from('Orders')
      .select('*') // pull all columns, avoid schema mismatch issues
      .order('created_at', { ascending: false });

    if (error) {
      console.error(
        'Error fetching orders from Supabase',
        error.message || error
      );
      throw error;
    }

    

    const orders = (data ?? []) as DbOrder[];

    // 2) Collect all draft IDs to fetch items for
    const ids = orders
      .map((o) => (o.draft_id || '').trim())
      .filter((id) => !!id);

    if (!ids.length) {
      return orders; // no orders or no IDs
    }

    // 3) Fetch all related OrderItems in one query
    const { data: items, error: itemsErr } = await this.supabase
      .from('OrderItems')
      .select('order_id, name, qty')
      .in('order_id', ids);

    if (itemsErr) {
      console.error(
        'Error fetching order items for admin orders',
        itemsErr.message || itemsErr
      );
      // Fall back to orders without item summaries
      return orders;
    }

    // 4) Group items by order_id and format labels like "2x Pepperoni Pizza"
    const byOrder: Record<string, string[]> = {};

    (items ?? []).forEach((it: any) => {
      const orderId = (it.order_id || '').trim();
      if (!orderId) return;

      const qty =
        typeof it.qty === 'number' && Number.isFinite(it.qty) && it.qty > 0
          ? it.qty
          : 1;
      const name = (it.name || '').trim() || 'Item';

      const label = `${qty}x ${name}`;
      if (!byOrder[orderId]) byOrder[orderId] = [];
      byOrder[orderId].push(label);
    });

    // 5) Attach "itemsSummary" to each order
    return orders.map((o) => {
      const key = (o.draft_id || '').trim();
      const summary = key && byOrder[key] ? byOrder[key].join(', ') : '';

      return {
        ...o,
        itemsSummary: summary || null,
      };
    });
  }

  async updateOrderStatus(draftId: string, dbStatus: string): Promise<void> {
    const id = (draftId || '').trim();
    if (!id) {
      throw new Error('Missing order draft_id for update');
    }

    const { error } = await this.supabase
      .from('Orders')
      .update({ status: dbStatus })
      .eq('draft_id', id);

    if (error) {
      console.error(
        'Error updating order status in Supabase',
        error.message || error
      );
      throw error;
    }
  }

  async fetchOrderWithItems(
    draftId: string
  ): Promise<{ order: DbOrder; items: DbOrderItem[] } | null> {
    const id = draftId.trim();
    if (!id) return null;

    const { data: order, error: orderErr } = await this.supabase
      .from('Orders')
      .select(
        'draft_id, created_at, amount, currency, status, method, full_name, email, phone, message'
      )

      .eq('draft_id', id)
      .single();

    if (orderErr || !order) {
      console.error(
        'Error fetching order',
        orderErr?.message || orderErr || 'Order not found'
      );
      return null;
    }

    const { data: items, error: itemsErr } = await this.supabase
      .from('OrderItems')
      .select('*')
      .eq('order_id', id);

    if (itemsErr) {
      console.error('Error fetching order items', itemsErr.message || itemsErr);
    }

    return {
      order: order as DbOrder,
      items: (items ?? []) as DbOrderItem[],
    };
  }

  async fetchOrdersByEmail(email: string): Promise<DbOrder[]> {
    const value = (email || '').trim();
    if (!value) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('Orders')
      .select(
        'draft_id, created_at, amount, currency, status, method, full_name, email, phone, message'
      )
      .eq('email', value)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching orders by email', error.message || error);
      return [];
    }

    return (data ?? []) as DbOrder[];
  }


  async uploadAdditionalProductImage(file: File): Promise<string> {
    const ext = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${ext}`;

    const { error } = await this.supabase.storage
      .from('product-images')
      .upload(fileName, file);

    if (error) throw error;

    return fileName; // returns the storage path
  }

  async addProductImage(productId: string, imagePath: string) {
    const { data, error } = await this.supabase
      .from('productimages')
      .insert({ product_id: productId, image_path: imagePath });

    if (error) throw error;
    return data;
  }

  async getProductImages(productId: string) {
    const { data, error } = await this.supabase
      .from('productimages')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async deleteProductImageRecord(id: string, imagePath: string) {
    // delete from bucket
    await this.supabase.storage.from('product-images').remove([imagePath]);

    // delete from DB
    return this.supabase.from('productimages').delete().eq('id', id);
  }

  async generateAndStoreReport(
    params: ReportParams
  ): Promise<GeneratedReportInfo> {
    await this.ensureBucket();

    const { rows, headers } = await this.fetchAndAggregate(params);
    const csv = this.toCSV(headers, rows);

    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Build canonical filenames
    const stamp = this.ts();
    const fromStr = this.safeDate(params.from);
    const toStr = this.safeDate(params.to);
    const baseName = `report_${params.type}_${params.groupBy}_${fromStr}_to_${toStr}_${stamp}_(${timestamp})`;

    const csvBlob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const csvPath = `${baseName}.csv`;

    // Upload CSV
    await this.uploadFile(this.BUCKET, csvPath, csvBlob, 'text/csv');

    // Generate & upload PDF (best-effort: if pdf lib missing, we still succeed with CSV)
    const pdfPath = `${baseName}.pdf`;
    try {
      const pdfBlob = await this.buildPdfBlob(
        `${params.type} (grouped by ${params.groupBy})`,
        headers,
        rows
      );
      await this.uploadFile(this.BUCKET, pdfPath, pdfBlob, 'application/pdf');
    } catch (err) {
      console.warn('PDF generation failed; continuing with CSV only:', err);
    }

    // Signed URLs (1 hour)
    const signedCsvUrl = await this.signUrl(csvPath, 60 * 60);
    const signedPdfUrl = await this.signUrl(pdfPath, 60 * 60).catch(
      () => undefined
    );

    return {
      bucket: this.BUCKET,
      baseName,
      csvPath,
      pdfPath,
      itemsCount: rows.length,
      // signedCsvUrl,
      // signedPdfUrl
    };
  }

  async updateOrderHistory(draftId: string, history: any[]): Promise<void> {
  const id = draftId.trim();
  if (!id) throw new Error("Missing draft_id");

  const { error } = await this.supabase
    .from("Orders")
    .update({ history })
    .eq("draft_id", id);

  if (error) {
    console.error("Error updating order history:", error);
    throw error;
  }
}


  async generateReportCustomer(from: any, to: any) {
    from = new Date(from);
    to = new Date(to);

    const { data: orders, error } = await this.supabase
      .from('Orders')
      .select('draft_id, created_at, full_name')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString());

    if (error) throw error;

    if (!orders?.length) {
      return this.saveCustomReport(
        'reportCustomer',
        ['Product', 'Customer', 'Order Count'],
        [],
        from,
        to
      );
    }

    const ids = orders.map((o) => o.draft_id);

    const { data: items, error: itemsErr } = await this.supabase
      .from('OrderItems')
      .select('order_id, name, qty')
      .in('order_id', ids);

    if (itemsErr) throw itemsErr;

    const counts = new Map<string, number>();

    for (const it of items) {
      const order = orders.find((o) => o.draft_id === it.order_id);
      if (!order) continue;

      const product = (it.name || 'Unknown Product').trim();
      const customer = (order.full_name || 'Unknown Customer').trim();
      const key = `${product}__${customer}`;

      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const rows = [...counts.entries()].map(([key, count]) => {
      const [product, customer] = key.split('__');
      return { product, customer, order_count: count };
    });

    return this.saveCustomReport(
      'reportCustomer',
      ['Product', 'Customer', 'Order Count'],
      rows,
      from,
      to
    );
  }

  async generateOrderFrequencyReport(from: any, to: any) {
    from = new Date(from);
    to = new Date(to);

    const { data, error } = await this.supabase
      .from('Orders')
      .select('full_name, created_at')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString());

    if (error) throw error;

    const freq = new Map<string, number>();

    for (const o of data ?? []) {
      const customer = (o.full_name || 'Unknown Customer').trim();
      freq.set(customer, (freq.get(customer) || 0) + 1);
    }

    const rows = [...freq.entries()].map(([customer, count]) => ({
      customer,
      order_count: count,
    }));

    return this.saveCustomReport(
      'orderFrequencyReport',
      ['Customer', 'Order Count'],
      rows,
      from,
      to
    );
  }

  async generateFrequentCustomersReport(from: any, to: any) {
    from = new Date(from);
    to = new Date(to);

    const { data, error } = await this.supabase
      .from('Orders')
      .select('full_name, created_at')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString());

    if (error) throw error;

    const counts = new Map<string, number>();

    for (const o of data ?? []) {
      const customer = (o.full_name || 'Unknown Customer').trim();
      counts.set(customer, (counts.get(customer) || 0) + 1);
    }

    const rows = [...counts.entries()].map(([customer, total]) => ({
      customer,
      total_orders: total,
      type: total >= 2 ? 'Frequent' : 'One-Time',
    }));

    return this.saveCustomReport(
      'frequentCustomersReport',
      ['Customer', 'Total Orders', 'Customer Type'],
      rows,
      from,
      to
    );
  }

  private async saveCustomReport(
    type: string,
    headers: string[],
    rows: any[],
    from: Date,
    to: Date
  ): Promise<GeneratedReportInfo> {
    await this.ensureBucket();

    const csv = this.toCSV(headers, rows);

    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const stamp = this.ts();
    const fromStr = this.safeDate(from);
    const toStr = this.safeDate(to);

    // No groupBy for these custom reports
    const baseName = `report_${type}_${fromStr}_to_${toStr}_${stamp}_(${timestamp})`;

    // --- CSV Upload ---
    const csvBlob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const csvPath = `${baseName}.csv`;
    await this.uploadFile(this.BUCKET, csvPath, csvBlob, 'text/csv');

    // --- PDF Upload ---
    const pdfPath = `${baseName}.pdf`;
    try {
      const pdfBlob = await this.buildPdfBlob(type, headers, rows);
      await this.uploadFile(this.BUCKET, pdfPath, pdfBlob, 'application/pdf');
    } catch (err) {
      console.warn('PDF failed, CSV saved anyway:', err);
    }

    return {
      bucket: this.BUCKET,
      baseName,
      csvPath,
      pdfPath,
      itemsCount: rows.length,
    };
  }

  async listReports(limit = 100) {
    // Note: Storage list cannot sort by created time; we sort by name (our names embed a timestamp).
    const { data, error } = await this.supabase.storage
      .from(this.BUCKET)
      .list('', {
        limit,
        offset: 0,
        sortBy: { column: 'name', order: 'desc' },
      });
    if (error) throw error;

    const files = (data ?? []).filter((f: any) => f && !f.name.endsWith('/'));

    const byBase = new Map<
      string,
      { base: string; csv: any | null; pdf: any | null }
    >();

    for (const f of files) {
      const base = f.name.replace(/\.(csv|pdf)$/i, '');
      const entry = byBase.get(base) ?? { base, csv: null, pdf: null };
      if (f.name.endsWith('.csv')) entry.csv = { name: f.name };
      else if (f.name.endsWith('.pdf')) entry.pdf = { name: f.name };
      byBase.set(base, entry);
    }

    return Array.from(byBase.values()).sort((a, b) =>
      b.base.localeCompare(a.base)
    );
  }

  async deleteReportByBaseName(baseName: string) {
    const paths = [`${baseName}.csv`, `${baseName}.pdf`];
    const { error } = await this.supabase.storage
      .from(this.BUCKET)
      .remove(paths);
    if (error) throw error;
    return true;
  }

  async getSignedUrl(path: string, expiresSeconds = 3600) {
    return this.signUrl(path, expiresSeconds);
  }

  /* --------------------------------
   * Data fetching & aggregation
   * -------------------------------- */

  private async fetchAndAggregate(
    params: ReportParams
  ): Promise<{ headers: string[]; rows: any[] }> {
    if (params.type === 'byOrders') {
      const { data, error } = await this.supabase
        .from('Orders')
        .select(
          'draft_id, created_at, amount, currency, status, method, full_name, email'
        )

        .gte('created_at', params.from.toISOString())
        .lte('created_at', params.to.toISOString());

      if (error) throw error;

      // Normalize amount cents -> number
      const norm = (data ?? []).map((o: any) => ({
        id: o.draft_id,
        date: o.created_at,
        day: o.created_at ? o.created_at.slice(0, 10) : null,
        name: o.full_name ?? '',
        email: o.email ?? '',
        status: o.status ?? '',
        method: o.method ?? '',
        currency: String(o.currency || 'cad').toUpperCase(),
        amount: this.pickAmount(o),
      }));

      // Group by chosen dimension
      const key = params.groupBy as OrdersGroupBy;
      const groups = new Map<
        string,
        { count: number; total: number; currency: string }
      >();
      for (const r of norm) {
        const k =
          key === 'day'
            ? r.day ?? 'unknown'
            : String((r as any)[key] ?? 'unknown') || 'unknown';
        const g = groups.get(k) ?? { count: 0, total: 0, currency: r.currency };
        g.count += 1;
        g.total += Number(r.amount || 0);
        g.currency = r.currency || g.currency;
        groups.set(k, g);
      }

      const rows = Array.from(groups.entries()).map(([k, g]) => ({
        group: k,
        orders: g.count,
        total: g.total.toFixed(2),
        currency: g.currency,
      }));

      return {
        headers: ['Group', 'Orders', 'Total', 'Currency'],
        rows,
      };
    }

    // byProducts: snapshot of products (supports grouping by name or active)
    const { data, error } = await this.supabase
      .from('Products')
      .select('id, name, price, price_cents, qty, active, created_at');

    if (error) throw error;

    const items = (data ?? []).map((p: any) => ({
      id: p.id,
      name: p.name ?? '',
      qty: Number(p.qty ?? 0),
      price: this.pickPrice(p),
      active: p.active === false ? 'false' : 'true',
    }));

    const key = params.groupBy as ProductsGroupBy;
    if (key === 'name') {
      // one row per product
      return {
        headers: ['Product', 'Qty', 'Unit Price', 'Inventory Value'],
        rows: items.map((i: { name: any; qty: number; price: number }) => ({
          product: i.name,
          qty: i.qty,
          unit_price: i.price.toFixed(2),
          inventory_value: (i.qty * i.price).toFixed(2),
        })),
      };
    }

    // group by active
    const groups = new Map<
      string,
      { count: number; totalQty: number; value: number }
    >();
    for (const i of items) {
      const k = i.active;
      const g = groups.get(k) ?? { count: 0, totalQty: 0, value: 0 };
      g.count += 1;
      g.totalQty += i.qty;
      g.value += i.qty * i.price;
      groups.set(k, g);
    }

    const rows = Array.from(groups.entries()).map(([k, g]) => ({
      group: k,
      products: g.count,
      total_qty: g.totalQty,
      inventory_value: g.value.toFixed(2),
    }));

    return {
      headers: ['Group', 'Products', 'Total Qty', 'Inventory Value'],
      rows,
    };
  }

  /* --------------------------------
   * Storage helpers
   * -------------------------------- */

  private async ensureBucket() {
    // Try HEAD listing; if fails, try to create bucket (will succeed only if policy allows)
    const probe = await this.supabase.storage
      .from(this.BUCKET)
      .list('', { limit: 1 })
      .catch(() => null);
    if (probe) return;

    // Attempt to create (will no-op/throw if anon client has no permission).
    try {
      await this.supabase.storage.createBucket(this.BUCKET, {
        public: false,
        fileSizeLimit: '50MB',
      });
    } catch (e: any) {
      // If 409 or permission error, just proceed—bucket may already exist or must be pre-created on server
      console.warn('Bucket create skipped:', e?.message || e);
    }
  }

  private async uploadFile(
    bucket: string,
    path: string,
    blob: Blob,
    contentType: string
  ) {
    const { error } = await this.supabase.storage
      .from(bucket)
      .upload(path, blob, {
        upsert: true,
        contentType,
      });
    if (error) throw error;
  }

  private async signUrl(path: string, expiresInSeconds: number) {
    const { data, error } = await this.supabase.storage
      .from(this.BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error) throw error;
    return data?.signedUrl as string;
  }

  /* --------------------------------
   * CSV & PDF
   * -------------------------------- */

  private toCSV(headers: string[], rows: any[]) {
    const escape = (v: any) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = headers.map(escape).join(',');
    const body = rows
      .map((r) =>
        headers.map((h) => escape((r as any)[this.headerKey(h)])).join(',')
      )
      .join('\n');
    return `${head}\n${body}\n`;
  }

  // Map human header → object key (kept super simple; adjust as needed)
  private headerKey(h: string) {
    return h.toLowerCase().replace(/ /g, '_').replace(/[^\w]/g, '');
  }

  private async buildPdfBlob(
    title: string,
    headers: string[],
    rows: any[]
  ): Promise<Blob> {
    // Lazy import so SSR/tests don’t choke
    const [{ default: jsPDF }, autoTableModule] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);

    const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(title, 40, 40);

    // Table
    const body = rows.map((r) =>
      headers.map((h) => (r as any)[this.headerKey(h)] ?? '')
    );
    (autoTableModule as any).default(doc, {
      startY: 60,
      head: [headers],
      body,
    });

    const out = doc.output('blob') as Blob;
    return out;
  }

  /* --------------------------------
   * Misc utils
   * -------------------------------- */

  private pickAmount(o: any): number {
    const a = Number(o.amount);
    return Number.isFinite(a) ? a : 0;
  }

  private pickPrice(p: any): number {
    if (typeof p.price_cents === 'number' && Number.isFinite(p.price_cents))
      return p.price_cents / 100;
    const a = Number(p.price);
    return Number.isFinite(a) ? a : 0;
  }

  private ts() {
    // 2025-11-03T16-11-00
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate()
    )}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  }

  private safeDate(d: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /* --------------------------------
   * Services
   * -------------------------------- */

  async getAllServices() {
    return this.supabase
      .from('services')
      .select('*')
      .order('created_at', { ascending: true });
  }

  async addService(payload: any) {
    return this.supabase.from('services').insert(payload).select();
  }

  async updateService(id: string, payload: any) {
    return this.supabase.from('services').update(payload).eq('id', id);
  }

  async deleteService(id: string) {
    return this.supabase.from('services').delete().eq('id', id);
  }

  async uploadServiceAsset(file: File): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error } = await this.supabase.storage
      .from('service-images')
      .upload(filePath, file);

    if (error) throw error;
    return filePath;
  }

  async getServiceImages() {
    const { data, error } = await this.supabase.storage
      .from('service-images')
      .list('', { limit: 100, offset: 0 });
    if (error) throw error;
    return data || [];
  }

  async deleteServiceImage(filePath: string) {
    const { error } = await this.supabase.storage
      .from('service-images')
      .remove([filePath]);
    if (error) throw error;
  }

  async getProductImges() {
    const { data, error } = await this.supabase.storage
      .from('product-images')
      .list('', { limit: 100, offset: 0 });
    if (error) throw error;
    return data || [];
  }

  async getProductsImageUrl() {
    const { data, error } = await this.supabase
      .from('Products')
      .select('imageURL');
    if (error) throw error;
    return data || [];
  }

  async deleteProductImage(filePath: string) {
    const { error } = await this.supabase.storage
      .from('product-images')
      .remove([filePath]);
    if (error) throw error;
  }
}
