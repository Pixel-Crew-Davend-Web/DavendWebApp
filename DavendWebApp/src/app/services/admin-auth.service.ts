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
  const result = await fetch("https://davendwebappservice.onrender.com/api/admin/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickName, email, password }),
  }).then(res => res.json());

  return result.success;
}


async loginAdmin(email: string, password: string) {
  const result = await fetch("https://davendwebappservice.onrender.com/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then(res => res.json());

  if (!result.success) return false;

  const adminId = await this.supabaseAuth.getAdminIDByEmail(email);
  const adminNickName = await this.supabaseAuth.getAdminNickNameByID(adminId);

  localStorage.setItem('adminToken', result.adminToken);
  localStorage.setItem('adminTokenExpiry', result.adminTokenExpiry);
  localStorage.setItem('email', email);
  localStorage.setItem('adminNickName', adminNickName);
  localStorage.setItem('isLoggedIn', 'true');
  this.loggedIn.next(true);

  return true;
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
