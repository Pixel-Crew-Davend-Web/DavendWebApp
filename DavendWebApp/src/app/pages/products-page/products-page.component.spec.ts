import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductsPageComponent } from './products-page.component';
import { ProductService } from '../../services/product.service';
import { NO_ERRORS_SCHEMA } from '@angular/core'; // 👈 Ignore unknown components like <app-header>

class MockProductService {
  getProducts = jasmine.createSpy().and.returnValue(Promise.resolve([
    { id: '1', name: 'Punch Tool', imageURL: 'punch.jpg', qty: 10 },
    { id: '2', name: 'Die Cutter', imageURL: 'die.jpg', qty: 5 }
  ]));
}

describe('ProductsPageComponent', () => {
  let component: ProductsPageComponent;
  let fixture: ComponentFixture<ProductsPageComponent>;
  let mockProductService: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ProductsPageComponent],
      providers: [{ provide: ProductService, useClass: MockProductService }],
      schemas: [NO_ERRORS_SCHEMA] // 👈 This tells Angular to ignore custom tags like <app-header>
    }).compileComponents();

    fixture = TestBed.createComponent(ProductsPageComponent);
    component = fixture.componentInstance;
    mockProductService = TestBed.inject(ProductService);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should fetch and initialize products on ngOnInit', async () => {
    await component.ngOnInit();
    expect(mockProductService.getProducts).toHaveBeenCalled();
    expect(component.products.length).toBe(2);
    expect(component.filteredProducts[0].inputQty).toBe(1);
  });

  it('should filter products by search term', () => {
    component.products = [
      { name: 'Punch Tool', inputQty: 1 },
      { name: 'Die Cutter', inputQty: 1 },
      { name: 'Wrench Set', inputQty: 1 }
    ];
    component.searchTerm = 'Die';
    component.filterProducts();
    expect(component.filteredProducts.length).toBe(1);
    expect(component.filteredProducts[0].name).toBe('Die Cutter');
  });

  it('should return correct image URL', () => {
    const fileName = 'test-image.jpg';
    const result = component.getImageUrl(fileName);
    expect(result).toBe('https://tqeazhwfhejsjgrtxhcw.supabase.co/storage/v1/object/public/product-images/' + fileName);
  });
});
