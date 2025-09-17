import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-service-request-page',
  templateUrl: './service-request-page.component.html',
  styleUrl: './service-request-page.component.css'
})
export class ServiceRequestPageComponent {

  services: string[] = [
    'Surface Grinding',
    'Centerless Grinding',
    'Punch & Die Manufacturing',
  ];

  selectedService: string = 'Surface Grinding'; // Default value for selected service
  
  requestForm: FormGroup;
  emailTitle = '';

  constructor(private fb: FormBuilder, private http: HttpClient) {
    this.requestForm = this.fb.group({
      fullName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phoneNumber: ['', Validators.required],
      message: ['', Validators.required],
      designFile: [null, Validators.required]
    });
  }

  get titleHeader() {
    return this.selectedService + ' Service Request';
  }

  selectService(service: string) {
    this.selectedService = service;
  }

  onFileChange(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.requestForm.patchValue({ designFile: file });
    }
  }

  onSubmit() {
    if (this.requestForm.invalid) {
      this.requestForm.markAllAsTouched();
      return;
    }
  
    const form = new FormData();
    form.append('fullName', this.requestForm.get('fullName')?.value);
    form.append('email', this.requestForm.get('email')?.value);
    form.append('phoneNumber', this.requestForm.get('phoneNumber')?.value);
    form.append('message', this.requestForm.get('message')?.value);
    form.append('selectedService', this.selectedService);
    form.append('designFile', this.requestForm.get('designFile')?.value);

    this.http.post('https://davendwebappservice.onrender.com/service-send-email', form)
      .subscribe({
        next: (res: any) => {
          alert('Email sent!');
          if (res.preview) window.open(res.preview, '_blank');
        },
        error: () => alert('Failed to send email.')
      });
  }

}
