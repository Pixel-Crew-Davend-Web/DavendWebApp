import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { AdminAuthService } from '../../services/admin-auth.service';
import { SupabaseService } from '../../services/supabase.service';
import { PopupService } from '../../services/popup.service';
import { ConfirmService } from '../../services/confirm.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-manage-services',
  templateUrl: './manage-services.component.html',
  styleUrls: ['./manage-services.component.css'],
})
export class ManageServicesComponent implements OnInit {
  readonly DEFAULT_IMAGE_KEY = 'defaults/service-placeholder.jpg';

  services: any[] = [];

  // ADD form
  newService = { title: '', description: '', imageURL: '', is_featured: false };

  // EDIT form
  editingService: any = null;

  // ADD preview state
  selectedAddFile: File | null = null;
  addPreviewUrl: string | null = null;
  showAddImageWarning = false;

  // EDIT preview state
  selectedEditFile: File | null = null;
  editPreviewUrl: string | null = null;

  // Validation
  addErrors = { title: '', description: '' };
  editErrors = { title: '', description: '' };

  // File input references
  @ViewChild('addReuploadInput')
  addReuploadInput!: ElementRef<HTMLInputElement>;
  @ViewChild('editReuploadInput')
  editReuploadInput!: ElementRef<HTMLInputElement>;

  private readonly allowedTypes = new Set(['image/jpeg', 'image/png']);

  constructor(
    private adminAuthService: AdminAuthService,
    private sb: SupabaseService,
    private popup: PopupService,
    private confirm: ConfirmService,
    private router: Router
  ) {}

  async ngOnInit() {
    await this.ensureAdminIsLoggedIn();
    await this.loadServices();
  }

  // ---------------- VALIDATION ------------------

  private validateTitle(v: string): string {
    const t = (v ?? '').trim();
    if (!t) return 'Title is required.';
    if (t.length < 3) return 'Title is too short.';
    if (t.length > 100) return 'Title is too long.';
    return '';
  }

  private validateDesc(v: string): string {
    const d = (v ?? '').trim();
    if (!d) return 'Description is required.';
    if (d.length < 10) return 'Description is too short.';
    return '';
  }

  validateAdd() {
    this.addErrors.title = this.validateTitle(this.newService.title);
    this.addErrors.description = this.validateDesc(this.newService.description);
  }

  validateEdit() {
    this.editErrors.title = this.validateTitle(this.editingService.title);
    this.editErrors.description = this.validateDesc(
      this.editingService.description
    );
  }

  get addFormValid() {
    return (
      !this.addErrors.title &&
      !this.addErrors.description &&
      this.newService.title.trim().length > 0
    );
  }

  get editFormValid() {
    if (!this.editingService) return false;
    return (
      !this.editErrors.title &&
      !this.editErrors.description &&
      this.editingService.title.trim().length > 0
    );
  }

  // ---------------- ADMIN SESSION VALIDATION ------------------

  private async ensureAdminIsLoggedIn() {
    const email = localStorage.getItem('email');
    if (!email) {
      this.adminAuthService.logoutAdmin();
      this.router.navigate(['/login']);
      return;
    }

    const adminID = await this.adminAuthService.getAdminIDByEmail(email);
    const token = localStorage.getItem('adminToken');
    const valid = await this.adminAuthService.isAdminTokenValid(
      adminID,
      token || undefined
    );

    if (!valid) {
      this.popup.error('Session expired.');
      this.adminAuthService.logoutAdmin();
      this.router.navigate(['/login']);
      return;
    }
  }

  logout() {
    this.adminAuthService.logoutAdmin();
    this.router.navigate(['/login']);
  }

  // ---------------- LOAD SERVICES ------------------

  async loadServices() {
    const { data } = await this.sb.getAllServices();
    this.services = data || [];
  }

  // ---------------- IMAGE HELPERS ------------------

  getServiceImageUrl(fileName: string) {
    return `https://oitjgpsicvzplwsbmxyo.supabase.co/storage/v1/object/public/service-images/${fileName}`;
  }

  // ---------------- ADD LOGIC ------------------

  handleAddImageUpload(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    this.clearAddPreview();
    if (!file) return;

    if (!this.allowedTypes.has(file.type)) {
      this.popup.error('Only JPG or PNG images allowed.');
      input.value = '';
      return;
    }

    this.selectedAddFile = file;
    const url = URL.createObjectURL(file);

    this.addPreviewUrl = url;
  }

