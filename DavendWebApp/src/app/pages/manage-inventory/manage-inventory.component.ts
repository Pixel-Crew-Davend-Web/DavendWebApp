import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ProductService } from '../../services/product.service';
import { AdminAuthService } from '../../services/admin-auth.service';
import { PopupService } from '../../services/popup.service';
import { Router } from '@angular/router';
import { ConfirmService } from '../../services/confirm.service';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-manage-inventory',
  templateUrl: './manage-inventory.component.html',
  styleUrls: ['./manage-inventory.component.css'],
})
export class ManageInventoryComponent implements OnInit {
  readonly DEFAULT_IMAGE_KEY = 'defaults/product-placeholder.jpg';

  closeVariantModal() {
  this.selectedProductForVariant = null;
  this.variants = [];
  this.newVariant = { size: '', length: '', price: null, qty: null, imageURL: null };
}

closeEditProduct() {
  this.editingProduct = null;
  this.clearEditPreview();
  this.editErrors = { name: '', price: '', qty: '' };
  this.pendingAdditionalFiles = [];
}

  products: any[] = [];
  newProduct = { name: '', description: '', price: 0, qty: 0, imageURL: '' };
  editingProduct: any = null;
  editImageFile: File | null = null;
  selectedImageFile: File | null = null;

  // ADD form preview state
  selectedAddFile: File | null = null;
  addPreviewUrl: string | null = null;
  showAddImageWarning = false;

  // EDIT form preview state
  selectedEditFile: File | null = null;
  editPreviewUrl: string | null = null;

  editingProductImages: any[] = [];
  pendingAdditionalFiles: { file: File; preview: string }[] = [];

  @ViewChild('additionalImagesInput', { static: false })
  additionalImagesInput!: ElementRef<HTMLInputElement>;

  variants: any[] = [];
  selectedProductForVariant: any = null;

  newVariant = {
    size: '',
    length: '',
    price: null,
    qty: null,
    imageURL: null,
  };

  editingVariant: any = null;

  // Form validation error messages
  addErrors = { name: '', price: '', qty: '' };
  editErrors = { name: '', price: '', qty: '' };

  // Re-upload inputs
  @ViewChild('addReuploadInput', { static: false })
  addReuploadInput!: ElementRef<HTMLInputElement>;
  @ViewChild('editReuploadInput', { static: false })
  editReuploadInput!: ElementRef<HTMLInputElement>;

  // Form validation
  get addFormValid(): boolean {
    return (
      !this.addErrors.name &&
      !this.addErrors.price &&
      !this.addErrors.qty &&
      this.newProduct.name.trim().length > 0
    );
  }
  get editFormValid(): boolean {
    if (!this.editingProduct) return false;
    return (
      !this.editErrors.name &&
      !this.editErrors.price &&
      !this.editErrors.qty &&
      String(this.editingProduct.name ?? '').trim().length > 0
    );
  }

  private isEmpty(v: any): boolean {
    return (
      v === null ||
      v === undefined ||
      (typeof v === 'string' && v.trim() === '')
    );
  }

  // Validate fields on change
  private validateName(v: string): string {
    const name = (v ?? '').trim();
    if (!name) return 'Name is required.';
    if (name.length < 2) return 'Name is too short.';
    if (name.length > 80) return 'Name is too long.';
    return '';
  }

  private validatePrice(v: any): string {
    if (this.isEmpty(v)) return 'Price is required.';
    const n = typeof v === 'string' ? Number(v.trim()) : Number(v);
    if (!Number.isFinite(n)) return 'Price must be a number.';
    if (n <= 0) return 'Price must be greater than 0.'; // change to < 0 if you want to allow free items
    if (n > 999999) return 'Price is too large.';
    return '';
  }

  private validateQty(v: any): string {
    if (this.isEmpty(v)) return 'Quantity is required.';
    const n = typeof v === 'string' ? Number(v.trim()) : Number(v);
    if (!Number.isFinite(n)) return 'Quantity must be a number.';
    if (!Number.isInteger(n)) return 'Quantity must be a whole number.';
    if (n < 0) return 'Quantity cannot be negative.';
    if (n > 1000000) return 'Quantity is too large.';
    return '';
  }

