import { Component, OnInit } from '@angular/core';
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
  selector: 'app-services-page',
  templateUrl: './services-page.component.html',
  styleUrls: ['./services-page.component.css'],
})
export class ServicesPageComponent implements OnInit {
  services: ServiceItem[] = [];
  featuredService: ServiceItem | null = null;

  constructor(private sb: SupabaseService, private router: Router) {}

  async ngOnInit() {
    const { data } = await this.sb.getAllServices();
    if (data) {
      this.featuredService = data.find((s) => s.is_featured) ?? null;
      this.services = data.filter((s) => !s.is_featured);
    }
  }

  getServiceImageUrl(path: string): string {
    return `https://oitjgpsicvzplwsbmxyo.supabase.co/storage/v1/object/public/service-images/${path}`;
  }

  goToServiceRequest(serviceName: string) {
    this.router.navigate(['/service-request'], {
      queryParams: { service: serviceName },
    });
  }
}
