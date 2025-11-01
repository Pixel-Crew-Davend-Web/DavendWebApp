import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: [
    './header.component.css',
    './header.mobile.css'
  ]
})
export class HeaderComponent implements OnInit {

  page: string = "/";
  menuOpen = false;
  constructor() {}

  ngOnInit(): void {
    const urlPath = window.location.pathname.toLowerCase();
    this.page = urlPath.split('/')[1] || 'home';
  }

toggleMenu() {
  this.menuOpen = !this.menuOpen;
  const controls = document.querySelector('.mobile-controls');
  if (controls) {
    if (this.menuOpen) controls.classList.add('menu-active');
    else controls.classList.remove('menu-active');
  }
}
}

