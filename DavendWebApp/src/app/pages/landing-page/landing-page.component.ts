import { Component, HostListener } from '@angular/core';
import { SupabaseService } from '../../services/supabase.service';

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
  featuredService: ServiceItem | null = null;

  // Scroll indicator visibility
  showScrollIndicator = true;

  constructor(private supabase: SupabaseService) {}

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
}
