import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-success',
  templateUrl: './payment-success.component.html',
  styleUrls: ['./payment-success.component.scss']
})
export class SuccessComponent implements OnInit {
  orderId: string | null = null;

  // For demo: mock order data (replace later with API call to Supabase)
  order: any = null;

  constructor(private route: ActivatedRoute) {}

  ngOnInit() {
    this.orderId = this.route.snapshot.paramMap.get('id');

    // Mock example order object
    this.order = {
      id: this.orderId,
      date: new Date(),
      method: 'Visa ending in 1234',
      amount: 45.13,
      customer: {
        fullName: 'John Doe',
        email: 'johnd@industries.ca',
        phone: '9052377634',
        address: '6424 Tillsdown Dr, Unit 20B',
        city: 'Mississauga, ON',
        postalCode: 'L2I 2OP'
      }
    };
  }
}
