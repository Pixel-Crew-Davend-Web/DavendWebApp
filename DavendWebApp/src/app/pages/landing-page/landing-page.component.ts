import { Component } from '@angular/core';
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

  constructor(private supabase: SupabaseService) { }

  async ngOnInit() {
    const { data } = await this.supabase.getAllServices();
    if (data) {
      this.featuredService = data.find((s) => s.is_featured) ?? null;
      this.services = data.filter((s) => !s.is_featured);
    }
  }

}
