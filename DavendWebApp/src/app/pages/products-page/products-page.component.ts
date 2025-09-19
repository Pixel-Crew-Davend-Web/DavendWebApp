import { Component } from '@angular/core';
import { ProductService } from '../../services/product.service';

type SortKey = '' | 'price-asc' | 'price-desc' | 'qty';

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
  selectedFilter: SortKey = ''; 

  constructor(private productService: ProductService) {}

  async ngOnInit() {
    this.products = await this.productService.getProducts();
    this.filteredProducts = this.products.map(product => ({
      ...product,
      inputQty: 1 // default qty for each product
    }));
  }

  private num(v: any): number {
    // make sure we can sort even if API returns strings
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private applyAllFilters(): void {
    const term = (this.searchTerm || '').trim().toLowerCase();

    // 1) filter by name (you can add description/category if you want)
    let list = this.products.filter(p => {
      const name = String(p.name || '').toLowerCase();
      const desc = String(p.description || '').toLowerCase();
      return name.includes(term) || desc.includes(term);
    });

    // 2) sort by selectedFilter
    switch (this.selectedFilter) {
      case 'price-asc':
        list = list.sort((a, b) => this.num(a.price) - this.num(b.price) || String(a.name).localeCompare(String(b.name)));
        break;
      case 'price-desc':
        list = list.sort((a, b) => this.num(b.price) - this.num(a.price) || String(a.name).localeCompare(String(b.name)));
        break;
      case 'qty':
        // Highest quantity first
        list = list.sort((a, b) => this.num(b.qty) - this.num(a.qty) || String(a.name).localeCompare(String(b.name)));
        break;
      case '':
        list = list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        break;
      default:
        // keep original API order (no sort)
        // If products changed, you could preserve original index and sort by it here.
        break;
    }

    // 3) keep each card’s inputQty (default to 1)
    const oldById = new Map(this.filteredProducts.map(p => [p.id, p.inputQty || 1]));
    this.filteredProducts = list.map(p => ({
      ...p,
      inputQty: oldById.get(p.id) ?? 1
    }));
  }

  // called on (input) in search box
  filterProducts(): void {
    this.applyAllFilters();
  }

  // called on (change) in <select>
  onFilterChange(): void {
    this.applyAllFilters();
  }

  getImageUrl(fileName: string): string {
    return `https://oitjgpsicvzplwsbmxyo.supabase.co/storage/v1/object/public/product-images/${fileName}`;
  }

  async addProduct(id: string, qty: number) {
    try {
      const productArray = await this.productService.getProductByID(id);
      if (!productArray?.length) return;

      const cart = JSON.parse(localStorage.getItem('cart') || '[]');
      const idx = cart.findIndex((item: { id: string }) => item.id === id);
      if (idx > -1) cart[idx].qty += qty;
      else cart.push({ id, qty });

      localStorage.setItem('cart', JSON.stringify(cart));
      alert('Product added to cart!');
    } catch (e) {
      console.error('Error adding product to cart:', e);
    }
  }

}
