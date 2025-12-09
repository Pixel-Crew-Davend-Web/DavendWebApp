import { Component, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { PopupService } from '../../services/popup.service';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-service-request-page',
  templateUrl: './service-request-page.component.html',
  styleUrl: './service-request-page.component.css'
})
export class ServiceRequestPageComponent implements OnDestroy {

  services: string[] = [];

  selectedService: string = 'Surface Grinding'; // Default value for selected service

  sending = false;
  
  requestForm: FormGroup;
  emailTitle = '';

  // Preview state
  previewUrl: string | null = null;

  // Config
  readonly allowedTypes = new Set<string>([
    'image/jpeg', 'image/png'
  ]);
  readonly maxSizeMb = 10;

  @ViewChild('reuploadInput', { static: false }) reuploadInput!: ElementRef<HTMLInputElement>;

  constructor(private fb: FormBuilder, private http: HttpClient, private popup: PopupService, private route: ActivatedRoute, private supabase: SupabaseService) {
    this.requestForm = this.fb.group({
      fullName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phoneNumber: ['', Validators.required],
      message: ['', Validators.required],
      designFile: [null, Validators.required]
    });
  }

  ngOnInit() {

    const data = this.supabase.getAllServices().then(({ data }) => {
      if (data) {
        this.services = data.map(s => s.title);
      }
    });

  const selected = this.route.snapshot.queryParamMap.get('service');

  if (selected) {
    const formatted = `[${selected}] --- `;

    this.requestForm.patchValue({
      message: formatted
    });

    this.selectedService = `${selected} Request`; // optional nice touch
  }
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
  }

  get titleHeader() {
    return this.selectedService + ' Service Request';
  }

  selectService(service: string) {
    this.selectedService = service;
    const formatted = `[${service}] --- `;
    this.requestForm.patchValue({ message: formatted });
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
      alert('Only JPG or PNG images are allowed.');
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
    this.previewUrl = objectUrl; // <img> preview
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

    this.sending = true;

    this.http.post('https://davendwebappservice.onrender.com/service-send-email', form)
      .subscribe({
        next: (res: any) => {
          this.sending = false;
          // alert('Email sent!');
          this.popup.success('Service request sent successfully.');
          if (res.preview) window.open(res.preview, '_blank');
          this.requestForm.reset();
          this.removeDesign(false);
        },
        error: () => alert('Failed to send email.')
      });
  }

}
