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
        }
      },
      error: (e) => console.error('Failed to load success payload', e),
    });
  }
}
