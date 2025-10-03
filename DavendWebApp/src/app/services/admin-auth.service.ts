import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import e from 'cors';

@Injectable({
  providedIn: 'root'
})
export class AdminAuthService {
  private loggedIn = new BehaviorSubject<boolean>(this.getStoredLoginState());

  constructor(private supabaseAuth: SupabaseService) {}

  private getStoredLoginState(): boolean {
    return localStorage.getItem('isLoggedIn') === 'true';
  }

  isLoggedIn() {
    return this.loggedIn.asObservable();
  }

  async signUpAdmin(nickName: string, email: string, password: string) {
    const success = await this.supabaseAuth.signUpAdmin(nickName, email, password);
    return success;
  }

  async loginAdmin(email: string, password: string) {
    const success = await this.supabaseAuth.loginAdmin(email, password);
    if (success) {
      const adminID = (await this.supabaseAuth.getAdminIDByEmail(email));
      const adminToken = (await this.supabaseAuth.getAdminToken(adminID)).ADMIN_TOKEN_KEY;
      const adminTokenExpiry = (await this.supabaseAuth.getAdminToken(adminID)).ADMIN_TOKEN_EXPIRY;
      localStorage.setItem('adminTokenExpiry', adminTokenExpiry);
      localStorage.setItem('adminToken', adminToken);
      localStorage.setItem('email', email);
      localStorage.setItem('isLoggedIn', 'true');
      this.loggedIn.next(true);
    }
    return success;
  }

  logoutAdmin() {
    this.supabaseAuth.logoutAdmin(); 
    localStorage.removeItem('isLoggedIn');
    this.loggedIn.next(false);
    // location.reload();
  }

  async getAdminIDByEmail(email: string): Promise<string> {
    return this.supabaseAuth.getAdminIDByEmail(email);
  }

  async isAdminTokenValid(userId: string, localToken?: string): Promise<boolean> {
    const databaseToken = await this.supabaseAuth.getAdminToken(userId, localToken);

    if (!databaseToken || !databaseToken.ADMIN_TOKEN_KEY || !databaseToken.ADMIN_TOKEN_EXPIRY) {
      return false;
    }

    const currentTime = new Date();

    const tokenExpiryTime = new Date(databaseToken.ADMIN_TOKEN_EXPIRY);

    return currentTime < tokenExpiryTime;
  }
}
