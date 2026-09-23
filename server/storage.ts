/**
 * Storage layer — Drizzle ORM + Neon Postgres.
 *
 * All database operations go through Drizzle instead of the old Supabase JS
 * client. The IStorage interface is unchanged so routes.ts and the rest of
 * the app keep working identically.
 */

import { eq, desc, sql } from "drizzle-orm";
import { db } from "./db.js";
import {
  students,
  payments,
  attendance,
  vendors,
  vendorAccounts,
  vendorNeonProjects,
  vendorServicePlans,
  platformSettings,
  type Student,
  type InsertStudent,
  type Payment,
  type InsertPayment,
  type Attendance,
  type InsertAttendance,
  type Vendor,
  type InsertVendor,
  type VendorAccount,
  type InsertVendorAccount,
  type VendorNeonProject,
  type InsertVendorNeonProject,
  type VendorServicePlan,
  type InsertVendorServicePlan,
  type PlatformSettings,
  type VendorServiceChargeSummary,
  type VendorReport,
} from "../shared/schema.js";
import {
  createNeonAuthUser,
  updateNeonAuthUser,
} from "./auth.js";
import { createNeonProject } from "./neon-api.js";
import { encrypt } from "./crypto.js";
import { runMigration } from "./migrate.js";

// ── IStorage interface (unchanged) ────────────────────────────────────

export interface IStorage {
  // Students
  getStudents(): Promise<Student[]>;
  getStudentById(id: number): Promise<Student | undefined>;
  getStudentByRegisterNo(registerNo: string): Promise<Student | undefined>;
  createStudent(student: InsertStudent & { expiryDate?: string | null }): Promise<Student>;
  updateStudent(id: number, student: Partial<InsertStudent> & { expiryDate?: string | null }): Promise<Student>;
  deleteStudent(id: number): Promise<void>;

  // Payments
  getPayments(): Promise<Payment[]>;
  getPaymentById(id: number): Promise<Payment | undefined>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: number, payment: Partial<Omit<InsertPayment, 'studentId' | 'registerNo' | 'studentName'>>): Promise<Payment>;
  deletePayment(id: number): Promise<void>;

  // Vendors
  getVendors(): Promise<Vendor[]>;
  getVendorById(id: number): Promise<Vendor | undefined>;
  createVendor(vendor: InsertVendor, password?: string): Promise<Vendor>;
  updateVendor(id: number, vendor: Partial<InsertVendor>, options?: { password?: string; sessionCookie?: string }): Promise<Vendor>;
  backfillVendorAuthUsers(): Promise<{ created: number; linked: number; failed: number }>;

  // Vendor Accounts
  getVendorAccounts(): Promise<VendorAccount[]>;
  getVendorAccountById(id: number): Promise<VendorAccount | undefined>;
  createVendorAccount(account: InsertVendorAccount): Promise<VendorAccount>;
  updateVendorAccount(id: number, account: Partial<InsertVendorAccount>): Promise<VendorAccount>;
  deleteVendorAccount(id: number): Promise<void>;
  consumeVendorCreditDay(vendorId: number): Promise<VendorAccount | null>;
  isVendorBlocked(vendorId: number): Promise<{ blocked: boolean; availableDays: number; remainingCredits: number; totalCredits: number; usedCredits: number; hasAccount: boolean; vendorName: string; businessName: string | null; phone: string; } | null>;

  // Vendor Neon Projects
  getVendorNeonProjects(): Promise<VendorNeonProject[]>;
  getVendorNeonProjectById(id: number): Promise<VendorNeonProject | undefined>;
  createVendorNeonProject(project: InsertVendorNeonProject): Promise<VendorNeonProject>;
  updateVendorNeonProject(id: number, project: Partial<InsertVendorNeonProject>): Promise<VendorNeonProject>;
  deleteVendorNeonProject(id: number): Promise<void>;
  getAdminNeonConfig(): Promise<{
    authUrl: string | null;
    apiKey: string | null;
    databaseUrl: string | null;
    authSecret: string | null;
    port: number;
  }>;

  // Vendor Service Charge Plans
  getVendorServicePlan(vendorId: number): Promise<VendorServicePlan | null>;
  upsertVendorServicePlan(vendorId: number, plan: Pick<InsertVendorServicePlan, "method" | "perUserCharge" | "defaultPrice">): Promise<VendorServicePlan>;
  getVendorServiceCharge(vendorId: number): Promise<VendorServiceChargeSummary>;

  // Platform Settings
  getPlatformSettings(): Promise<PlatformSettings>;
  updatePlatformSettings(settings: { platformFee: number }): Promise<PlatformSettings>;

  // Reports
  getVendorReport(vendorId: number): Promise<VendorReport | null>;

  // Attendance
  getAttendanceByDate(date: string): Promise<Attendance[]>;
  getTodayAttendanceCount(): Promise<number>;
  createAttendance(attendance: InsertAttendance): Promise<Attendance>;

  // Dashboard stats
  getDashboardStats(): Promise<{
    totalStudents: number;
    activeMemberships: number;
    expiredMemberships: number;
    todayAttendance: number;
  }>;

  // Income stats
  getIncomeStats(): Promise<{
    cashInHand: number;
    onlinePayments: number;
    thisMonthIncome: number;
    thisYearIncome: number;
    totalOverallIncome: number;
    monthlyBreakdown: { month: string; amount: number; paymentCount: number }[];
    averageMonthlyIncome: number;
    totalPaymentsReceived: number;
  }>;
}

