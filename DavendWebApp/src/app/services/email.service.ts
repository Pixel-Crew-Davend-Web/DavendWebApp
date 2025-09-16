// email.service.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class EmailService {
  async sendReceipt(orderId: string) {
    console.log(`Receipt sent for order ${orderId}`);
  }

  async sendEtransferInstructions(orderId: string) {
    console.log(`E-Transfer instructions sent for order ${orderId}`);
  }
}
