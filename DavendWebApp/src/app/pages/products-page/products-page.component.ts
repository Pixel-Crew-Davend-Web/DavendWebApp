import { Component } from '@angular/core';
import { ProductService } from '../../services/product.service';
import { PopupService } from '../../services/popup.service';
import { SupabaseService } from '../../services/supabase.service';

type SortKey = '' | 'price-asc' | 'price-desc' | 'qty';

@Component({
  selector: 'app-products-page',
  templateUrl: './products-page.component.html',
  styleUrls: ['./products-page.component.css'],
})
export class ProductsPageComponent {
  products: any[] = [];
  filteredProducts: any[] = [];
  filteredProductsFull: any[] = [];
  searchTerm = '';
  productQty = 1;
  selectedFilter: SortKey = '';

  itemsPerPage = 12;
  currentPage = 1;
  totalPages = 1;

  constructor(
    private productService: ProductService,
    private popup: PopupService,
    private supabase: SupabaseService
  ) {}

  async ngOnInit() {
    const data = await this.supabase.getAllProductsWithVariants();
    this.products = data;
    this.products.forEach((p) => {
      if (p.ProductVariants?.length) {
        p.selectedVariant = p.ProductVariants[0];
      }
    });

    this.filteredProducts = this.products.map((p) => ({ ...p, inputQty: 1 }));
    this.applyAllFilters();
  }

  toNum(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private applyAllFilters(): void {
    let result = [...this.products];

    // ===== Search filter =====
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.description.toLowerCase().includes(term)
      );
    }

    // ===== Sort filter =====
    switch (this.selectedFilter) {
      case 'price-asc':
        result.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'price-desc':
        result.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case 'qty':
        result.sort((a, b) => (b.qty || 0) - (a.qty || 0));
        break;
    }

    // Save full filtered list
    this.filteredProductsFull = result;

    // Reset page when filters/search change
    this.currentPage = 1;

    // Slice display list
    this.updatePagination();
    // const term = (this.searchTerm || '').trim().toLowerCase();

    // let list = this.products.filter((p) => {
    //   const name = String(p.name || '').toLowerCase();
    //   const desc = String(p.description || '').toLowerCase();
    //   return name.includes(term) || desc.includes(term);
    // });

    // switch (this.selectedFilter) {
    //   case 'price-asc':
    //     list = list.sort(
    //       (a, b) =>
    //         this.toNum(a.price) - this.toNum(b.price) ||
    //         String(a.name).localeCompare(String(b.name))
    //     );
    //     break;
    //   case 'price-desc':
    //     list = list.sort(
    //       (a, b) =>
    //         this.toNum(b.price) - this.toNum(a.price) ||
    //         String(a.name).localeCompare(String(b.name))
    //     );
    //     break;
    //   case 'qty':
    //     list = list.sort(
    //       (a, b) =>
    //         this.toNum(b.qty) - this.toNum(a.qty) ||
    //         String(a.name).localeCompare(String(b.name))
    //     );
    //     break;
    //   case '':
    //     list = list.sort((a, b) =>
    //       String(a.name).localeCompare(String(b.name))
    //     );
    //     break;
    // }

    // const oldById = new Map(
    //   this.filteredProducts.map((p) => [p.id, this.toNum(p.inputQty) || 1])
    // );
    // this.filteredProducts = list.map((p) => ({
    //   ...p,
    //   inputQty: oldById.get(p.id) ?? 1,
    // }));
  }

  filterProducts(): void {
    this.applyAllFilters();
  }

  onFilterChange(): void {
    this.applyAllFilters();
  }

  updatePagination() {
    const total = this.filteredProductsFull.length;
    this.totalPages = Math.ceil(total / this.itemsPerPage);

    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;

    this.filteredProducts = this.filteredProductsFull.slice(start, end);
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagination();
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagination();
    }
  }

  getImageUrl(fileName: string): string {
    return `https://oitjgpsicvzplwsbmxyo.supabase.co/storage/v1/object/public/product-images/${fileName}`;
  }

  async addProduct(id: string, qty: any) {
    const q = this.toNum(qty);
    if (!q || q <= 0) return;

    try {
      const cart = JSON.parse(localStorage.getItem('cart') || '[]');
      const idx = cart.findIndex((item: { id: string }) => item.id === id);
      if (idx > -1) cart[idx].qty += q;
      else cart.push({ id, qty: q });

      localStorage.setItem('cart', JSON.stringify(cart));
      const card = this.filteredProducts.find((p) => p.id === id);
      if (card) card.inputQty = 1;

      this.popup.success('Product added to cart!');
    } catch (e) {
      this.popup.error('Failed to add product to cart.');
      console.error('Error adding product to cart:', e);
    }
  }
}