  // Call these on input changes
  validateAdd(): void {
    this.addErrors.name = this.validateName(this.newProduct.name);
    this.addErrors.price = this.validatePrice(this.newProduct.price);
    this.addErrors.qty = this.validateQty(this.newProduct.qty);
  }

  validateEdit(): void {
    if (!this.editingProduct) return;
    this.editErrors.name = this.validateName(this.editingProduct.name);
    this.editErrors.price = this.validatePrice(this.editingProduct.price);
    this.editErrors.qty = this.validateQty(this.editingProduct.qty);
  }

  private readonly allowedTypes = new Set<string>([
    'image/jpeg',
    'image/png',
  ]);

  constructor(
    private productService: ProductService,
    private adminAuthService: AdminAuthService,
    private router: Router,
    private popup: PopupService,
    private confirm: ConfirmService,
    private supabaseService: SupabaseService
  ) {}

  async ngOnInit() {
    await this.isAdminTokenValid();
    await this.loadProducts();
  }

  private async isAdminTokenValid(): Promise<void> {
    const adminEmail = localStorage.getItem('email');
    if (!adminEmail) {
      this.adminAuthService.logoutAdmin();
      this.router.navigate(['/login']);
      return;
    }
    const adminID = await this.adminAuthService.getAdminIDByEmail(adminEmail);
    const localToken = localStorage.getItem('adminToken');
    const valid = await this.adminAuthService.isAdminTokenValid(
      adminID,
      localToken || undefined
    );
    if (!valid) {
      this.popup.error('Session expired. Please log in again.');
      this.adminAuthService.logoutAdmin();
      this.router.navigate(['/login']);
    }

    this.popup.info('Admin Session valid!'); // Remove later
  }

  async loadProducts() {
    this.products = await this.productService.getProducts();
  }

  async loadVariants(productId: string) {
    const response = await this.supabaseService.getVariantsByProduct(productId);

    if (response.error) {
      console.error('Error loading variants:', response.error);
      this.variants = [];
      return;
    }

    this.variants = response.data || [];
  }

  async editProduct(product: any) {
    this.editingProduct = { ...product }; // Clone product for editing
    this.validateEdit();

    this.editingProductImages = await this.supabaseService.getProductImages(
      product.id
    );
  }

  async handleAdditionalImagesUpload(event: any) {
    const files = event.target.files as FileList;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      const imagePath = await this.supabaseService.uploadAdditionalProductImage(
        file
      );

      await this.supabaseService.addProductImage(
        this.editingProduct.id,
        imagePath
      );
    }

    // refresh
    this.editingProductImages = await this.supabaseService.getProductImages(
      this.editingProduct.id
    );

