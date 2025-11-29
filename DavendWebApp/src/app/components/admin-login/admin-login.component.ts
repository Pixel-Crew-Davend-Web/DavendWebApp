import { Component } from '@angular/core';
import { AdminAuthService } from '../../services/admin-auth.service';

@Component({
  selector: 'app-admin-login',
  templateUrl: './admin-login.component.html',
  styleUrls: ['./admin-login.component.css']
})
export class AdminLoginComponent {
  email: string = '';
  password: string = '';
  username: string = '';
  logIn: boolean = true;
  isLoggedIn: boolean = false;

  // UI state
  showPassword = false;
  isLoading = false;
  message?: string;
  messageType: 'error' | 'info' = 'info';

  adminNickName: string = '';

  constructor(private adminAuthService: AdminAuthService) {
    this.adminAuthService.isLoggedIn().subscribe(status => {
      this.isLoggedIn = status;
    });
  }

  ngOnInit() {
    this.adminAuthService.isLoggedIn().subscribe(status => {
      this.isLoggedIn = status;
    });

    const urlPath = window.location.pathname.toLowerCase();
    const page = urlPath.split('/')[1] || 'login';

    if (page == "login") {
      this.logIn = true;
    } else if (page == "register") {
      this.logIn = false;
    }

    this.adminNickName = localStorage.getItem('adminNickName') || '';
  }

  async login() {
  try {
    this.isLoading = true;
    await this._doLogin(); // your existing logic
    this.message = undefined;
  } catch (e: any) {
    this.messageType = 'error';
    this.message = e?.message || 'Login failed. Please try again.';
  } finally {
    this.isLoading = false;
    this.adminNickName = localStorage.getItem('adminNickName') || '';
  }
}

async signUp() {
  try {
    this.isLoading = true;
    await this._doSignUp(); // your existing logic
    this.messageType = 'info';
    this.message = 'Admin created successfully.';
  } catch (e: any) {
    this.messageType = 'error';
    this.message = e?.message || 'Sign up failed. Please try again.';
  } finally {
    this.isLoading = false;
  }
}

  async _doSignUp() {
    const success = await this.adminAuthService.signUpAdmin(this.username, this.email, this.password);
    if (!success) {
      throw new Error('Signup failed. Try a different username.');
    }
  }

  async _doLogin() {
    const success = await this.adminAuthService.loginAdmin(this.email, this.password);
    if (!success) {
      throw new Error('Login failed. Check your credentials.');
    }
  }

  changeMode(value: boolean) {
    this.logIn = value
  }

  logout() {
    this.adminAuthService.logoutAdmin();
  }
}