// ── Helpers ───────────────────────────────────────────────────────────

function maskSecret(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  return value.length > 3 ? `${value.slice(0, 3)}....` : `${value}....`;
}

// ── DrizzleStorage implementation ─────────────────────────────────────

export class DrizzleStorage implements IStorage {
  // ── Students ─────────────────────────────────────────────────────

  async getStudents(): Promise<Student[]> {
    return db.select().from(students).orderBy(desc(students.id));
  }

  async getStudentById(id: number): Promise<Student | undefined> {
    const rows = await db.select().from(students).where(eq(students.id, id)).limit(1);
    return rows[0];
  }

  async getStudentByRegisterNo(registerNo: string): Promise<Student | undefined> {
    const rows = await db.select().from(students).where(eq(students.registerNo, registerNo)).limit(1);
    return rows[0];
  }

  async createStudent(student: InsertStudent & { expiryDate?: string | null }): Promise<Student> {
    const rows = await db.insert(students).values({
      registerNo: student.registerNo,
      name: student.name,
      phone: student.phone,
      address: student.address,
      joinDate: student.joinDate,
      expiryDate: student.expiryDate || null,
    }).returning();
    return rows[0];
  }

  async updateStudent(id: number, student: Partial<InsertStudent> & { expiryDate?: string | null }): Promise<Student> {
    const updateData: Record<string, unknown> = {};
    if (student.registerNo !== undefined) updateData.registerNo = student.registerNo;
    if (student.name !== undefined) updateData.name = student.name;
    if (student.phone !== undefined) updateData.phone = student.phone;
    if (student.address !== undefined) updateData.address = student.address;
    if (student.joinDate !== undefined) updateData.joinDate = student.joinDate;
    if (student.expiryDate !== undefined) updateData.expiryDate = student.expiryDate;

    const rows = await db.update(students).set(updateData).where(eq(students.id, id)).returning();
    return rows[0];
  }

  async deleteStudent(id: number): Promise<void> {
    await db.delete(students).where(eq(students.id, id));
  }

  // ── Payments ─────────────────────────────────────────────────────

  async getPayments(): Promise<Payment[]> {
    return db.select().from(payments).orderBy(desc(payments.id));
  }

