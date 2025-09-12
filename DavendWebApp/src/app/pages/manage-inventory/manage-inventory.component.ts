import { Component, OnInit } from '@angular/core';
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
  
  constructor(private productService: ProductService, private adminAuthService: AdminAuthService, private router: Router) {}
  
  async ngOnInit() {
    await this.loadProducts();
  }
  
  handleImageUpload(event: any) {
    this.selectedImageFile = event.target.files[0];
  }

  handleEditImageUpload(event: any) {
    this.editImageFile = event.target.files[0];
  }

  async loadProducts() {
    this.products = await this.productService.getProducts();
  }

  async addProduct() {
    let imageFilename = '';

    // Upload image if selected
    if (this.selectedImageFile) {
      const fileExt = this.selectedImageFile.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await this.productService.uploadImage(filePath, this.selectedImageFile);
      
      if (uploadError) {
        console.error('Image upload failed:', uploadError);
        return;
      }

      imageFilename = fileName; // Save only filename to DB
    }

    await this.productService.addProduct(
      this.newProduct.name,
      this.newProduct.description,
      this.newProduct.price,
      this.newProduct.qty,
      imageFilename // saved name
    );

    this.newProduct = { name: '', description: '', price: 0, qty: 0, imageURL: '' };
    this.selectedImageFile = null;
    await this.loadProducts();
  }

  async editProduct(product: any) {
    this.editingProduct = { ...product }; // Clone product for editing
  }

  async saveEdit() {
    let imageFilename = this.editingProduct.imageURL; // fallback to existing image
  
    // If new image selected, upload and replace filename
    if (this.editImageFile) {
      const fileExt = this.editImageFile.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;
  
      const { error: uploadError } = await this.productService.uploadImage(filePath, this.editImageFile);
  
      if (uploadError) {
        console.error('Image upload failed during edit:', uploadError);
        return;
      }
  
      imageFilename = fileName; // new image name
    }
  
    await this.productService.updateProduct(
      this.editingProduct.id,
      this.editingProduct.name,
      this.editingProduct.description,
      this.editingProduct.price,
      this.editingProduct.qty,
      imageFilename
    );
  
    this.editingProduct = null;
    this.editImageFile = null;
    await this.loadProducts();
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
}
