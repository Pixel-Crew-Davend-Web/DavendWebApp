import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { PopupService } from '../../services/popup.service';

@Component({
  selector: 'app-contact-page',
  templateUrl: './contact-page.component.html',
  styleUrl: './contact-page.component.css'
})
export class ContactPageComponent {
  contactForm: FormGroup;
  sending = false;

  // attachment preview state (we only show name here)
  private attachmentFile: File | null = null;
  attachmentName: string | null = null;

  readonly maxSizeMb = 10;
  readonly allowedTypes = new Set([
    'image/jpeg', 'image/png'
  ]);

  constructor(private fb: FormBuilder, private http: HttpClient, private popup: PopupService) {
    this.contactForm = this.fb.group({
      fullName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      subject: ['', Validators.required],
      message: ['', Validators.required],
      attachment: [null] // optional
    });
  }

  touchedInvalid(ctrl: string): boolean {
    const c = this.contactForm.get(ctrl);
    return !!(c && c.touched && c.invalid);
  }

  onFileChange(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files && input.files[0] ? input.files[0] : null;

    if (!file) {
      this.attachmentFile = null;
      this.attachmentName = null;
      this.contactForm.patchValue({ attachment: null });
      return;
    }

    const sizeMb = file.size / (1024 * 1024);
    if (!this.allowedTypes.has(file.type)) {
      this.popup.error('Only JPG or PNG images are allowed.');
      input.value = '';
      return;
    }
    if (sizeMb > this.maxSizeMb) {
      this.popup.error(`File is too large. Please select a file up to ${this.maxSizeMb}MB.`);
      input.value = '';
      return;
    }

    this.attachmentFile = file;
    this.attachmentName = file.name;
    this.contactForm.patchValue({ attachment: file });
  }

  removeAttachment() {
    this.attachmentFile = null;
    this.attachmentName = null;
    this.contactForm.patchValue({ attachment: null });
    const el = document.getElementById('attachment') as HTMLInputElement | null;
    if (el) el.value = '';
  }

  onSubmit() {
    if (this.contactForm.invalid || this.sending) {
      this.contactForm.markAllAsTouched();
      return;
    }

    // Build multipart form data
    const form = new FormData();
    form.append('fullName', this.contactForm.get('fullName')?.value);
    form.append('email', this.contactForm.get('email')?.value);
    form.append('subject', this.contactForm.get('subject')?.value);
    form.append('message', this.contactForm.get('message')?.value);
    if (this.attachmentFile) form.append('attachment', this.attachmentFile);

    this.sending = true;
    this.http.post('https://davendwebappservice.onrender.com/contact-send-email', form)
      .subscribe({
        next: (res: any) => {
          this.sending = false;
          this.popup.success('Message sent!');
          if (res?.preview) window.open(res.preview, '_blank'); // nodemailer test preview
          this.contactForm.reset();
          this.removeAttachment();
        },
        error: () => {
          this.sending = false;
          this.popup.error('Failed to send message.');
        }
      });
  }
}