  async getPaymentById(id: number): Promise<Payment | undefined> {
    const rows = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
    return rows[0];
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const rows = await db.insert(payments).values({
      tokenNumber: payment.tokenNumber,
      date: payment.date,
      studentId: payment.studentId,
      registerNo: payment.registerNo,
      studentName: payment.studentName,
      duration: payment.duration,
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
    }).returning();
    return rows[0];
  }

  async updatePayment(id: number, payment: Partial<Omit<InsertPayment, 'studentId' | 'registerNo' | 'studentName'>>): Promise<Payment> {
    const updateData: Record<string, unknown> = {};
    if (payment.tokenNumber !== undefined) updateData.tokenNumber = payment.tokenNumber;
    if (payment.date !== undefined) updateData.date = payment.date;
    if (payment.duration !== undefined) updateData.duration = payment.duration;
    if (payment.amount !== undefined) updateData.amount = payment.amount;
    if (payment.paymentMethod !== undefined) updateData.paymentMethod = payment.paymentMethod;

    const rows = await db.update(payments).set(updateData).where(eq(payments.id, id)).returning();
    return rows[0];
  }

  async deletePayment(id: number): Promise<void> {
    await db.delete(payments).where(eq(payments.id, id));
  }

  // ── Vendors ──────────────────────────────────────────────────────

  async getVendors(): Promise<Vendor[]> {
    return db.select().from(vendors).orderBy(desc(vendors.id));
  }

  async getVendorById(id: number): Promise<Vendor | undefined> {
    const rows = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
    return rows[0];
  }

