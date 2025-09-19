import { Component, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-service-request-page',
  templateUrl: './service-request-page.component.html',
  styleUrl: './service-request-page.component.css'
})
export class ServiceRequestPageComponent implements OnDestroy {

  services: string[] = [
    'Surface Grinding',
    'Centerless Grinding',
    'Punch & Die Manufacturing',
  ];

  selectedService: string = 'Surface Grinding'; // Default value for selected service
  
  requestForm: FormGroup;
  emailTitle = '';

  // Preview state
  previewUrl: string | null = null;
  previewIsPdf = false;
  previewTrustedUrl: SafeResourceUrl | null = null;

  // Config
  readonly allowedTypes = new Set<string>([
    'image/jpeg', 'image/png', 'application/pdf'
  ]);
  readonly maxSizeMb = 10;

  @ViewChild('reuploadInput', { static: false }) reuploadInput!: ElementRef<HTMLInputElement>;

  constructor(private fb: FormBuilder, private http: HttpClient, private sanitizer: DomSanitizer) {
    this.requestForm = this.fb.group({
      fullName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phoneNumber: ['', Validators.required],
      message: ['', Validators.required],
      designFile: [null, Validators.required]
    });
  }

  // Clean up object URL when component dies
  ngOnDestroy(): void {
    this.revokePreviewUrl();
  }

  private revokePreviewUrl() {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }
    this.previewTrustedUrl = null;
    this.previewIsPdf = false;
  }

  get titleHeader() {
    return this.selectedService + ' Service Request';
  }

  selectService(service: string) {
    this.selectedService = service;
  }

  onFileChange(event: any) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0] ? input.files[0] : null;

    // Reset previous preview
    this.revokePreviewUrl();

    if (!file) {
      // If user canceled picker, keep whatever form had (or null)
      return;
    }

    // Size & type checks
    const sizeMb = file.size / (1024 * 1024);
    if (!this.allowedTypes.has(file.type)) {
      alert('Only JPG/PNG images or PDF files are allowed.');
      input.value = '';
      return;
    }
    if (sizeMb > this.maxSizeMb) {
      alert(`File is too large. Please select a file up to ${this.maxSizeMb}MB.`);
      input.value = '';
      return;
    }

    // Update reactive form control
    this.requestForm.patchValue({ designFile: file });
    this.requestForm.get('designFile')?.markAsTouched();

    // Build preview
    const objectUrl = URL.createObjectURL(file);
    if (file.type === 'application/pdf') {
      this.previewIsPdf = true;
      this.previewUrl = objectUrl;
      this.previewTrustedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl);
    } else {
      this.previewIsPdf = false;
      this.previewUrl = objectUrl; // <img> preview
    }
  }

  triggerReupload() {
    if (this.reuploadInput) this.reuploadInput.nativeElement.click();
  }

  removeDesign(confirmFirst = true) {
    if (confirmFirst) {
      const ok = confirm('Remove the selected file? You can choose a different one after.');
      if (!ok) return;
    }

    // Clear preview + form control + visible inputs
    this.revokePreviewUrl();
    this.requestForm.patchValue({ designFile: null });
    const fileInput = document.getElementById('uploadDesign') as HTMLInputElement | null;
    if (fileInput) fileInput.value = '';
    if (this.reuploadInput) this.reuploadInput.nativeElement.value = '';
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

    const file: File | null = this.requestForm.get('designFile')?.value;

    if (file) form.append('designFile', this.requestForm.get('designFile')?.value);

    this.http.post('https://davendwebappservice.onrender.com/service-send-email', form)
      .subscribe({
        next: (res: any) => {
          alert('Email sent!');
          if (res.preview) window.open(res.preview, '_blank');
          this.removeDesign(false);
          this.requestForm.reset();
        },
        error: () => alert('Failed to send email.')
      });
  }

}
