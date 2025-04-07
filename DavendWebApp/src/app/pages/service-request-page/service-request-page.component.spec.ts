import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ServiceRequestPageComponent } from './service-request-page.component';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HeaderComponent } from '../../components/header/header.component';
import { FooterComponent } from '../../components/footer/footer.component';

describe('ServiceRequestPageComponent', () => {
  let component: ServiceRequestPageComponent;
  let fixture: ComponentFixture<ServiceRequestPageComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [
        ServiceRequestPageComponent,
        HeaderComponent,
        FooterComponent
      ],
      imports: [
        ReactiveFormsModule,
        HttpClientTestingModule
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ServiceRequestPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with required fields', () => {
    const form = component.requestForm;
    expect(form.get('fullName')).toBeTruthy();
    expect(form.get('email')).toBeTruthy();
    expect(form.get('phoneNumber')).toBeTruthy();
    expect(form.get('message')).toBeTruthy();
    expect(form.get('designFile')).toBeTruthy();
  });

  it('should update selectedService and titleHeader', () => {
    component.selectService('Punch & Die Manufacturing');
    expect(component.selectedService).toBe('Punch & Die Manufacturing');
    expect(component.titleHeader).toBe('Punch & Die Manufacturing Service Request');
  });

  it('should update designFile on file input change', () => {
    const file = new File(['test'], 'design.pdf');
    const event = { target: { files: [file] } } as any;
    component.onFileChange(event);
    expect(component.requestForm.get('designFile')?.value).toBe(file);
  });

  it('should not submit if form is invalid', () => {
    spyOn(component.requestForm, 'markAllAsTouched');
    component.onSubmit();
    expect(component.requestForm.markAllAsTouched).toHaveBeenCalled();
  });

  it('should submit form and open preview on success', () => {
    const file = new File(['design'], 'design.pdf');
    component.requestForm.setValue({
      fullName: 'Test User',
      email: 'test@example.com',
      phoneNumber: '1234567890',
      message: 'Testing',
      designFile: file
    });
    component.selectedService = 'Surface Grinding';

    spyOn(window, 'alert');
    spyOn(window, 'open');

    component.onSubmit();

    const req = httpMock.expectOne('https://davendwebappservice.onrender.com/send-email');
    expect(req.request.method).toBe('POST');
    req.flush({ preview: 'http://preview-link.com' });

    expect(window.alert).toHaveBeenCalledWith('Email sent!');
    expect(window.open).toHaveBeenCalledWith('http://preview-link.com', '_blank');
  });

  it('should alert on submission error', () => {
    const file = new File(['design'], 'design.pdf');
    component.requestForm.setValue({
      fullName: 'Fail User',
      email: 'fail@example.com',
      phoneNumber: '9876543210',
      message: 'Failure',
      designFile: file
    });

    spyOn(window, 'alert');

    component.onSubmit();

    const req = httpMock.expectOne('https://davendwebappservice.onrender.com/send-email');
    req.error(new ErrorEvent('Network error'));

    expect(window.alert).toHaveBeenCalledWith('Failed to send email.');
  });
});