  async createVendor(vendor: InsertVendor, password?: string): Promise<Vendor> {
    // 1. Create the Neon Auth login FIRST — if this fails we must not
    //    insert a vendor that can never sign in (Neon Auth min password = 8).
    let authUid: string | null = null;
    if (password) {
      const authEmail = `${vendor.phone}@gmail.com`;
      const displayName = [vendor.firstName, vendor.lastName].filter(Boolean).join(" ").trim();
      const result = await createNeonAuthUser(authEmail, password, displayName);
      if (result.id) {
        authUid = result.id;
      } else {
        // Surface the real reason (e.g. "Password too short") to the admin UI.
        throw new Error(`Login not created: ${result.error || "unknown auth error"}`);
      }
    }

    // 2. Vendor record in central DB
    const rows = await db.insert(vendors).values({
      firstName: vendor.firstName,
      lastName: vendor.lastName || "",
      phone: vendor.phone,
      email: vendor.email || null,
      businessName: vendor.businessName || null,
      gstNumber: vendor.gstNumber || null,
      panNumber: vendor.panNumber || null,
      addressLine1: vendor.addressLine1 || null,
      addressLine2: vendor.addressLine2 || null,
      city: vendor.city || null,
      state: vendor.state || null,
      zipcode: vendor.zipcode || null,
      areaName: vendor.areaName || null,
      status: vendor.status || "active",
      authUid,
    }).returning();
    const newVendor = rows[0];

    // 3. Auto-provision Neon project for this gym
    try {
      // Prioritize the vendor's Business/Gym Name for the Neon project name
      const rawName = vendor.businessName?.trim() || `Gym-${vendor.firstName}`;
      const projectName = rawName
        .replace(/[^a-zA-Z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || `Gym-${newVendor.id}`;
      const project = await createNeonProject(projectName);

      // Get connection string from the new project
      const connUri = project.connection_uris?.[0]?.pooler_connection_uri;
      if (connUri) {
        // 4. Run migration on the new project
        const migrationResult = await runMigration(connUri);
        if (!migrationResult.success) {
          console.error("Migration failed for new project:", migrationResult.error);
        }

        // 5. Encrypt and store credentials
        const encryptedProject = await db.insert(vendorNeonProjects).values({
          vendorId: newVendor.id,
          authUrl: encrypt(project.connection_uris?.[0]?.host || ""),
          apiKey: encrypt(project.connection_uris?.[0]?.api_password || ""),
          databaseUrl: encrypt(connUri),
          authSecret: encrypt(project.connection_uris?.[0]?.password || ""),
          port: 5000,
        }).returning();

        console.log(`[storage] Auto-provisioned Neon project for vendor #${newVendor.id}: ${projectName}`);
      }
    } catch (error: any) {
      console.error("[storage] Neon project auto-provisioning failed:", error.message);
      // Don't fail vendor creation if provisioning fails
    }

    return { ...newVendor, authUid };
  }

  async updateVendor(id: number, vendor: Partial<InsertVendor>, options?: { password?: string }): Promise<Vendor> {
    const updateData: Record<string, unknown> = {};
    if (vendor.firstName !== undefined) updateData.firstName = vendor.firstName;
    if (vendor.lastName !== undefined) updateData.lastName = vendor.lastName;
    if (vendor.phone !== undefined) updateData.phone = vendor.phone;
    if (vendor.email !== undefined) updateData.email = vendor.email;
    if (vendor.businessName !== undefined) updateData.businessName = vendor.businessName;
    if (vendor.gstNumber !== undefined) updateData.gstNumber = vendor.gstNumber;
    if (vendor.panNumber !== undefined) updateData.panNumber = vendor.panNumber;
    if (vendor.addressLine1 !== undefined) updateData.addressLine1 = vendor.addressLine1;
    if (vendor.addressLine2 !== undefined) updateData.addressLine2 = vendor.addressLine2;
    if (vendor.city !== undefined) updateData.city = vendor.city;
    if (vendor.state !== undefined) updateData.state = vendor.state;
    if (vendor.zipcode !== undefined) updateData.zipcode = vendor.zipcode;
    if (vendor.areaName !== undefined) updateData.areaName = vendor.areaName;
    if (vendor.status !== undefined) updateData.status = vendor.status;

    // Sync Firebase Auth user if phone/password/name changes
    const current = await this.getVendorById(id);
    if (current?.authUid) {
      const authUpdates: { email?: string; password?: string; name?: string } = {};
      if (vendor.phone !== undefined) authUpdates.email = `${vendor.phone}@gmail.com`;
      if (options?.password) authUpdates.password = options.password;
      if (vendor.firstName !== undefined || vendor.lastName !== undefined) {
        const firstName = vendor.firstName ?? current.firstName;
        const lastName = vendor.lastName ?? current.lastName;
        authUpdates.name = `${firstName} ${lastName}`.trim();
      }
      if (Object.keys(authUpdates).length > 0) {
        const authResult = await updateNeonAuthUser(current.authUid, authUpdates);
        if (authResult.error) {
          throw new Error(`Auth sync failed: ${authResult.error}`);
        }
      }
    } else if (options?.password) {
      // Vendor has no linked auth user yet — create one with Firebase Auth.
      const firstName = vendor.firstName ?? current?.firstName ?? "";
      const lastName = vendor.lastName ?? current?.lastName ?? "";
      const phone = vendor.phone ?? current?.phone;
      if (phone) {
        const result = await createNeonAuthUser(
          `${phone}@gmail.com`,
          options.password,
          `${firstName} ${lastName}`.trim()
        );
        if (result.id) {
          await db.update(vendors).set({ authUid: result.id }).where(eq(vendors.id, id));
        } else {
          throw new Error(`Login not created: ${result.error || "unknown auth error"}`);
        }
      }
    }

    const rows = await db.update(vendors).set(updateData).where(eq(vendors.id, id)).returning();
    return rows[0];
  }

  async backfillVendorAuthUsers(): Promise<{ created: number; linked: number; failed: number }> {
    const result = { created: 0, linked: 0, failed: 0 };
    try {
      const allVendors = await this.getVendors();
      for (const v of allVendors) {
        if (v.authUid) {
          result.linked++;
          continue;
        }
        try {
          const email = `${v.phone}@gmail.com`;
          const res = await createNeonAuthUser(email, v.phone, `${v.firstName} ${v.lastName}`.trim());
          if (res.id) {
            await db.update(vendors).set({ authUid: res.id }).where(eq(vendors.id, v.id));
            result.created++;
          } else {
            result.failed++;
          }
        } catch {
          result.failed++;
        }
      }
    } catch (error) {
      console.error("backfillVendorAuthUsers failed:", error);
    }
    return result;
  }

  // ── Vendor Accounts ──────────────────────────────────────────────

  async getVendorAccounts(): Promise<VendorAccount[]> {
    return db.select().from(vendorAccounts).orderBy(desc(vendorAccounts.id));
  }

  async getVendorAccountById(id: number): Promise<VendorAccount | undefined> {
    const rows = await db.select().from(vendorAccounts).where(eq(vendorAccounts.id, id)).limit(1);
    return rows[0];
  }

  async createVendorAccount(account: InsertVendorAccount): Promise<VendorAccount> {
    const rows = await db.insert(vendorAccounts).values({
      vendorId: account.vendorId,
      availableDays: account.availableDays ?? 0,
      creditDays: account.creditDays ?? 0,
      usedCredits: account.usedCredits ?? 0,
      lastBillingDate: account.lastBillingDate ?? null,
    }).returning();
    return rows[0];
  }

  async updateVendorAccount(id: number, account: Partial<InsertVendorAccount>): Promise<VendorAccount> {
    const updateData: Record<string, unknown> = {};
    if (account.vendorId !== undefined) updateData.vendorId = account.vendorId;
    if (account.availableDays !== undefined) updateData.availableDays = account.availableDays;
    if (account.creditDays !== undefined) updateData.creditDays = account.creditDays;
    if (account.usedCredits !== undefined) updateData.usedCredits = account.usedCredits;
    if (account.lastBillingDate !== undefined) updateData.lastBillingDate = account.lastBillingDate;

    const rows = await db.update(vendorAccounts).set(updateData).where(eq(vendorAccounts.id, id)).returning();
    return rows[0];
  }

  async deleteVendorAccount(id: number): Promise<void> {
    await db.delete(vendorAccounts).where(eq(vendorAccounts.id, id));
  }

  async consumeVendorCreditDay(vendorId: number): Promise<VendorAccount | null> {
    const rows = await db.select().from(vendorAccounts).where(eq(vendorAccounts.vendorId, vendorId)).limit(1);
    const existing = rows[0];
    if (!existing) return null;

    const { availableDays, creditDays, usedCredits } = existing;

    if (availableDays > 0) {
      const updated = await db.update(vendorAccounts)
        .set({ availableDays: availableDays - 1 })
        .where(eq(vendorAccounts.id, existing.id))
        .returning();
      return updated[0];
    }

    const remainingCredits = creditDays - usedCredits;
    if (remainingCredits <= 0) return existing;

    const updated = await db.update(vendorAccounts)
      .set({ usedCredits: usedCredits + 1 })
      .where(eq(vendorAccounts.id, existing.id))
      .returning();
    return updated[0];
  }

  async isVendorBlocked(vendorId: number): Promise<{ blocked: boolean; availableDays: number; remainingCredits: number; totalCredits: number; usedCredits: number; hasAccount: boolean; vendorName: string; businessName: string | null; phone: string; } | null> {
    const vendor = await this.getVendorById(vendorId);
    if (!vendor) return null;

    const rows = await db.select().from(vendorAccounts).where(eq(vendorAccounts.vendorId, vendorId)).limit(1);
    const existing = rows[0];

    const availableDays = existing?.availableDays ?? 0;
    const creditDays = existing?.creditDays ?? 0;
    const usedCredits = existing?.usedCredits ?? 0;
    const remainingCredits = Math.max(creditDays - usedCredits, 0);
    const hasAccount = !!existing;
    const blocked = hasAccount && availableDays <= 0 && remainingCredits <= 0;

    return {
      blocked,
      availableDays,
      remainingCredits,
      totalCredits: creditDays,
      usedCredits,
      hasAccount,
      vendorName: `${vendor.firstName} ${vendor.lastName}`.trim(),
      businessName: vendor.businessName ?? null,
      phone: vendor.phone,
    };
  }

  // ── Vendor Neon Projects ─────────────────────────────────────────

  async getVendorNeonProjects(): Promise<VendorNeonProject[]> {
    return db.select().from(vendorNeonProjects).orderBy(desc(vendorNeonProjects.id));
  }

  async getVendorNeonProjectById(id: number): Promise<VendorNeonProject | undefined> {
    const rows = await db.select().from(vendorNeonProjects).where(eq(vendorNeonProjects.id, id)).limit(1);
    return rows[0];
  }

  async createVendorNeonProject(project: InsertVendorNeonProject): Promise<VendorNeonProject> {
    const rows = await db.insert(vendorNeonProjects).values({
      vendorId: project.vendorId,
      authUrl: project.authUrl,
      apiKey: project.apiKey,
      databaseUrl: project.databaseUrl,
      authSecret: project.authSecret,
      port: project.port ?? 5000,
    }).returning();
    return rows[0];
  }

  async updateVendorNeonProject(id: number, project: Partial<InsertVendorNeonProject>): Promise<VendorNeonProject> {
    const updateData: Record<string, unknown> = {};
    if (project.vendorId !== undefined) updateData.vendorId = project.vendorId;
    if (project.authUrl !== undefined) updateData.authUrl = project.authUrl;
    if (project.apiKey !== undefined) updateData.apiKey = project.apiKey;
    if (project.databaseUrl !== undefined) updateData.databaseUrl = project.databaseUrl;
    if (project.authSecret !== undefined) updateData.authSecret = project.authSecret;
    if (project.port !== undefined) updateData.port = project.port;

    const rows = await db.update(vendorNeonProjects).set(updateData).where(eq(vendorNeonProjects.id, id)).returning();
    return rows[0];
  }

  async deleteVendorNeonProject(id: number): Promise<void> {
    await db.delete(vendorNeonProjects).where(eq(vendorNeonProjects.id, id));
  }

  async getAdminNeonConfig() {
    return {
      authUrl: null,
      apiKey: null,
      databaseUrl: maskSecret(process.env.NEON_DATABASE_URL),
      authSecret: null,
      port: Number(process.env.PORT) || 5000,
    };
  }

  // ── Vendor Service Charge Plans ──────────────────────────────────

  async getVendorServicePlan(vendorId: number): Promise<VendorServicePlan | null> {
    const rows = await db.select().from(vendorServicePlans).where(eq(vendorServicePlans.vendorId, vendorId)).limit(1);
    return rows[0] ?? null;
  }

  async upsertVendorServicePlan(
    vendorId: number,
    plan: Pick<InsertVendorServicePlan, "method" | "perUserCharge" | "defaultPrice">
  ): Promise<VendorServicePlan> {
    // Try update first
    const updated = await db.update(vendorServicePlans)
      .set({
        method: plan.method,
        perUserCharge: plan.perUserCharge,
        defaultPrice: plan.defaultPrice,
      })
      .where(eq(vendorServicePlans.vendorId, vendorId))
      .returning();

    if (updated[0]) return updated[0];

    // Insert if not exists
    const inserted = await db.insert(vendorServicePlans).values({
      vendorId,
      method: plan.method,
      perUserCharge: plan.perUserCharge,
      defaultPrice: plan.defaultPrice,
    }).returning();
    return inserted[0];
  }

  async getVendorServiceCharge(vendorId: number): Promise<VendorServiceChargeSummary> {
    const [plan, platform] = await Promise.all([
      this.getVendorServicePlan(vendorId),
      this.getPlatformSettings(),
    ]);

    const method = plan?.method === "fixed" ? "fixed" : "per_user";
    const perUserCharge = plan?.perUserCharge ?? 1;
    const defaultPrice = plan?.defaultPrice ?? 199;
    const platformFee = platform.platformFee;

    let userCount: number | null = null;
    let hasKeys = false;

    // Check if the vendor has Neon project credentials
    const keyRows = await db.select().from(vendorNeonProjects)
      .where(eq(vendorNeonProjects.vendorId, vendorId))
      .limit(1);

    if (keyRows[0]) {
      hasKeys = true;
      try {
        // Query the vendor's own database for user count
        const { getDb } = await import("./db.js");
        const vendorDb = getDb(keyRows[0].databaseUrl);
        const countResult = await vendorDb.select({ count: sql<number>`count(*)::int` }).from(students);
        userCount = countResult[0]?.count ?? 0;
      } catch (error) {
        console.error("Error fetching user count for service charge:", error);
      }
    }

    const users = userCount ?? 0;
    const serviceCharge = method === "fixed"
      ? defaultPrice
      : Math.max(users * perUserCharge, defaultPrice);
    const total = serviceCharge + platformFee;

    return {
      vendorId,
      method,
      perUserCharge,
      defaultPrice,
      platformFee,
      userCount,
      serviceCharge,
      total,
      hasKeys,
    };
  }

  // ── Platform Settings ────────────────────────────────────────────

  async getPlatformSettings(): Promise<PlatformSettings> {
    const rows = await db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);

    if (!rows[0]) {
      const now = new Date();
      return {
        id: 1,
        platformFee: 999,
        createdAt: now,
        updatedAt: now,
      };
    }

    return rows[0];
  }

  async updatePlatformSettings(settings: { platformFee: number }): Promise<PlatformSettings> {
    const existing = await this.getPlatformSettings();

    if (existing.id === 1 && existing.platformFee === 999 && !existing.createdAt) {
      // Row doesn't exist yet, insert it
      const rows = await db.insert(platformSettings).values({
        id: 1,
        platformFee: settings.platformFee,
      }).returning();
      return rows[0];
    }

    // Upsert
    const rows = await db.insert(platformSettings).values({
      id: 1,
      platformFee: settings.platformFee,
    }).onConflictDoUpdate({
      target: platformSettings.id,
      set: {
        platformFee: settings.platformFee,
        updatedAt: new Date(),
      },
    }).returning();
    return rows[0];
  }

  // ── Reports ──────────────────────────────────────────────────────

  async getVendorReport(vendorId: number): Promise<VendorReport | null> {
    const keyRows = await db.select().from(vendorNeonProjects)
      .where(eq(vendorNeonProjects.vendorId, vendorId))
      .limit(1);

    const keyRow = keyRows[0];
    if (!keyRow) return null;

    try {
      const { getDb } = await import("./db.js");
      const vendorDb = getDb(keyRow.databaseUrl);

      const [allStudents, allPayments, allAttendance] = await Promise.all([
        vendorDb.select().from(students),
        vendorDb.select().from(payments),
        vendorDb.select().from(attendance),
      ]);

      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      const totalMembers = allStudents.length;
      const activeMembers = allStudents.filter(
        (s) => s.expiryDate && new Date(s.expiryDate) > now
      ).length;

      const sumAmount = (rows: typeof allPayments) =>
        rows.reduce((sum, p) => sum + (p.amount || 0), 0);

      const cashInHand = sumAmount(allPayments.filter((p) => p.paymentMethod === "cash"));
      const onlinePayments = sumAmount(allPayments.filter((p) => p.paymentMethod === "online"));
      const thisMonthIncome = sumAmount(
        allPayments.filter((p) => {
          const d = new Date(p.date);
          return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
        })
      );
      const totalIncome = sumAmount(allPayments);
      const todayAttendance = allAttendance.filter((a) => a.date === today).length;

      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
      ];

      const monthlyBreakdown = monthNames.map((month, index) => {
        const monthPayments = allPayments.filter((p) => {
          const d = new Date(p.date);
          return d.getFullYear() === currentYear && d.getMonth() === index;
        });
        return {
          month,
          amount: sumAmount(monthPayments),
          count: monthPayments.length,
        };
      });

      return {
        totalMembers,
        activeMembers,
        expiredMembers: totalMembers - activeMembers,
        todayAttendance,
        cashInHand,
        onlinePayments,
        thisMonthIncome,
        totalIncome,
        totalPayments: allPayments.length,
        monthlyBreakdown,
      };
    } catch (error) {
      console.error("Error building vendor report:", error);
      throw error;
    }
  }

