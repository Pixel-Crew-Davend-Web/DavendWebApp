import { Component, HostListener } from '@angular/core';
import { SupabaseService } from '../../services/supabase.service';
import { Router } from '@angular/router';

interface ServiceItem {
  id: string;
  title: string;
  description: string;
  image_url: string;
  is_featured: boolean;
}

@Component({
  selector: 'app-landing-page',
  templateUrl: './landing-page.component.html',
  styleUrls: ['./landing-page.component.css']
})
export class LandingPageComponent {

  services: ServiceItem[] = [];
  servicesNames: string[] = [];
  featuredService: ServiceItem | null = null;

  // Scroll indicator visibility
  showScrollIndicator = true;

  constructor(private supabase: SupabaseService, private router: Router) {}

  // Smooth scroll when clicking the indicator
  scrollDown() {
    window.scrollTo({
      top: window.innerHeight,
      behavior: 'smooth'
    });
  }

  async ngOnInit() {
    this.updateIndicator();

    const { data } = await this.supabase.getAllServices();
    if (data) {
      this.featuredService = data.find((s) => s.is_featured) ?? null;
      this.services = data.filter((s) => !s.is_featured);
      this.servicesNames = data.map(s => s.title);
    }
  }

  // Detect scroll position
  @HostListener('window:scroll')
  onScroll() {
    this.updateIndicator();
  }

  private updateIndicator() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    this.showScrollIndicator = scrollTop < 100;
  }

  goToServiceRequest(serviceName: string) {
    this.router.navigate(['/service-request'], {
      queryParams: { service: serviceName },
    });
  }
}
