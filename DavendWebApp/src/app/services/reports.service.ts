import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { SupabaseService } from './supabase.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Types you’ll use from your UI
export type ReportType = 'byProducts' | 'byOrders';
export type OrdersGroupBy = 'day' | 'name' | 'email' | 'status' | 'method';
export type ProductsGroupBy = 'name' | 'active';
export type GroupBy = OrdersGroupBy | ProductsGroupBy;

export interface ReportParams {
  type: ReportType;
  from: Date;     // inclusive
  to: Date;       // inclusive
  groupBy: GroupBy;
}

export interface GeneratedReportInfo {
  bucket: string;
  baseName: string;           // without extension
  csvPath: string;
  pdfPath: string;
  itemsCount: number;
  signedCsvUrl?: string;
  signedPdfUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly BUCKET = 'Reports';
  private sb: SupabaseClient; // supabase-js client

  constructor(private supabaseService: SupabaseService /* SupabaseService */) {
    // ⬇️ Adjust this line to match your SupabaseService shape.
    // e.g., if your service does `client = createClient(...)`,
    // then use: this.sb = this.supabaseService.client;
    this.sb = createClient(
          environment.supabaseURL, // Supabase URL
          environment.supabaseKey // Supabase Key
        );
    if (!this.sb) {
      throw new Error('Supabase client not found. Check SupabaseService exposure.');
    }
  }

  /* --------------------------------
   * Public API
   * -------------------------------- */

  async generateAndStoreReport(params: ReportParams): Promise<GeneratedReportInfo> {
    await this.ensureBucket();

    const { rows, headers } = await this.fetchAndAggregate(params);
    const csv = this.toCSV(headers, rows);

    // Build canonical filenames
    const stamp = this.ts();
    const fromStr = this.safeDate(params.from);
    const toStr = this.safeDate(params.to);
    const baseName =
      `report_${params.type}_${params.groupBy}_${fromStr}_to_${toStr}_${stamp}`;

    const csvBlob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const csvPath = `${baseName}.csv`;

    // Upload CSV
    await this.uploadFile(this.BUCKET, csvPath, csvBlob, 'text/csv');

    // Generate & upload PDF (best-effort: if pdf lib missing, we still succeed with CSV)
    const pdfPath = `${baseName}.pdf`;
    try {
      const pdfBlob = await this.buildPdfBlob(`${params.type} (grouped by ${params.groupBy})`, headers, rows);
      await this.uploadFile(this.BUCKET, pdfPath, pdfBlob, 'application/pdf');
    } catch (err) {
      console.warn('PDF generation failed; continuing with CSV only:', err);
    }

    // Signed URLs (1 hour)
    const signedCsvUrl = await this.signUrl(csvPath, 60 * 60);
    const signedPdfUrl = await this.signUrl(pdfPath, 60 * 60).catch(() => undefined);

    return {
      bucket: this.BUCKET,
      baseName,
      csvPath,
      pdfPath,
      itemsCount: rows.length,
      signedCsvUrl,
      signedPdfUrl
    };
  }

  async listReports(limit = 100) {
    // Note: Storage list cannot sort by created time; we sort by name (our names embed a timestamp).
    const { data, error } = await this.sb.storage.from(this.BUCKET).list('', {
      limit,
      offset: 0,
      sortBy: { column: 'name', order: 'desc' }
    });
    if (error) throw error;

    // Make short signed URLs (CSV/PDF) to preview/download
    // Avoid spamming signed URLs if you’ll render a big table; do it on-demand in the component if needed
    const mapped = await Promise.all(
      (data ?? [])
        .filter((f: any) => f && !f.name.endsWith('/')) // ignore "folders"
        .map(async (f: any) => {
          const path = f.name;
          const signedUrl = await this.signUrl(path, 30 * 60).catch(() => undefined);
          return {
            name: path,
            size: f.metadata?.size ?? f.size ?? null,
            updatedAt: f.updated_at ?? f.created_at ?? null,
            signedUrl
          };
        })
    );

    // Group CSV + PDF siblings (same baseName)
    const byBase = new Map<string, any>();
    for (const file of mapped) {
      const base = file.name.replace(/\.(csv|pdf)$/i, '');
      const entry = byBase.get(base) ?? { base, csv: null, pdf: null };
      if (file.name.endsWith('.csv')) entry.csv = file; else if (file.name.endsWith('.pdf')) entry.pdf = file;
      byBase.set(base, entry);
    }

    // Newest first (by file name timestamp)
    return Array.from(byBase.values()).sort((a, b) => b.base.localeCompare(a.base));
  }

  async deleteReportByBaseName(baseName: string) {
    const paths = [`${baseName}.csv`, `${baseName}.pdf`];
    const { error } = await this.sb.storage.from(this.BUCKET).remove(paths);
    if (error) throw error;
    return true;
  }

  async getSignedUrl(path: string, expiresSeconds = 3600) {
    return this.signUrl(path, expiresSeconds);
  }

  /* --------------------------------
   * Data fetching & aggregation
   * -------------------------------- */

