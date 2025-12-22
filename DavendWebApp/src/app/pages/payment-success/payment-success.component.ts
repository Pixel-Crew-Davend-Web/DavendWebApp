// payment-success.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PaymentService } from '../../services/payment.service';

@Component({
  selector: 'app-success',
  templateUrl: './payment-success.component.html',
  styleUrls: ['./payment-success.component.scss']
})
export class SuccessComponent implements OnInit {
  order: any = null;
  items: any[] = [];

  // mailto fallback (free)
  adminEmail = 'orders.davendpunch@gmail.com';
  mailtoUrl = '';
  summaryText = '';
  copied = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private payment: PaymentService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    this.payment.getSuccessAuto(id).subscribe({
      next: (data: any) => {
        this.order = data?.order;

        const canonicalId = this.order?.id;
        if (canonicalId && canonicalId !== id) {
          this.router.navigate(['/success', canonicalId], { replaceUrl: true });
          return;
        }

        // Try to fetch items too (if order exists in DB)
        const orderId = this.order?.id;
        if (orderId && typeof orderId === 'string' && !orderId.startsWith('cs_')) {
          this.payment.getReceiptByDraftId(orderId).subscribe({
            next: (resp: any) => {
              this.items = resp?.items || [];
              this.buildMailtoAndSummary();
            },
            error: () => {
              // If receipt endpoint fails, still show mailto with basic info
              this.items = [];
              this.buildMailtoAndSummary();
            }
          });
        } else {
          this.items = [];
          this.buildMailtoAndSummary();
        }
      },
      error: (e) => console.error('Failed to load success payload', e),
    });
  }

  private buildMailtoAndSummary() {
    this.copied = false;

    const o = this.order || {};
    const c = o.customer || {};

    const method = String(o.method || '').toUpperCase() || 'ORDER';
    const ref = o.reference || o.id || '';
    const total = Number(o.amount ?? 0).toFixed(2);

    const lines: string[] = [];
    lines.push(`New ${method} order`);
    lines.push(`Ref: ${ref}`);
    lines.push(`Date: ${o.date || ''}`);
    lines.push('');
    lines.push(`Customer: ${c.fullName || ''}`);
    lines.push(`Email: ${c.email || ''}`);
    lines.push(`Phone: ${c.phone || ''}`);
    lines.push('');
    lines.push(`Shipping:`);
    lines.push(`${c.address || ''}`);
    lines.push(`${c.city || ''} ${c.postalCode || ''}`);
    lines.push('');
    lines.push('Items:');

    if (Array.isArray(this.items) && this.items.length) {
      for (const it of this.items) {
        const qty = Number(it.qty ?? 0);
        const price = Number(it.price ?? 0);
        lines.push(`- ${it.name} x ${qty} @ $${price.toFixed(2)} = $${(qty * price).toFixed(2)}`);
      }
    } else {
      lines.push('(items not available)');
    }

    lines.push('');
    lines.push(`Total: $${total} CAD`);

    if (o.message) {
      lines.push('');
      lines.push(`Message: ${o.message}`);
    }

    const subject = `Davend Order (${method})${ref ? ` - ${ref}` : ''}`.trim();
    const body = lines.join('\n');

    this.summaryText = body;
    this.mailtoUrl =
      `mailto:${encodeURIComponent(this.adminEmail)}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;
  }

  async copySummary() {
    try {
      if (!this.summaryText) return;
      await navigator.clipboard.writeText(this.summaryText);
      this.copied = true;
      setTimeout(() => (this.copied = false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  }
}