  clearAddPreview() {
    if (this.addPreviewUrl) URL.revokeObjectURL(this.addPreviewUrl);
    this.selectedAddFile = null;
    this.addPreviewUrl = null;
    this.showAddImageWarning = false;
  }

  triggerAddReupload() {
    this.addReuploadInput.nativeElement.click();
  }

  async addService() {
    this.validateAdd();
    if (!this.addFormValid) {
      this.popup.error('Fix highlighted fields.');
      return;
    }

    if (!this.selectedAddFile && !this.newService.imageURL) {
      this.showAddImageWarning = true;
      return;
    }

    await this._addServiceCore();
  }

  async proceedWithoutAddImage() {
    this.showAddImageWarning = false;
    await this._addServiceCore();
  }

  private async _addServiceCore() {
    try {
      let uploadedPath: string | null = null;

      if (this.selectedAddFile) {
        uploadedPath = await this.sb.uploadServiceAsset(this.selectedAddFile);
      }

      const finalImage =
        uploadedPath ?? this.newService.imageURL ?? this.DEFAULT_IMAGE_KEY;

      await this.sb.addService({
        title: this.newService.title.trim(),
        description: this.newService.description.trim(),
        image_url: finalImage,
        is_featured: this.newService.is_featured,
      });

      this.popup.success('Service added.');
      this.newService = {
        title: '',
        description: '',
        imageURL: '',
        is_featured: false,
      };
      this.addErrors = { title: '', description: '' };
      this.clearAddPreview();
      this.loadServices();
    } catch (e) {
      console.error(e);
      this.popup.error('Failed to add service.');
    }
  }

  // ---------------- EDIT LOGIC ------------------

  editService(service: any) {
    this.editingService = { ...service };
    this.validateEdit();
  }

  handleEditImageUpload(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    this.clearEditPreview();
    if (!file) return;

    if (!this.allowedTypes.has(file.type)) {
      this.popup.error('Only JPG or PNG allowed.');
      input.value = '';
      return;
    }

    this.selectedEditFile = file;
    const url = URL.createObjectURL(file);

    this.editPreviewUrl = url;
  }

  clearEditPreview() {
    if (this.editPreviewUrl) URL.revokeObjectURL(this.editPreviewUrl);
    this.selectedEditFile = null;
    this.editPreviewUrl = null;
  }

  triggerEditReupload() {
    this.editReuploadInput.nativeElement.click();
  }

  async saveEdit() {
    this.validateEdit();
    if (!this.editFormValid) {
      this.popup.error('Fix highlighted fields.');
      return;
    }

    try {
      const oldUrl = this.editingService?.image_url || '';
      const oldFileName = oldUrl.split('/').pop();

      let uploadedPath: string | null = null;

      if (this.selectedEditFile) {
        uploadedPath = await this.sb.uploadServiceAsset(this.selectedEditFile);
      }

      const finalImage = uploadedPath ?? oldUrl ?? this.DEFAULT_IMAGE_KEY;

      await this.sb.updateService(this.editingService.id, {
        title: this.editingService.title.trim(),
        description: this.editingService.description.trim(),
        image_url: finalImage,
        is_featured: this.editingService.is_featured,
      });

      if (uploadedPath && oldFileName) {
        await this.sb.deleteServiceImage(oldFileName);
      }

      this.popup.success('Service updated.');
      this.editingService = null;
      this.editErrors = { title: '', description: '' };
      this.clearEditPreview();
      await this.loadServices();
    } catch (e) {
      console.error(e);
      this.popup.error('Failed to update.');
    }
  }

  cancelEdit() {
    this.editingService = null;
    this.clearEditPreview();
  }

  cancelAddImage() {
    // Clear preview state (releases object URL, resets flags)
    this.clearAddPreview();

    // Also clear the file input element so the same file can be reselected
    if (this.addReuploadInput) {
      this.addReuploadInput.nativeElement.value = '';
    }
  }

  cancelEditImage() {
    // Clear edit preview state
    this.clearEditPreview();

    // Clear the file input element
    if (this.editReuploadInput) {
      this.editReuploadInput.nativeElement.value = '';
    }
  }

  // ---------------- DELETE ------------------

  async deleteService(id: string) {
    const confirmed = await this.confirm.confirm({
      kind: 'danger',
      title: 'Delete service?',
      message: 'This action cannot be undone.',
      okText: 'Delete',
    });

    if (!confirmed) return;

    await this.sb.deleteService(id);
    this.popup.success('Service deleted.');
    this.loadServices();
  }
}
