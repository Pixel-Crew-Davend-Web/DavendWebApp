import { Component } from '@angular/core';
import {
  FormBuilder,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { AdminAuthService } from '../../services/admin-auth.service';
import { Router } from '@angular/router';

function passwordMatchValidator(
  group: AbstractControl
): ValidationErrors | null {
  const password = group.get('password')?.value || '';
  const confirm = group.get('confirmPassword')?.value || '';
  if (!password && !confirm) return null; // both empty => ok (no change)
  return password === confirm ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-account-settings',
  templateUrl: './account-settings.component.html',
  styleUrls: ['./account-settings.component.css'],
})
export class AccountSettingsComponent {
  loading = true;
  saving = false;

  adminId: string | null = null;

  successMsg = '';
  errorMsg = '';

  form = this.fb.group(
    {
      nickName: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(40),
        ],
      ],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.minLength(8)]],
      confirmPassword: [''],
    },
    { validators: passwordMatchValidator }
  );

  constructor(
    private fb: FormBuilder,
    private adminAuth: AdminAuthService,
    private router: Router
  ) {}

  async ngOnInit() {
    try {
      this.loading = true;

      const email = localStorage.getItem('email') || '';
      if (!email) throw new Error('No admin email found in localStorage.');

      // You said you already have: getAdminIDByEmail(email)
      const adminId = await this.adminAuth.getAdminIDByEmail(email);
      if (!adminId) throw new Error('Could not resolve admin id.');

      this.adminId = adminId;

      // Load current values from backend (prefill form)
      const result = await this.adminAuth.getAdminProfile(adminId);
      if (!result?.success)
        throw new Error(result?.message || 'Failed to load admin profile');

      const p = result.profile;
      this.form.patchValue({
        nickName: p.nickName ?? '',
        email: p.email ?? '',
      });
    } catch (e: any) {
      this.errorMsg = e?.message || 'Failed to load settings.';
    } finally {
      this.loading = false;
    }
  }

  get f() {
    return this.form.controls;
  }

  async save() {
    this.successMsg = '';
    this.errorMsg = '';

    if (!this.adminId) {
      this.errorMsg = 'Missing admin id.';
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    try {
      this.saving = true;

      const nickName = this.f.nickName.value?.trim() || '';
      const email = this.f.email.value?.trim() || '';
      const password = this.f.password.value || '';

      const result = await this.adminAuth.updateAdminProfile(
        this.adminId,
        nickName,
        email,
        password
      );

      if (!result?.success) {
        throw new Error(result?.message || 'Update failed');
      }

      // Keep localStorage in sync with what you use elsewhere
      localStorage.setItem('email', email);
      localStorage.setItem('adminNickName', nickName);

      // Clear password fields after successful save
      this.form.patchValue({ password: '', confirmPassword: '' });
      this.form.markAsPristine();

      this.successMsg = 'Account settings updated.';
    } catch (e: any) {
      this.errorMsg = e?.message || 'Failed to update account settings.';
    } finally {
      this.saving = false;
    }
  }

  logout() {
    this.adminAuth.logoutAdmin();
    this.router.navigate(['/login']);
  }
}
