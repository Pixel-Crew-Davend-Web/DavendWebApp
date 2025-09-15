import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ProductService } from '../../services/product.service';
import { AdminAuthService } from '../../services/admin-auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-manage-inventory',
  templateUrl: './manage-inventory.component.html',
  styleUrls: ['./manage-inventory.component.css']
})
export class ManageInventoryComponent implements OnInit {
  products: any[] = [];
  newProduct = { name: '', description: '', price: 0, qty: 0, imageURL: '' };
  editingProduct: any = null;
  editImageFile: File | null = null;
  selectedImageFile: File | null = null;

    // ADD form preview state
  selectedAddFile: File | null = null;
  addPreviewUrl: string | null = null;
  addPreviewIsPdf = false;
  addPreviewTrustedUrl: SafeResourceUrl | null = null;
  showAddImageWarning = false;

  // EDIT form preview state
  selectedEditFile: File | null = null;
  editPreviewUrl: string | null = null;
  editPreviewIsPdf = false;
  editPreviewTrustedUrl: SafeResourceUrl | null = null;

    // Re-upload inputs
  @ViewChild('addReuploadInput', { static: false }) addReuploadInput!: ElementRef<HTMLInputElement>;
  @ViewChild('editReuploadInput', { static: false }) editReuploadInput!: ElementRef<HTMLInputElement>;

  private readonly allowedTypes = new Set<string>(['image/jpeg', 'application/pdf']);

  constructor(private productService: ProductService, private adminAuthService: AdminAuthService, private router: Router, private sanitizer: DomSanitizer) {}

  async ngOnInit() {
    await this.loadProducts();
  }

  async loadProducts() {
    this.products = await this.productService.getProducts();
  }

  async editProduct(product: any) {
    this.editingProduct = { ...product }; // Clone product for editing
  }
  
  getImageUrl(fileName: string): string {
    return `https://oitjgpsicvzplwsbmxyo.supabase.co/storage/v1/object/public/product-images/${fileName}`; // CHANGED URL TO oitjgpsicvzplwsbmxyo MIGHT NEED TO CHANGE OTHER FUNCTIONS
  }  

  async deleteProduct(id: string) {
    if (confirm('Are you sure you want to delete this product?')) {
      await this.productService.deleteProduct(id);
      await this.loadProducts();
    }
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
      alert('Only JPG/JPEG images or PDF files are allowed.');
      (evt.target as HTMLInputElement).value = ''; // reset input
      return;
    }

    this.selectedAddFile = file;
    const objectUrl = URL.createObjectURL(file);

    if (file.type === 'application/pdf') {
      this.addPreviewIsPdf = true;
      this.addPreviewUrl = objectUrl;
      this.addPreviewTrustedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl);
    } else {
      this.addPreviewIsPdf = false;
      this.addPreviewUrl = objectUrl; // image preview
    }
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
    this.addPreviewIsPdf = false;
    this.addPreviewTrustedUrl = null;
    this.showAddImageWarning = false;
  }

  // ---------- EDIT: select file ----------
  handleEditImageUpload(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files && input.files[0] ? input.files[0] : null;

    this.clearEditPreview();

    if (!file) return;

    if (!this.allowedTypes.has(file.type)) {
      alert('Only JPG/JPEG images or PDF files are allowed.');
      (evt.target as HTMLInputElement).value = '';
      return;
    }

    this.selectedEditFile = file;
    const objectUrl = URL.createObjectURL(file);

    if (file.type === 'application/pdf') {
      this.editPreviewIsPdf = true;
      this.editPreviewUrl = objectUrl;
      this.editPreviewTrustedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl);
    } else {
      this.editPreviewIsPdf = false;
      this.editPreviewUrl = objectUrl;
    }
  }

  triggerEditReupload() {
    if (this.editReuploadInput) {
      this.editReuploadInput.nativeElement.click();
    }
  }

  cancelEditImage() {
    this.clearEditPreview();
    if (this.editReuploadInput) this.editReuploadInput.nativeElement.value = '';
  }

  private clearEditPreview() {
    if (this.editPreviewUrl) URL.revokeObjectURL(this.editPreviewUrl);
    this.selectedEditFile = null;
    this.editPreviewUrl = null;
    this.editPreviewIsPdf = false;
    this.editPreviewTrustedUrl = null;
  }

  // ---------- Hook into your existing submit flows ----------

  async addProduct() {
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
          alert('Invalid file type.');
          return;
        }
        uploadedPath = await this.productService.uploadProductAsset(this.selectedAddFile);
      }

      // Fall back to empty string if no image set (service expects string)
      const finalImageUrl = uploadedPath ?? (this.newProduct?.imageURL || '');

      await this.productService.addProduct(
        this.newProduct.name,
        this.newProduct.description,
        Number(this.newProduct.price),
        Number(this.newProduct.qty),
        finalImageUrl
      );

      this.clearAddPreview();
      // reset form fields if needed...
      this.newProduct = { name:'', description:'', price:0, qty:0, imageURL:'' };

      await this.loadProducts();
    } catch (e:any) {
      console.error(e);
      alert('Failed to add product.');
    }
  }

  async saveEdit() {
    try {
      let uploadedPath: string | null = null;

      if (this.selectedEditFile) {
        if (!this.allowedTypes.has(this.selectedEditFile.type)) {
          alert('Invalid file type.');
          return;
        }
        uploadedPath = await this.productService.uploadProductAsset(this.selectedEditFile);
      }

       const finalImageUrl = uploadedPath ?? (this.editingProduct?.imageURL || '');

      await this.productService.updateProduct(
        String(this.editingProduct.id),
        this.editingProduct.name,
        this.editingProduct.description,
        Number(this.editingProduct.price),
        Number(this.editingProduct.qty),
        finalImageUrl
      );
      this.clearEditPreview();
      this.editingProduct = null;
      await this.loadProducts();
    } catch (e:any) {
      console.error(e);
      alert('Failed to save changes.');
    }
  }
}
