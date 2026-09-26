/**
 * Storage layer — Drizzle ORM + Neon Postgres.
 *
 * All database operations go through Drizzle instead of the old Supabase JS
 * client. The IStorage interface is unchanged so routes.ts and the rest of
 * the app keep working identically.
 */

import { eq, and, gte, gt, lte, desc, sql } from "drizzle-orm";
import { db, type DrizzleDB } from "./db.js";
import { isMembershipExpired, toDateOnly, toMonthKey, monthKeyFor, daysBetweenDateOnly } from "../shared/duration.js";
import {
  students,
  payments,
  attendance,
  vendors,
  vendorAccounts,
  vendorNeonProjects,
  vendorServicePlans,
  platformSettings,
  membershipPlans,
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
  type MembershipPlan,
  type VendorServiceChargeSummary,
  type VendorReport,
} from "../shared/schema.js";
import {
  createNeonAuthUser,
  updateNeonAuthUser,
} from "./auth.js";
import { createNeonProject } from "./neon-api.js";
import { encrypt, decrypt, isEncrypted } from "./crypto.js";
import { runMigration } from "./migrate.js";

// Credentials are stored encrypted. Returns the decrypted plaintext for a
// stored value (safe for both legacy plaintext rows and new encrypted rows).
function plaintextOf(value: string): string {
  return isEncrypted(value) ? decrypt(value) : value;
}

// Keeps credential storage consistent: encrypts plaintext, leaves already
// encrypted values untouched.
function encryptedOf(value: string): string {
  return isEncrypted(value) ? value : encrypt(value);
}

// ── IStorage interface (unchanged) ────────────────────────────────────

// Tables created lazily for databases that predate the membership_plans
// schema (CREATE TABLE IF NOT EXISTS is idempotent, so this is safe).
const ensuredTables = new WeakSet<object>();
const studentBatchMigrations = new WeakMap<object, Promise<void>>();

function ensureStudentBatchColumn(dbc: DrizzleDB): Promise<void> {
  const key = dbc as object;
  const existing = studentBatchMigrations.get(key);
  if (existing) return existing;

  const migration = dbc
    .execute(
      sql.raw(
        "ALTER TABLE students ADD COLUMN IF NOT EXISTS batch VARCHAR(10) NOT NULL DEFAULT 'morning'",
      ),
    )
    .then(() => undefined);
  studentBatchMigrations.set(key, migration);
  return migration.catch((error) => {
    studentBatchMigrations.delete(key);
    throw error;
  });
}

// vendor_service_plans predates per-vendor platform fees — make sure the
// column exists before we read/write it (idempotent, same pattern as above).
const servicePlanMigrations = new WeakMap<object, Promise<void>>();