  // ── Attendance ───────────────────────────────────────────────────

  async getAttendanceByDate(date: string): Promise<Attendance[]> {
    return db.select().from(attendance).where(eq(attendance.date, date));
  }

  async getTodayAttendanceCount(): Promise<number> {
    const today = new Date().toISOString().split("T")[0];
    const rows = await db.select({ count: sql<number>`count(*)::int` }).from(attendance).where(eq(attendance.date, today));
    return rows[0]?.count ?? 0;
  }

  async createAttendance(att: InsertAttendance): Promise<Attendance> {
    const rows = await db.insert(attendance).values({
      date: att.date,
      registerNo: att.registerNo,
      studentName: att.studentName,
      timeIn: att.timeIn,
    }).returning();
    return rows[0];
  }

  // ── Dashboard stats ──────────────────────────────────────────────

  async getDashboardStats() {
    const [allStudents, allAttendance] = await Promise.all([
      db.select().from(students),
      db.select().from(attendance),
    ]);

    const today = new Date().toISOString().split("T")[0];
    const todayAttendance = allAttendance.filter((a) => a.date === today).length;

    const now = new Date();
    const activeMemberships = allStudents.filter((s) => {
      if (!s.expiryDate) return false;
      return new Date(s.expiryDate) > now;
    }).length;

    return {
      totalStudents: allStudents.length,
      activeMemberships,
      expiredMemberships: allStudents.length - activeMemberships,
      todayAttendance,
    };
  }

