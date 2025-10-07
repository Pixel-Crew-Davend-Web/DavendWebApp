import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AdminLoginComponent } from './components/admin-login/admin-login.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ManageInventoryComponent } from './pages/manage-inventory/manage-inventory.component';
import { LandingPageComponent } from './pages/landing-page/landing-page.component';
import { HeaderComponent } from './components/header/header.component';
import { FooterComponent } from './components/footer/footer.component';
import { ProductsPageComponent } from './pages/products-page/products-page.component';
import { AboutPageComponent } from './pages/about-page/about-page.component';
import { ServicesPageComponent } from './pages/services-page/services-page.component';
import { ContactPageComponent } from './pages/contact-page/contact-page.component';
import { CheckoutPageComponent } from './pages/checkout-page/checkout-page.component';
import { ServiceRequestPageComponent } from './pages/service-request-page/service-request-page.component';
import { provideHttpClient } from '@angular/common/http';
import { SuccessComponent } from './pages/payment-success/payment-success.component';
import { AdminOrdersComponent } from './pages/admin-orders/admin-orders.component';
import { PopupNotificationComponent } from './components/popup-notification/popup-notification.component';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';
import { TrackOrderComponent } from './pages/track-order/track-order.component'; 


@NgModule({
  declarations: [
    AppComponent,
    AdminLoginComponent,
    ManageInventoryComponent,
    LandingPageComponent,
    HeaderComponent,
    FooterComponent,
    ProductsPageComponent,
    AboutPageComponent,
    ServicesPageComponent,
    ContactPageComponent,
    CheckoutPageComponent,
    ServiceRequestPageComponent,
    SuccessComponent,
    AdminOrdersComponent,
    TrackOrderComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    PopupNotificationComponent,
    ConfirmDialogComponent
],
  providers: [provideHttpClient()],
  bootstrap: [AppComponent]
})
export class AppModule { }