  private async fetchAndAggregate(params: ReportParams): Promise<{ headers: string[]; rows: any[] }> {
    if (params.type === 'byOrders') {
      const { data, error } = await this.sb
        .from('Orders')
        .select('draft_id, created_at, amount, amount_total, currency, status, method, name, email')
        .gte('created_at', params.from.toISOString())
        .lte('created_at', params.to.toISOString());

      if (error) throw error;

      // Normalize amount cents -> number
      const norm = (data ?? []).map((o: any) => ({
        id: o.draft_id,
        date: o.created_at,
        day: o.created_at ? o.created_at.slice(0, 10) : null,
        name: o.name ?? '',
        email: o.email ?? '',
        status: o.status ?? '',
        method: o.method ?? '',
        currency: String(o.currency || 'cad').toUpperCase(),
        amount: this.pickAmount(o)
      }));

      // Group by chosen dimension
      const key = params.groupBy as OrdersGroupBy;
      const groups = new Map<string, { count: number; total: number; currency: string }>();
      for (const r of norm) {
        const k = key === 'day' ? (r.day ?? 'unknown') : (String((r as any)[key] ?? 'unknown') || 'unknown');
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
        currency: g.currency
      }));

      return {
        headers: ['Group', 'Orders', 'Total', 'Currency'],
        rows
      };
    }

    // byProducts: snapshot of products (supports grouping by name or active)
    const { data, error } = await this.sb
      .from('Products')
      .select('id, name, price, price_cents, qty, active, created_at');

    if (error) throw error;

    const items = (data ?? []).map((p: any) => ({
      id: p.id,
      name: p.name ?? '',
      qty: Number(p.qty ?? 0),
      price: this.pickPrice(p),
      active: p.active === false ? 'false' : 'true'
    }));

    const key = params.groupBy as ProductsGroupBy;
    if (key === 'name') {
      // one row per product
      return {
        headers: ['Product', 'Qty', 'Unit Price', 'Inventory Value'],
        rows: items.map((i: { name: any; qty: number; price: number; }) => ({
          product: i.name,
          qty: i.qty,
          unit_price: i.price.toFixed(2),
          inventory_value: (i.qty * i.price).toFixed(2)
        }))
      };
    }

    // group by active
    const groups = new Map<string, { count: number; totalQty: number; value: number }>();
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
      inventory_value: g.value.toFixed(2)
    }));

    return {
      headers: ['Group', 'Products', 'Total Qty', 'Inventory Value'],
      rows
    };
  }

  /* --------------------------------
   * Storage helpers
   * -------------------------------- */

  private async ensureBucket() {
    // Try HEAD listing; if fails, try to create bucket (will succeed only if policy allows)
    const probe = await this.sb.storage.from(this.BUCKET).list('', { limit: 1 }).catch(() => null);
    if (probe) return;

    // Attempt to create (will no-op/throw if anon client has no permission).
    try {
      await this.sb.storage.createBucket(this.BUCKET, {
        public: false,
        fileSizeLimit: '50MB'
      });
    } catch (e: any) {
      // If 409 or permission error, just proceed—bucket may already exist or must be pre-created on server
      console.warn('Bucket create skipped:', e?.message || e);
    }
  }

  private async uploadFile(bucket: string, path: string, blob: Blob, contentType: string) {
    const { error } = await this.sb.storage.from(bucket).upload(path, blob, {
      upsert: true,
      contentType
    });
    if (error) throw error;
  }

  private async signUrl(path: string, expiresInSeconds: number) {
    const { data, error } = await this.sb.storage.from(this.BUCKET).createSignedUrl(path, expiresInSeconds);
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
    const body = rows.map((r) => headers.map((h) => escape((r as any)[this.headerKey(h)])).join(',')).join('\n');
    return `${head}\n${body}\n`;
  }

  // Map human header → object key (kept super simple; adjust as needed)
  private headerKey(h: string) {
    return h
      .toLowerCase()
      .replace(/ /g, '_')
      .replace(/[^\w]/g, '');
  }

  private async buildPdfBlob(title: string, headers: string[], rows: any[]): Promise<Blob> {
    // Lazy import so SSR/tests don’t choke
    const [{ default: jsPDF }, autoTableModule] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable')
    ]);

    const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(title, 40, 40);

    // Table
    const body = rows.map((r) => headers.map((h) => (r as any)[this.headerKey(h)] ?? ''));
    (autoTableModule as any).default(doc, {
      startY: 60,
      head: [headers],
      body
    });

    const out = doc.output('blob') as Blob;
    return out;
  }

  /* --------------------------------
   * Misc utils
   * -------------------------------- */

  private pickAmount(o: any): number {
    // prefer cents field if available
    if (typeof o.amount_total === 'number') return o.amount_total / 100;
    const a = Number(o.amount);
    return Number.isFinite(a) ? a : 0;
    // You can also sum OrderItems if you want subtotal-by-items instead.
  }

  private pickPrice(p: any): number {
    if (typeof p.price_cents === 'number' && Number.isFinite(p.price_cents)) return p.price_cents / 100;
    const a = Number(p.price);
    return Number.isFinite(a) ? a : 0;
  }

  private ts() {
    // 2025-11-03T16-11-00
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  }

  private safeDate(d: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
}