    this.popup.success('Images uploaded!');
  }

  async deleteAdditionalImage(img: any) {
    await this.supabaseService.deleteProductImageRecord(img.id, img.image_path);

    this.editingProductImages = await this.supabaseService.getProductImages(
      this.editingProduct.id
    );

    this.popup.success('Image deleted.');
  }

  onSelectAdditionalImages(event: any) {
    const files = event.target.files as FileList;
    this.pendingAdditionalFiles = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const preview = URL.createObjectURL(file);

      this.pendingAdditionalFiles.push({ file, preview });
    }

    this.popup.info(`${files.length} image(s) selected.`);
  }

  async uploadSelectedAdditionalImages() {
    if (!this.pendingAdditionalFiles.length || !this.editingProduct) return;

    for (const item of this.pendingAdditionalFiles) {
      const imagePath = await this.supabaseService.uploadAdditionalProductImage(
        item.file
      );
      await this.supabaseService.addProductImage(
        this.editingProduct.id,
        imagePath
      );
    }

    this.pendingAdditionalFiles = [];
    this.editingProductImages = await this.supabaseService.getProductImages(
      this.editingProduct.id
    );

    this.popup.success('Images uploaded!');
  }

  async addVariant() {
    const variant = {
      product_id: this.selectedProductForVariant.id,
      size: this.newVariant.size,
      length_value: this.newVariant.length,
      price: this.newVariant.price,
      qty: this.newVariant.qty,
    };

    await this.supabaseService.addVariant(variant);
    this.loadVariants(this.selectedProductForVariant.id);
    this.newVariant = {
      size: '',
      length: '',
      price: null,
      qty: null,
      imageURL: null,
    };
  }

  async saveVariant() {
    const { error } = await this.supabaseService.updateVariant(
      this.editingVariant.id,
      {
        size: this.editingVariant.size,
        length_value: this.editingVariant.length,
        price: this.editingVariant.price,
        qty: this.editingVariant.qty,
      }
    );

    if (!error) {
      this.editingVariant = null;
      this.loadVariants(this.selectedProductForVariant.id);
    }
  }

  getImageUrl(fileName: string): string {
    return `https://oitjgpsicvzplwsbmxyo.supabase.co/storage/v1/object/public/product-images/${fileName}`; // CHANGED URL TO oitjgpsicvzplwsbmxyo MIGHT NEED TO CHANGE OTHER FUNCTIONS
  }

  async deleteProduct(id: string) {
    // if (confirm('Are you sure you want to delete this product?')) {
    //   await this.productService.deleteProduct(id);
    //   this.popup.success('Product deleted successfully.');
    //   await this.loadProducts();
    // }
    const ok = await this.confirm.confirm({
      kind: 'danger',
      title: 'Delete product?',
      message: 'This action cannot be undone.',
      okText: 'Delete',
      cancelText: 'Cancel',
    });

    if (!ok) {
      this.popup.info('Product deletion cancelled.');
      return;
    }

    if (ok) {
      await this.productService.deleteProduct(id);
      this.popup.success('Product deleted successfully.');
      await this.loadProducts();
    } else {
      this.popup.info('Product deletion cancelled.');
    }
  }

  async deleteVariant(id: string) {
    const ok = await this.confirm.confirm({
      kind: 'danger',
      title: 'Delete variant?',
      message: 'This action cannot be undone.',
      okText: 'Delete',
      cancelText: 'Cancel',
    });
    if (ok) {
      await this.supabaseService.deleteVariant(id);
      this.popup.success('Variant deleted successfully.');
      await this.loadVariants(this.selectedProductForVariant.id);
    } else {
      this.popup.info('Variant deletion cancelled.');
    }
  }

  selectProduct(product: any) {
    this.selectedProductForVariant = product;
    this.loadVariants(product.id);
  }

  logout() {
    this.adminAuthService.logoutAdmin();
    this.router.navigate(['/login']);
  }

  // ---------- ADD: select file ----------
  handleImageUpload(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files && input.files[0] ? input.files[0] : null;

    this.clearAddPreview();

    if (!file) return;

    // Normalize jpg/jpeg mime → image/jpeg in most browsers
    if (!this.allowedTypes.has(file.type)) {
      this.popup.error('Only JPG or PNG images are allowed.');
      (evt.target as HTMLInputElement).value = ''; // reset input
      return;
    }

    this.selectedAddFile = file;
    const objectUrl = URL.createObjectURL(file);
    this.addPreviewUrl = objectUrl; // image preview
  }

  triggerAddReupload() {
    if (this.addReuploadInput) {
      this.addReuploadInput.nativeElement.click();
    }
  }

  cancelAddImage() {
    this.clearAddPreview();
    // also clear any file input currently used
    if (this.addReuploadInput) this.addReuploadInput.nativeElement.value = '';
  }

  private clearAddPreview() {
    if (this.addPreviewUrl) URL.revokeObjectURL(this.addPreviewUrl);
    this.selectedAddFile = null;
    this.addPreviewUrl = null;
    this.showAddImageWarning = false;
  }

  // ---------- EDIT: select file ----------
  handleEditImageUpload(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files && input.files[0] ? input.files[0] : null;

    this.clearEditPreview();

    if (!file) return;

    if (!this.allowedTypes.has(file.type)) {
      this.popup.error('Only JPG or PNG images are allowed.');
      (evt.target as HTMLInputElement).value = '';
      return;
    }

    this.selectedEditFile = file;
    const objectUrl = URL.createObjectURL(file);
    this.editPreviewUrl = objectUrl;
  }

  triggerEditReupload() {
    if (this.editReuploadInput) {
      this.editReuploadInput.nativeElement.click();
    }
  }

  triggerAdditionalImageSelect() {
    this.additionalImagesInput.nativeElement.click();
  }

  cancelEditImage() {
    this.clearEditPreview();
    if (this.editReuploadInput) this.editReuploadInput.nativeElement.value = '';
  }

  private clearEditPreview() {
    if (this.editPreviewUrl) URL.revokeObjectURL(this.editPreviewUrl);
    this.selectedEditFile = null;
    this.editPreviewUrl = null;
  }

  async addProduct() {
    this.validateAdd();
    if (!this.addFormValid) {
      this.popup.error(
        'Please fix the highlighted fields before adding the product.'
      );
      return;
    }
    // if no image selected, show warning UI rather than hard-blocking
    if (!this.selectedAddFile && !this.newProduct?.imageURL) {
      this.showAddImageWarning = true;
      return; // wait for user to confirm or cancel
    }

    await this._addProductCore();
  }

  // called when user accepts continuing without image
  async proceedWithoutImage() {
    this.showAddImageWarning = false;
    await this._addProductCore();
  }

  private async _addProductCore() {
    try {
      let uploadedPath: string | null = null;

      if (this.selectedAddFile) {
        // recheck types for safety
        if (!this.allowedTypes.has(this.selectedAddFile.type)) {
          this.popup.error('Invalid file type.');
          return;
        }
        uploadedPath = await this.productService.uploadProductAsset(
          this.selectedAddFile
        );
      }

      // Fall back to empty string if no image set (service expects string)
      const finalImageUrl =
        uploadedPath ?? (this.newProduct?.imageURL || this.DEFAULT_IMAGE_KEY);

      await this.productService.addProduct(
        this.newProduct.name.trim(),
        (this.newProduct.description || '').trim(),
        Number(this.newProduct.price),
        Number(this.newProduct.qty),
        finalImageUrl
      );

      this.clearAddPreview();
      // reset form fields if needed...
      this.newProduct = {
        name: '',
        description: '',
        price: 0,
        qty: 0,
        imageURL: '',
      };
      this.addErrors = { name: '', price: '', qty: '' };

      this.popup.success('Product added successfully.');

      await this.loadProducts();
    } catch (e: any) {
      console.error(e);
      this.popup.error('Failed to add product.');
    }
  }

  async saveEdit() {
    this.validateEdit();
    if (!this.editFormValid) {
      this.popup.error(
        'Please fix the highlighted fields before saving changes.'
      );
      return;
    }

    try {
      const oldUrl = this.editingProduct?.imageURL || '';
      const oldFileName = oldUrl.split('/').pop(); // e.g. "123-file.jpg"

      let uploadedPath: string | null = null;

      if (this.selectedEditFile) {
        if (!this.allowedTypes.has(this.selectedEditFile.type)) {
          this.popup.error('Invalid file type.');
          return;
        }
        uploadedPath = await this.productService.uploadProductAsset(
          this.selectedEditFile
        );
      }
      

      const finalImageUrl = uploadedPath ?? oldUrl ?? this.DEFAULT_IMAGE_KEY;

      await this.productService.updateProduct(
        String(this.editingProduct.id),
        String(this.editingProduct.name).trim(),
        String(this.editingProduct.description ?? ''),
        Number(this.editingProduct.price),
        Number(this.editingProduct.qty),
        finalImageUrl
      );

      if (uploadedPath && oldFileName) {
        await this.supabaseService.deleteProductImage(oldFileName);
      }

      this.popup.success('Product updated successfully.');

      this.clearEditPreview();
      this.editingProduct = null;
      this.editErrors = { name: '', price: '', qty: '' };
      await this.loadProducts();
    } catch (e: any) {
      console.error(e);
      this.popup.error('Failed to save changes.');
    }
  }
}
