import { AfterViewInit, Component, NgZone } from '@angular/core';

type GReview = google.maps.places.PlaceReview;

@Component({
  selector: 'app-about-page',
  templateUrl: './about-page.component.html',
  styleUrl: './about-page.component.css'
})
export class AboutPageComponent implements AfterViewInit {
  placeId = 'ChIJn4AWttg-K4gR-oHaMu-OcLU'; // e.g. ChIJN1t_tDeuEmsRUsoyG83frY4
  loading = true;
  errorMsg = '';
  placeName = '';
  placeUrl = '';
  rating?: number;
  userRatingsTotal?: number;
  reviews: GReview[] = [];

  constructor(private zone: NgZone) {}

  ngAfterViewInit(): void {
    // Wait for Google to be available (script is async)
    const waitForGoogle = () => {
      console.log('Waiting for Google...');
      if ((window as any).google?.maps?.places) {
        console.log('Google available');
        this.loadReviews();
      } else {
        console.log('Google not available yet');
        requestAnimationFrame(waitForGoogle);
      }
    };
    waitForGoogle();
  }

  private loadReviews(): void {
    console.log('Loading Google reviews...');
    const dummyMapDiv = document.createElement('div'); // PlacesService requires a map or div
    const service = new google.maps.places.PlacesService(dummyMapDiv);

    service.getDetails(
      {
        placeId: this.placeId,
        fields: [
          'name',
          'url',
          'rating',
          'user_ratings_total',
          'reviews' // Google returns up to 5
        ]
      },
      (place, status) => {
        this.zone.run(() => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
            this.errorMsg = 'Could not load Google reviews.';
            this.loading = false;
            return;
          }

          this.placeName = place.name ?? '';
          this.placeUrl = place.url ?? '';
          this.rating = place.rating;
          this.userRatingsTotal = place.user_ratings_total ?? 0;

          // Google TOS: show original content. Optionally sort by recency.
          const reviews = (place.reviews ?? [])
            .sort((a, b) => (b.time ?? 0) - (a.time ?? 0))
            .slice(0, 5);

          this.reviews = reviews;
          this.loading = false;
        });
      }
    );
  }

  stars(n?: number) {
    const v = Math.round((n ?? 0) * 2) / 2; // nearest 0.5
    return { full: Math.floor(v), half: v % 1 !== 0 };
  }

  toDate(sec?: number) {
    return sec ? new Date(sec * 1000) : undefined;
  }
}
