import { Component } from '@angular/core';
import { ProductService } from '../../services/product.service';

@Component({
  selector: 'app-products-page',
  templateUrl: './products-page.component.html',
  styleUrl: './products-page.component.css'
})
export class ProductsPageComponent {
  products: any[] = []; // Original product list
  filteredProducts: any[] = []; // Filtered product list
  searchTerm: string = ''; // Search term
  productQty: number = 1; // Product quantity
  selectedFilter: '' | 'price-asc' | 'price-desc' | 'qty' = ''; // NOT YET IMPLEMENTED

  constructor(private productService: ProductService) {}

  async ngOnInit() {
    this.products = await this.productService.getProducts();
    this.filteredProducts = this.products.map(product => ({
      ...product,
      inputQty: 1 // 👈 default qty for each product
    }));
  }

  // Filter products in real-time as the user types
  filterProducts() {
    this.filteredProducts = this.products
      .filter(product =>
        product.name.toLowerCase().includes(this.searchTerm.toLowerCase())
      )
      .map(product => ({
        ...product,
        inputQty: product.inputQty || 1
      }));
  }  

  // NOT YET IMPLEMENTED
  onFilterChange() {
    console.log('Filter changed:', this.selectedFilter);
  }

  getImageUrl(fileName: string): string {
    return `https://oitjgpsicvzplwsbmxyo.supabase.co/storage/v1/object/public/product-images/${fileName}`; // CHANGED URL TO oitjgpsicvzplwsbmxyo MIGHT NEED TO CHANGE OTHER FUNCTIONS
  }  

  // Add productrs to cart
  async addProduct(id: string, qty: number) {
    try {
      const productArray = await this.productService.getProductByID(id);

      if (!productArray || productArray.length === 0) {
        console.warn('Product not found with id:', id);
        return;
      }

      // Grab existing cart
      const cart = JSON.parse(localStorage.getItem('cart') || '[]');

      // Check if product is already in cart
      const existingProductIndex = cart.findIndex((item: { id: string }) => item.id === id);

      if (existingProductIndex > -1) {
        // If found, increase qty
        cart[existingProductIndex].qty += qty;
      } else {
        // If not found, add new entry with qty 1
        cart.push({ id, qty: qty });
      }

      // Save updated cart
      localStorage.setItem('cart', JSON.stringify(cart));

      alert('Product added to cart!');

      console.log('Cart updated:', cart);
    } catch (error) {
      console.error('Error adding product to cart:', error);
      console.warn('Product could not be added to cart');
    }
  }

}