  // ── Income stats ─────────────────────────────────────────────────

  async getIncomeStats() {
    const allPayments = await db.select().from(payments);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const cashInHand = allPayments
      .filter((p) => p.paymentMethod === "cash")
      .reduce((sum, p) => sum + p.amount, 0);

    const onlinePayments = allPayments
      .filter((p) => p.paymentMethod === "online")
      .reduce((sum, p) => sum + p.amount, 0);

    const thisMonthIncome = allPayments
      .filter((p) => {
        const d = new Date(p.date);
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
      })
      .reduce((sum, p) => sum + p.amount, 0);

    const thisYearIncome = allPayments
      .filter((p) => new Date(p.date).getFullYear() === currentYear)
      .reduce((sum, p) => sum + p.amount, 0);

    const totalOverallIncome = allPayments.reduce((sum, p) => sum + p.amount, 0);

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    const monthlyBreakdown = monthNames.map((month, index) => {
      const monthPayments = allPayments.filter((p) => {
        const d = new Date(p.date);
        return d.getFullYear() === currentYear && d.getMonth() === index;
      });
      return {
        month,
        amount: monthPayments.reduce((sum, p) => sum + p.amount, 0),
        paymentCount: monthPayments.length,
      };
    });

    const monthsWithData = monthlyBreakdown.filter((m) => m.paymentCount > 0).length;
    const averageMonthlyIncome = monthsWithData > 0
      ? Math.round(thisYearIncome / monthsWithData)
      : 0;

    return {
      cashInHand,
      onlinePayments,
      thisMonthIncome,
      thisYearIncome,
      totalOverallIncome,
      monthlyBreakdown,
      averageMonthlyIncome,
      totalPaymentsReceived: allPayments.length,
    };
  }
}

export const storage = new DrizzleStorage();