function ensureServicePlanTable(dbc: DrizzleDB): Promise<void> {
  const key = dbc as object;
  const existing = servicePlanMigrations.get(key);
  if (existing) return existing;

  const migration = (async () => {
    await dbc.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS vendor_service_plans (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL UNIQUE REFERENCES vendors(id) ON DELETE CASCADE,
        method VARCHAR(20) NOT NULL DEFAULT 'per_user',
        per_user_charge INTEGER NOT NULL DEFAULT 1,
        default_price INTEGER NOT NULL DEFAULT 199,
        platform_fee INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `));
    await dbc.execute(
      sql.raw(
        "ALTER TABLE vendor_service_plans ADD COLUMN IF NOT EXISTS platform_fee INTEGER",
      ),
    );
  })();
  servicePlanMigrations.set(key, migration);
  return migration.catch((error) => {
    servicePlanMigrations.delete(key);
    throw error;
  });
}

async function ensureMembershipPlansTable(dbc: DrizzleDB): Promise<void> {
  if (ensuredTables.has(dbc as object)) return;
  await dbc.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS membership_plans (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      duration_months INTEGER NOT NULL UNIQUE,
      price INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `  ));
  ensuredTables.add(dbc as object);
}

export interface IStorage {
  // Students
  getStudents(db?: DrizzleDB): Promise<Student[]>;
  getStudentById(id: number, db?: DrizzleDB): Promise<Student | undefined>;
  getStudentByRegisterNo(registerNo: string, db?: DrizzleDB): Promise<Student | undefined>;
  createStudent(student: InsertStudent & { expiryDate?: string | null }, db?: DrizzleDB): Promise<Student>;
  updateStudent(id: number, student: Partial<InsertStudent> & { expiryDate?: string | null }, db?: DrizzleDB): Promise<Student>;
  deleteStudent(id: number, db?: DrizzleDB): Promise<void>;

  // Payments
  getPayments(db?: DrizzleDB): Promise<Payment[]>;
  getPaymentById(id: number, db?: DrizzleDB): Promise<Payment | undefined>;
  createPayment(payment: InsertPayment, db?: DrizzleDB): Promise<Payment>;
  updatePayment(id: number, payment: Partial<Omit<InsertPayment, 'studentId' | 'registerNo' | 'studentName'>>, db?: DrizzleDB): Promise<Payment>;
  deletePayment(id: number, db?: DrizzleDB): Promise<void>;

  // Vendors
  getVendors(): Promise<Vendor[]>;
  getVendorById(id: number): Promise<Vendor | undefined>;
  getVendorByPhone(phone: string): Promise<Vendor | undefined>;
  getVendorByAuthUid(uid: string): Promise<Vendor | undefined>;
  createVendor(vendor: InsertVendor, password?: string): Promise<Vendor>;
  updateVendor(id: number, vendor: Partial<InsertVendor>, options?: { password?: string; sessionCookie?: string }): Promise<Vendor>;
  backfillVendorAuthUsers(): Promise<{ created: number; linked: number; failed: number }>;

  // Vendor Accounts
  getVendorAccounts(): Promise<VendorAccount[]>;
  getVendorAccountById(id: number): Promise<VendorAccount | undefined>;
  createVendorAccount(account: InsertVendorAccount): Promise<VendorAccount>;
  updateVendorAccount(id: number, account: Partial<InsertVendorAccount>): Promise<VendorAccount>;
  deleteVendorAccount(id: number): Promise<void>;
  runDailyVendorBilling(vendorId?: number): Promise<number>;
  consumeVendorCreditDay(vendorId: number): Promise<VendorAccount | null>;
  isVendorBlocked(vendorId: number): Promise<{ blocked: boolean; availableDays: number; remainingCredits: number; totalCredits: number; usedCredits: number; hasAccount: boolean; vendorName: string; businessName: string | null; phone: string; } | null>;

  // Vendor Neon Projects
  getVendorNeonProjects(): Promise<VendorNeonProject[]>;
  getVendorNeonProjectById(id: number): Promise<VendorNeonProject | undefined>;
  getVendorNeonProjectByVendorId(vendorId: number): Promise<VendorNeonProject | undefined>;
  createVendorNeonProject(vendorId: number, projectName?: string): Promise<VendorNeonProject>;
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
  upsertVendorServicePlan(vendorId: number, plan: Pick<InsertVendorServicePlan, "method" | "perUserCharge" | "defaultPrice" | "platformFee">): Promise<VendorServicePlan>;
  getVendorServiceCharge(vendorId: number): Promise<VendorServiceChargeSummary>;

  // Platform Settings
  getPlatformSettings(): Promise<PlatformSettings>;
  updatePlatformSettings(settings: { platformFee: number }): Promise<PlatformSettings>;

  // Membership Plans
  getMembershipPlans(db?: DrizzleDB): Promise<MembershipPlan[]>;
  createMembershipPlan(plan: { name: string; durationMonths: number; price: number }, db?: DrizzleDB): Promise<MembershipPlan>;
  updateMembershipPlan(id: number, plan: Partial<{ name: string; durationMonths: number; price: number }>, db?: DrizzleDB): Promise<MembershipPlan | undefined>;
  deleteMembershipPlan(id: number, db?: DrizzleDB): Promise<boolean>;
  upsertMembershipPlans(plans: { durationMonths: number; price: number }[], db?: DrizzleDB): Promise<MembershipPlan[]>;

  // Reports
  getVendorReport(vendorId: number): Promise<VendorReport | null>;

  // Attendance
  getAttendanceByDate(date: string): Promise<Attendance[]>;
  /** Attendance between two `YYYY-MM-DD` dates, inclusive on both ends. */
  getAttendanceInRange(from: string, to: string): Promise<Attendance[]>;
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
  getIncomeStats(dbc?: DrizzleDB, year?: number): Promise<{
    cashInHand: number;
    onlinePayments: number;
    thisMonthIncome: number;
    thisYearIncome: number;
    /** Year the year-scoped figures below were computed for. */
    selectedYear: number;
    /** Total collected in `selectedYear`. */
    selectedYearIncome: number;
    /** Distinct years present in the payments table, newest first. */
    availableYears: number[];
    totalOverallIncome: number;
    monthlyBreakdown: { month: string; amount: number; paymentCount: number }[];
    averageMonthlyIncome: number;
    /** Payments received in the current calendar month (count, not rupees). */
    totalPaymentsReceived: number;
    thisMonthPaymentsReceived: number;
    thisYearPaymentsReceived: number;
    allTimePaymentsReceived: number;
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

  async getStudents(dbc: DrizzleDB = db): Promise<Student[]> {
    await ensureStudentBatchColumn(dbc);
    return dbc.select().from(students).orderBy(desc(students.id));
  }

  async getStudentById(id: number, dbc: DrizzleDB = db): Promise<Student | undefined> {
    await ensureStudentBatchColumn(dbc);
    const rows = await dbc.select().from(students).where(eq(students.id, id)).limit(1);
    return rows[0];
  }

  async getStudentByRegisterNo(registerNo: string, dbc: DrizzleDB = db): Promise<Student | undefined> {
    await ensureStudentBatchColumn(dbc);
    const rows = await dbc.select().from(students).where(eq(students.registerNo, registerNo)).limit(1);
    return rows[0];
  }

  async createStudent(student: InsertStudent & { expiryDate?: string | null }, dbc: DrizzleDB = db): Promise<Student> {
    await ensureStudentBatchColumn(dbc);
    const rows = await dbc.insert(students).values({
      registerNo: student.registerNo,
      name: student.name,
      batch: student.batch,
      phone: student.phone,
      address: student.address || "",
      joinDate: student.joinDate,
      expiryDate: student.expiryDate || null,
    }).returning();
    return rows[0];
  }

  async updateStudent(id: number, student: Partial<InsertStudent> & { expiryDate?: string | null }, dbc: DrizzleDB = db): Promise<Student> {
    await ensureStudentBatchColumn(dbc);
    const updateData: Record<string, unknown> = {};
    if (student.registerNo !== undefined) updateData.registerNo = student.registerNo;
    if (student.name !== undefined) updateData.name = student.name;
    if (student.batch !== undefined) updateData.batch = student.batch;
    if (student.phone !== undefined) updateData.phone = student.phone;
    if (student.address !== undefined) updateData.address = student.address || "";
    if (student.joinDate !== undefined) updateData.joinDate = student.joinDate;
    if (student.expiryDate !== undefined) updateData.expiryDate = student.expiryDate;

    const rows = await dbc.update(students).set(updateData).where(eq(students.id, id)).returning();
    return rows[0];
  }

  async deleteStudent(id: number, dbc: DrizzleDB = db): Promise<void> {
    await dbc.delete(students).where(eq(students.id, id));
  }

  // ── Payments ─────────────────────────────────────────────────────

  async getPayments(dbc: DrizzleDB = db): Promise<Payment[]> {
    return dbc.select().from(payments).orderBy(desc(payments.id));
  }

  async getPaymentById(id: number, dbc: DrizzleDB = db): Promise<Payment | undefined> {
    const rows = await dbc.select().from(payments).where(eq(payments.id, id)).limit(1);
    return rows[0];
  }

  async createPayment(payment: InsertPayment, dbc: DrizzleDB = db): Promise<Payment> {
    const rows = await dbc.insert(payments).values({
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

  async updatePayment(id: number, payment: Partial<Omit<InsertPayment, 'studentId' | 'registerNo' | 'studentName'>>, dbc: DrizzleDB = db): Promise<Payment> {
    const updateData: Record<string, unknown> = {};
    if (payment.tokenNumber !== undefined) updateData.tokenNumber = payment.tokenNumber;
    if (payment.date !== undefined) updateData.date = payment.date;
    if (payment.duration !== undefined) updateData.duration = payment.duration;
    if (payment.amount !== undefined) updateData.amount = payment.amount;
    if (payment.paymentMethod !== undefined) updateData.paymentMethod = payment.paymentMethod;

    const rows = await dbc.update(payments).set(updateData).where(eq(payments.id, id)).returning();
    return rows[0];
  }

  async deletePayment(id: number, dbc: DrizzleDB = db): Promise<void> {
    await dbc.delete(payments).where(eq(payments.id, id));
  }

  // ── Vendors ──────────────────────────────────────────────────────

  async getVendors(): Promise<Vendor[]> {
    return db.select().from(vendors).orderBy(desc(vendors.id));
  }

  async getVendorById(id: number): Promise<Vendor | undefined> {
    const rows = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
    return rows[0];
  }

  async getVendorByPhone(phone: string): Promise<Vendor | undefined> {
    const rows = await db.select().from(vendors).where(eq(vendors.phone, phone)).limit(1);
    return rows[0];
  }

  async getVendorByAuthUid(uid: string): Promise<Vendor | undefined> {
    const rows = await db.select().from(vendors).where(eq(vendors.authUid, uid)).limit(1);
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
      await this.provisionNeonProject(newVendor.id, vendor.businessName);
    } catch (error: any) {
      console.error("[storage] Neon project auto-provisioning failed:", error.message);
      // Don't fail vendor creation if provisioning fails
    }

    return { ...newVendor, authUid };
  }

  // Creates a real Neon project for a vendor, runs migrations, encrypts and
  // stores the connection credentials. Throws if provisioning fails.
  private async provisionNeonProject(
    vendorId: number,
    nameHint?: string
  ): Promise<VendorNeonProject> {
    const rawName = nameHint?.trim() || `Gym-${vendorId}`;
    const projectName = rawName
      .replace(/[^a-zA-Z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || `Gym-${vendorId}`;

    const project = await createNeonProject(projectName);
    const connUri = project.connection_uris?.[0]?.pooler_connection_uri;
    if (!connUri) {
      throw new Error(`No connection URI returned for project "${projectName}"`);
    }

    const migrationResult = await runMigration(connUri);
    if (!migrationResult.success) {
      console.error("Migration failed for new project:", migrationResult.error);
    }

    const rows = await db.insert(vendorNeonProjects).values({
      vendorId,
      authUrl: encrypt(project.connection_uris?.[0]?.host || ""),
      apiKey: encrypt(project.connection_uris?.[0]?.api_password || ""),
      databaseUrl: encrypt(connUri),
      authSecret: encrypt(project.connection_uris?.[0]?.password || ""),
      port: 5000,
    }).returning();

    console.log(`[storage] Provisioned Neon project for vendor #${vendorId}: ${projectName}`);
    return rows[0];
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
    // Settle any days that elapsed since the last read so the admin panel and
    // dashboard never show a stale balance.
    await this.runDailyVendorBilling();
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
      // A brand new balance starts counting from today, never from a
      // backdated date the client may have sent.
      lastBillingDate: toDateOnly(new Date()),
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

  /**
   * Settle elapsed calendar days against every vendor balance.
   *
   * Paid days are consumed first; once they run out the overflow eats into the
   * credit allowance (`usedCredits`) but never past `creditDays`, so a vendor
   * can never be pushed into a negative balance by a long gap.
   *
   * Deliberately lazy rather than cron-based: the app runs both as a long-lived
   * Express server and as a Vercel serverless function, where no timer is
   * guaranteed to fire. Callers invoke this before reading balances instead,
   * which is idempotent — `lastBillingDate` means a given day is only ever
   * billed once no matter how many times this runs.
   *
   * Accounts that have never been billed anchor to today and are charged
   * nothing, so enabling this cannot retroactively block existing vendors.
   *
   * @param vendorId limit the sweep to a single vendor (used by the login gate)
   * @returns how many accounts were actually changed
   */
  async runDailyVendorBilling(vendorId?: number): Promise<number> {
    const today = toDateOnly(new Date());
    const rows = await db
      .select()
      .from(vendorAccounts)
      .where(vendorId != null ? eq(vendorAccounts.vendorId, vendorId) : undefined);

    let updatedCount = 0;

    for (const account of rows) {
      const lastBilled = account.lastBillingDate ? toDateOnly(account.lastBillingDate) : "";
      if (!lastBilled) {
        // First ever run for this account — anchor it without charging.
        await db
          .update(vendorAccounts)
          .set({ lastBillingDate: today })
          .where(eq(vendorAccounts.id, account.id));
        continue;
      }

      const elapsedDays = daysBetweenDateOnly(lastBilled, today);
      if (elapsedDays <= 0) continue;

      const paidDaysUsed = Math.min(elapsedDays, account.availableDays);
      const creditRoom = Math.max(account.creditDays - account.usedCredits, 0);
      const creditDaysUsed = Math.min(elapsedDays - paidDaysUsed, creditRoom);

      // Guard on lastBillingDate so a concurrent run can't bill the same day
      // twice; the loser of the race simply updates zero rows.
      const updated = await db
        .update(vendorAccounts)
        .set({
          availableDays: account.availableDays - paidDaysUsed,
          usedCredits: account.usedCredits + creditDaysUsed,
          lastBillingDate: today,
        })
        .where(and(eq(vendorAccounts.id, account.id), eq(vendorAccounts.lastBillingDate, lastBilled)))
        .returning();

      if (updated.length > 0) updatedCount += 1;
    }

    return updatedCount;
  }

  /**
   * Consume one day for a vendor: paid days first, then credit days.
   *
   * Kept as a single source of truth for "this vendor used a day today" — the
   * daily sweep is settled first so a manual consume can never be used to skip
   * ahead of (or double-charge) the calendar.
   */
  async consumeVendorCreditDay(vendorId: number): Promise<VendorAccount | null> {
    await this.runDailyVendorBilling(vendorId);

    const rows = await db.select().from(vendorAccounts).where(eq(vendorAccounts.vendorId, vendorId)).limit(1);
    const existing = rows[0];
    if (!existing) return null;

    // Conditional UPDATEs instead of read-modify-write: two concurrent
    // consumes can't both see the same balance and each write back the same
    // decremented value.
    const paid = await db
      .update(vendorAccounts)
      .set({ availableDays: sql`GREATEST(${vendorAccounts.availableDays} - 1, 0)` })
      .where(and(eq(vendorAccounts.id, existing.id), gt(vendorAccounts.availableDays, 0)))
      .returning();
    if (paid.length > 0) return paid[0];

    const credit = await db
      .update(vendorAccounts)
      .set({ usedCredits: sql`${vendorAccounts.usedCredits} + 1` })
      .where(
        and(
          eq(vendorAccounts.id, existing.id),
          lte(vendorAccounts.availableDays, 0),
          sql`${vendorAccounts.usedCredits} < ${vendorAccounts.creditDays}`,
        ),
      )
      .returning();
    if (credit.length > 0) return credit[0];

    // Nothing left to consume — blocked.
    const current = await db.select().from(vendorAccounts).where(eq(vendorAccounts.id, existing.id)).limit(1);
    return current[0] ?? existing;
  }

  async isVendorBlocked(vendorId: number): Promise<{ blocked: boolean; availableDays: number; remainingCredits: number; totalCredits: number; usedCredits: number; hasAccount: boolean; vendorName: string; businessName: string | null; phone: string; } | null> {
    const vendor = await this.getVendorById(vendorId);
    if (!vendor) return null;

    // The sign-in gate is the one place a stale balance would actually lock a
    // vendor out, so settle elapsed days before deciding.
    await this.runDailyVendorBilling(vendorId);

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
    const rows = await db.select().from(vendorNeonProjects).orderBy(desc(vendorNeonProjects.id));
    return rows.map((row) => ({
      ...row,
      authUrl: plaintextOf(row.authUrl),
      apiKey: plaintextOf(row.apiKey),
      databaseUrl: plaintextOf(row.databaseUrl),
      authSecret: plaintextOf(row.authSecret),
    }));
  }

  async getVendorNeonProjectById(id: number): Promise<VendorNeonProject | undefined> {
    const rows = await db.select().from(vendorNeonProjects).where(eq(vendorNeonProjects.id, id)).limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return {
      ...row,
      authUrl: plaintextOf(row.authUrl),
      apiKey: plaintextOf(row.apiKey),
      databaseUrl: plaintextOf(row.databaseUrl),
      authSecret: plaintextOf(row.authSecret),
    };
  }

  async getVendorNeonProjectByVendorId(vendorId: number): Promise<VendorNeonProject | undefined> {
    const rows = await db.select().from(vendorNeonProjects).where(eq(vendorNeonProjects.vendorId, vendorId)).limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return {
      ...row,
      authUrl: plaintextOf(row.authUrl),
      apiKey: plaintextOf(row.apiKey),
      databaseUrl: plaintextOf(row.databaseUrl),
      authSecret: plaintextOf(row.authSecret),
    };
  }

  async createVendorNeonProject(vendorId: number, projectName?: string): Promise<VendorNeonProject> {
    return this.provisionNeonProject(vendorId, projectName);
  }

  async updateVendorNeonProject(id: number, project: Partial<InsertVendorNeonProject>): Promise<VendorNeonProject> {
    const updateData: Record<string, unknown> = {};
    if (project.vendorId !== undefined) updateData.vendorId = project.vendorId;
    if (project.authUrl !== undefined) updateData.authUrl = encryptedOf(project.authUrl);
    if (project.apiKey !== undefined) updateData.apiKey = encryptedOf(project.apiKey);
    if (project.databaseUrl !== undefined) updateData.databaseUrl = encryptedOf(project.databaseUrl);
    if (project.authSecret !== undefined) updateData.authSecret = encryptedOf(project.authSecret);
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
    await ensureServicePlanTable(db);
    const rows = await db.select().from(vendorServicePlans).where(eq(vendorServicePlans.vendorId, vendorId)).limit(1);
    return rows[0] ?? null;
  }

  async upsertVendorServicePlan(
    vendorId: number,
    plan: Pick<InsertVendorServicePlan, "method" | "perUserCharge" | "defaultPrice" | "platformFee">
  ): Promise<VendorServicePlan> {
    await ensureServicePlanTable(db);

    // Try update first
    const updated = await db.update(vendorServicePlans)
      .set({
        method: plan.method,
        perUserCharge: plan.perUserCharge,
        defaultPrice: plan.defaultPrice,
        // null = "use the global default"; each vendor keeps its own value.
        platformFee: plan.platformFee ?? null,
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
      platformFee: plan.platformFee ?? null,
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
    const platformFee = plan?.platformFee ?? platform.platformFee;

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
        const vendorDb = getDb(plaintextOf(keyRows[0].databaseUrl));
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

  // ── Membership Plans ────────────────────────────────────────────

  async getMembershipPlans(dbc: DrizzleDB = db): Promise<MembershipPlan[]> {
    await ensureMembershipPlansTable(dbc);
    // Deliberately NOT seeded: a new gym starts empty and the owner adds
    // their own plans (the empty state in the Membership Plans tab).
    return dbc.select().from(membershipPlans).orderBy(membershipPlans.durationMonths);
  }

  async createMembershipPlan(
    plan: { name: string; durationMonths: number; price: number },
    dbc: DrizzleDB = db,
  ): Promise<MembershipPlan> {
    await ensureMembershipPlansTable(dbc);
    const rows = await dbc.insert(membershipPlans).values({
      name: plan.name,
      durationMonths: plan.durationMonths,
      price: plan.price,
    }).returning();
    return rows[0];
  }

  async updateMembershipPlan(
    id: number,
    plan: Partial<{ name: string; durationMonths: number; price: number }>,
    dbc: DrizzleDB = db,
  ): Promise<MembershipPlan | undefined> {
    await ensureMembershipPlansTable(dbc);
    const rows = await dbc
      .update(membershipPlans)
      .set({ ...plan, updatedAt: new Date() })
      .where(eq(membershipPlans.id, id))
      .returning();
    return rows[0];
  }

  async deleteMembershipPlan(id: number, dbc: DrizzleDB = db): Promise<boolean> {
    await ensureMembershipPlansTable(dbc);
    const rows = await dbc
      .delete(membershipPlans)
      .where(eq(membershipPlans.id, id))
      .returning({ id: membershipPlans.id });
    return rows.length > 0;
  }

  async upsertMembershipPlans(
    plans: { durationMonths: number; price: number }[],
    dbc: DrizzleDB = db,
  ): Promise<MembershipPlan[]> {
    await ensureMembershipPlansTable(dbc);
    for (const plan of plans) {
      await dbc
        .insert(membershipPlans)
        .values({
          durationMonths: plan.durationMonths,
          price: plan.price,
        })
        .onConflictDoUpdate({
          target: membershipPlans.durationMonths,
          set: {
            price: plan.price,
            updatedAt: new Date(),
          },
        });
    }
    return this.getMembershipPlans(dbc);
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
      const vendorDb = getDb(plaintextOf(keyRow.databaseUrl));
      await ensureStudentBatchColumn(vendorDb);

      const [allStudents, allPayments, allAttendance] = await Promise.all([
        vendorDb.select().from(students),
        vendorDb.select().from(payments),
        vendorDb.select().from(attendance),
      ]);

      const now = new Date();
      const today = toDateOnly(now);
      const currentYear = now.getFullYear();

      const totalMembers = allStudents.length;
      const activeMembers = allStudents.filter(
        (s) => !isMembershipExpired(s.expiryDate, now)
      ).length;

      const sumAmount = (rows: typeof allPayments) =>
        rows.reduce((sum, p) => sum + (p.amount || 0), 0);

      const cashInHand = sumAmount(allPayments.filter((p) => p.paymentMethod === "cash"));
      const onlinePayments = sumAmount(allPayments.filter((p) => p.paymentMethod === "online"));
      const thisMonthIncome = sumAmount(
        allPayments.filter((p) => toMonthKey(p.date) === toMonthKey(now))
      );
      const totalIncome = sumAmount(allPayments);
      const todayAttendance = allAttendance.filter((a) => a.date === today).length;

      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
      ];

      const monthlyBreakdown = monthNames.map((month, index) => {
        const monthPayments = allPayments.filter(
          (p) => toMonthKey(p.date) === monthKeyFor(currentYear, index),
        );
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

  async getAttendanceByDate(date: string, dbc: DrizzleDB = db): Promise<Attendance[]> {
    return dbc.select().from(attendance).where(eq(attendance.date, date));
  }

  /**
   * Attendance between two calendar dates, inclusive on both ends.
   *
   * `date` is a Postgres `date` column, so the bounds compare as plain
   * `YYYY-MM-DD` strings and no timezone can shift a record into a neighbouring
   * day. Callers that pass the bounds the wrong way round get them swapped
   * rather than an empty result.
   */
  async getAttendanceInRange(
    from: string,
    to: string,
    dbc: DrizzleDB = db,
  ): Promise<Attendance[]> {
    const start = from <= to ? from : to;
    const end = from <= to ? to : from;
    return dbc
      .select()
      .from(attendance)
      .where(and(gte(attendance.date, start), lte(attendance.date, end)))
      .orderBy(desc(attendance.date), desc(attendance.id));
  }

  async getTodayAttendanceCount(dbc: DrizzleDB = db): Promise<number> {
    const today = new Date().toISOString().split("T")[0];
    const rows = await dbc.select({ count: sql<number>`count(*)::int` }).from(attendance).where(eq(attendance.date, today));
    return rows[0]?.count ?? 0;
  }

  async createAttendance(att: InsertAttendance, dbc: DrizzleDB = db): Promise<Attendance> {
    const rows = await dbc.insert(attendance).values({
      date: att.date,
      registerNo: att.registerNo,
      studentName: att.studentName,
      timeIn: att.timeIn,
    }).returning();
    return rows[0];
  }

  // ── Dashboard stats ──────────────────────────────────────────────

  async getDashboardStats(dbc: DrizzleDB = db) {
    await ensureStudentBatchColumn(dbc);
    const [allStudents, allAttendance] = await Promise.all([
      dbc.select().from(students),
      dbc.select().from(attendance),
    ]);

    const today = new Date().toISOString().split("T")[0];
    const todayAttendance = allAttendance.filter((a) => a.date === today).length;

    const now = new Date();
    const activeMemberships = allStudents.filter(
      (s) => !isMembershipExpired(s.expiryDate, now)
    ).length;

    return {
      totalStudents: allStudents.length,
      activeMemberships,
      expiredMemberships: allStudents.length - activeMemberships,
      todayAttendance,
    };
  }

  // ── Income stats ─────────────────────────────────────────────────

  async getIncomeStats(dbc: DrizzleDB = db, year?: number) {
    const allPayments = await dbc.select().from(payments);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthKey = toMonthKey(now);

    // The year filter only ever scopes the year-based figures. Anything outside
    // a plausible range is ignored so a bad query param can't blank the page.
    const selectedYear =
      typeof year === "number" &&
      Number.isInteger(year) &&
      year >= 1970 &&
      year <= currentYear + 1
        ? year
        : currentYear;

    const sumAmount = (rows: typeof allPayments) =>
      rows.reduce((sum, p) => sum + (p.amount || 0), 0);

    const cashInHand = sumAmount(
      allPayments.filter((p) => p.paymentMethod === "cash"),
    );
    const onlinePayments = sumAmount(
      allPayments.filter((p) => p.paymentMethod === "online"),
    );

    // Bucket by the receipt date (`payments.date`), compared as a YYYY-MM
    // string so no timezone can shift a payment into a neighbouring month.
    const thisMonthPayments = allPayments.filter(
      (p) => toMonthKey(p.date) === currentMonthKey,
    );
    const thisYearPayments = allPayments.filter((p) =>
      toMonthKey(p.date).startsWith(String(currentYear)),
    );
    const selectedYearPayments = allPayments.filter((p) =>
      toMonthKey(p.date).startsWith(String(selectedYear)),
    );

    const thisMonthIncome = sumAmount(thisMonthPayments);
    const thisYearIncome = sumAmount(thisYearPayments);
    const selectedYearIncome = sumAmount(selectedYearPayments);
    const totalOverallIncome = sumAmount(allPayments);

    // Newest first, and always include the current year so the dropdown always
    // has an entry to show even before any payment has been recorded.
    const availableYears = Array.from(
      new Set([
        currentYear,
        ...allPayments.map((p) => Number(toMonthKey(p.date).slice(0, 4))),
      ]),
    )
      .filter((y) => Number.isInteger(y) && y > 0)
      .sort((a, b) => b - a);

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    const monthlyBreakdown = monthNames.map((month, index) => {
      const monthPayments = allPayments.filter(
        (p) => toMonthKey(p.date) === monthKeyFor(selectedYear, index),
      );
      return {
        month,
        amount: sumAmount(monthPayments),
        paymentCount: monthPayments.length,
      };
    });

    const monthsWithData = monthlyBreakdown.filter((m) => m.paymentCount > 0).length;
    const averageMonthlyIncome = monthsWithData > 0
      ? Math.round(selectedYearIncome / monthsWithData)
      : 0;

    return {
      cashInHand,
      onlinePayments,
      thisMonthIncome,
      thisYearIncome,
      selectedYear,
      selectedYearIncome,
      availableYears,
      totalOverallIncome,
      monthlyBreakdown,
      averageMonthlyIncome,
      // Count of payments received THIS month, keyed off the receipt date.
      thisMonthPaymentsReceived: thisMonthPayments.length,
      thisYearPaymentsReceived: thisYearPayments.length,
      totalPaymentsReceived: thisMonthPayments.length,
      allTimePaymentsReceived: allPayments.length,
    };
  }
}

export const storage = new DrizzleStorage();
