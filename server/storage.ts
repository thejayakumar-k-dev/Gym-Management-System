import { createClient } from "@supabase/supabase-js";
import {
  students,
  payments,
  attendance,
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
  type VendorSupabaseKey,
  type InsertVendorSupabaseKey,
  type VendorServicePlan,
  type InsertVendorServicePlan,
  type PlatformSettings,
  type VendorServiceChargeSummary,
  type VendorReport,
} from "@shared/schema";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Admin client with service role for creating auth users
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

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
  updateVendor(id: number, vendor: Partial<InsertVendor>, options?: { password?: string }): Promise<Vendor>;
  backfillVendorAuthUsers(): Promise<{ created: number; linked: number; failed: number }>;

  // Vendor Accounts
  getVendorAccounts(): Promise<VendorAccount[]>;
  getVendorAccountById(id: number): Promise<VendorAccount | undefined>;
  createVendorAccount(account: InsertVendorAccount): Promise<VendorAccount>;
  updateVendorAccount(id: number, account: Partial<InsertVendorAccount>): Promise<VendorAccount>;
  deleteVendorAccount(id: number): Promise<void>;
  // Consume 1 day: available first, then credit (7/7 → 6/7 → ... → 0/7)
  consumeVendorCreditDay(vendorId: number): Promise<VendorAccount | null>;
  // Blocked = no paid days left AND credit allowance fully consumed (0/7)
  isVendorBlocked(vendorId: number): Promise<{ blocked: boolean; availableDays: number; remainingCredits: number; totalCredits: number; usedCredits: number; hasAccount: boolean; vendorName: string; businessName: string | null; phone: string; } | null>;

  // Vendor Supabase Keys
  getVendorSupabaseKeys(): Promise<VendorSupabaseKey[]>;
  getVendorSupabaseKeyById(id: number): Promise<VendorSupabaseKey | undefined>;
  createVendorSupabaseKey(key: InsertVendorSupabaseKey): Promise<VendorSupabaseKey>;
  updateVendorSupabaseKey(id: number, key: Partial<InsertVendorSupabaseKey>): Promise<VendorSupabaseKey>;
  deleteVendorSupabaseKey(id: number): Promise<void>;
  getAdminSupabaseConfig(): Promise<{
    supabaseUrl: string | null;
    anonKey: string | null;
    databaseUrl: string | null;
    serviceRoleKey: string | null;
    port: number;
  }>;

  // Vendor Service Charge Plans
  getVendorServicePlan(vendorId: number): Promise<VendorServicePlan | null>;
  upsertVendorServicePlan(
    vendorId: number,
    plan: Pick<
      InsertVendorServicePlan,
      "method" | "perUserCharge" | "defaultPrice"
    >
  ): Promise<VendorServicePlan>;
  getVendorServiceCharge(
    vendorId: number
  ): Promise<VendorServiceChargeSummary>;

  // Platform Settings (global, single row)
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
    monthlyBreakdown: {
      month: string;
      amount: number;
      paymentCount: number;
    }[];
    averageMonthlyIncome: number;
    totalPaymentsReceived: number;
  }>;
}

export class SupabaseStorage implements IStorage {
  // Students
  async getStudents(): Promise<Student[]> {
    try {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .order("id", { ascending: false });
      
      if (error) throw error;
      return (data || []).map(row => ({
        id: row.id,
        registerNo: row.register_no,
        name: row.name,
        phone: row.phone,
        address: row.address,
        joinDate: row.join_date,
        expiryDate: row.expiry_date,
        createdAt: new Date(row.created_at),
      }));
    } catch (error) {
      console.error("Error fetching students:", error);
      throw error;
    }
  }

  async getStudentById(id: number): Promise<Student | undefined> {
    try {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("id", id)
        .single();
      
      if (error && error.code !== "PGRST116") throw error;
      if (!data) return undefined;
      
      return {
        id: data.id,
        registerNo: data.register_no,
        name: data.name,
        phone: data.phone,
        address: data.address,
        joinDate: data.join_date,
        expiryDate: data.expiry_date,
        createdAt: new Date(data.created_at),
      };
    } catch (error) {
      console.error("Error fetching student by id:", error);
      throw error;
    }
  }

  async getStudentByRegisterNo(registerNo: string): Promise<Student | undefined> {
    try {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("register_no", registerNo)
        .single();
      
      if (error && error.code !== "PGRST116") throw error;
      if (!data) return undefined;
      
      return {
        id: data.id,
        registerNo: data.register_no,
        name: data.name,
        phone: data.phone,
        address: data.address,
        joinDate: data.join_date,
        expiryDate: data.expiry_date,
        createdAt: new Date(data.created_at),
      };
    } catch (error) {
      console.error("Error fetching student by register number:", error);
      throw error;
    }
  }

  async createStudent(student: InsertStudent & { expiryDate?: string | null }): Promise<Student> {
    try {
      const dbStudent = {
        register_no: student.registerNo,
        name: student.name,
        phone: student.phone,
        address: student.address,
        join_date: student.joinDate,
        expiry_date: student.expiryDate || null,
      };
      
      const { data, error } = await supabase
        .from("students")
        .insert([dbStudent])
        .select()
        .single();
      
      if (error) throw error;
      
      // Map back to camelCase
      return {
        id: data.id,
        registerNo: data.register_no,
        name: data.name,
        phone: data.phone,
        address: data.address,
        joinDate: data.join_date,
        expiryDate: data.expiry_date,
        createdAt: new Date(data.created_at),
      };
    } catch (error) {
      console.error("Error creating student:", error);
      throw error;
    }
  }

  async updateStudent(id: number, student: Partial<InsertStudent> & { expiryDate?: string | null }): Promise<Student> {
    try {
      const dbStudent: any = {};
      if (student.registerNo) dbStudent.register_no = student.registerNo;
      if (student.name) dbStudent.name = student.name;
      if (student.phone) dbStudent.phone = student.phone;
      if (student.address) dbStudent.address = student.address;
      if (student.joinDate) dbStudent.join_date = student.joinDate;
      if (student.expiryDate !== undefined) dbStudent.expiry_date = student.expiryDate;
      
      const { data, error } = await supabase
        .from("students")
        .update(dbStudent)
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      
      return {
        id: data.id,
        registerNo: data.register_no,
        name: data.name,
        phone: data.phone,
        address: data.address,
        joinDate: data.join_date,
        expiryDate: data.expiry_date,
        createdAt: new Date(data.created_at),
      };
    } catch (error) {
      console.error("Error updating student:", error);
      throw error;
    }
  }

  async deleteStudent(id: number): Promise<void> {
    try {
      const { error } = await supabase
        .from("students")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    } catch (error) {
      console.error("Error deleting student:", error);
      throw error;
    }
  }

  // Payments
  async getPayments(): Promise<Payment[]> {
    try {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .order("id", { ascending: false });
      
      if (error) throw error;
      return (data || []).map(row => ({
        id: row.id,
        tokenNumber: row.token_number,
        date: row.date,
        studentId: row.student_id,
        registerNo: row.register_no,
        studentName: row.student_name,
        duration: row.duration,
        amount: row.amount,
        paymentMethod: row.payment_method,
        createdAt: new Date(row.created_at),
      }));
    } catch (error) {
      console.error("Error fetching payments:", error);
      throw error;
    }
  }

  async getPaymentById(id: number): Promise<Payment | undefined> {
    try {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("id", id)
        .single();
      
      if (error && error.code !== "PGRST116") throw error;
      if (!data) return undefined;
      
      return {
        id: data.id,
        tokenNumber: data.token_number,
        date: data.date,
        studentId: data.student_id,
        registerNo: data.register_no,
        studentName: data.student_name,
        duration: data.duration,
        amount: data.amount,
        paymentMethod: data.payment_method,
        createdAt: new Date(data.created_at),
      };
    } catch (error) {
      console.error("Error fetching payment by id:", error);
      throw error;
    }
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    try {
      const dbPayment = {
        token_number: payment.tokenNumber,
        date: payment.date,
        student_id: payment.studentId,
        register_no: payment.registerNo,
        student_name: payment.studentName,
        duration: payment.duration,
        amount: payment.amount,
        payment_method: payment.paymentMethod,
      };
      
      const { data, error } = await supabase
        .from("payments")
        .insert([dbPayment])
        .select()
        .single();
      
      if (error) throw error;
      
      return {
        id: data.id,
        tokenNumber: data.token_number,
        date: data.date,
        studentId: data.student_id,
        registerNo: data.register_no,
        studentName: data.student_name,
        duration: data.duration,
        amount: data.amount,
        paymentMethod: data.payment_method,
        createdAt: new Date(data.created_at),
      };
    } catch (error) {
      console.error("Error creating payment:", error);
      throw error;
    }
  }

  async updatePayment(id: number, payment: Partial<Omit<InsertPayment, 'studentId' | 'registerNo' | 'studentName'>>): Promise<Payment> {
    try {
      const dbPayment: any = {};
      if (payment.tokenNumber) dbPayment.token_number = payment.tokenNumber;
      if (payment.date) dbPayment.date = payment.date;
      if (payment.duration !== undefined) dbPayment.duration = payment.duration;
      if (payment.amount !== undefined) dbPayment.amount = payment.amount;
      if (payment.paymentMethod) dbPayment.payment_method = payment.paymentMethod;
      
      const { data, error } = await supabase
        .from("payments")
        .update(dbPayment)
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      
      return {
        id: data.id,
        tokenNumber: data.token_number,
        date: data.date,
        studentId: data.student_id,
        registerNo: data.register_no,
        studentName: data.student_name,
        duration: data.duration,
        amount: data.amount,
        paymentMethod: data.payment_method,
        createdAt: new Date(data.created_at),
      };
    } catch (error) {
      console.error("Error updating payment:", error);
      throw error;
    }
  }

  async deletePayment(id: number): Promise<void> {
    try {
      const { error } = await supabase
        .from("payments")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    } catch (error) {
      console.error("Error deleting payment:", error);
      throw error;
    }
  }

  // Vendors
  async getVendors(): Promise<Vendor[]> {
    try {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .order("id", { ascending: false });

      if (error) throw error;
      return (data || []).map(mapVendorRow);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      throw error;
    }
  }

  async getVendorById(id: number): Promise<Vendor | undefined> {
    try {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .eq("id", id)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      if (!data) return undefined;

      return mapVendorRow(data);
    } catch (error) {
      console.error("Error fetching vendor by id:", error);
      throw error;
    }
  }

  async createVendor(vendor: InsertVendor, password?: string): Promise<Vendor> {
    try {
      // Create Supabase auth user with email = phone@gmail.com
      let authUid: string | null = null;
      if (supabaseAdmin) {
        const authEmail = `${vendor.phone}@gmail.com`;
        const authPassword = password || vendor.phone; // use provided password, fallback to phone number
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: authEmail,
          password: authPassword,
          email_confirm: true, // auto-confirm so vendor can login immediately
          user_metadata: {
            first_name: vendor.firstName,
            last_name: vendor.lastName,
            name: `${vendor.firstName} ${vendor.lastName}`.trim(),
            full_name: `${vendor.firstName} ${vendor.lastName}`.trim(),
            phone: vendor.phone,
            role: "vendor",
          },
        });
        if (authError) {
          console.error("Error creating vendor auth user:", authError.message);
          // Don't block vendor creation if auth fails — just log it
        } else {
          authUid = authData?.user?.id ?? null;
        }
      }

      const dbVendor = {
        first_name: vendor.firstName,
        last_name: vendor.lastName,
        phone: vendor.phone,
        email: vendor.email || null,
        business_name: vendor.businessName || null,
        gst_number: vendor.gstNumber || null,
        pan_number: vendor.panNumber || null,
        address_line1: vendor.addressLine1 || null,
        address_line2: vendor.addressLine2 || null,
        city: vendor.city || null,
        state: vendor.state || null,
        zipcode: vendor.zipcode || null,
        area_name: vendor.areaName || null,
        status: vendor.status || "active",
        auth_uid: authUid,
      };

      const { data, error } = await supabase
        .from("vendors")
        .insert([dbVendor])
        .select()
        .single();

      if (error) throw error;
      return mapVendorRow(data);
    } catch (error) {
      console.error("Error creating vendor:", error);
      throw error;
    }
  }

  async updateVendor(id: number, vendor: Partial<InsertVendor>, options?: { password?: string }): Promise<Vendor> {
    try {
      const dbVendor: any = {};
      if (vendor.firstName !== undefined) dbVendor.first_name = vendor.firstName;
      if (vendor.lastName !== undefined) dbVendor.last_name = vendor.lastName;
      if (vendor.phone !== undefined) dbVendor.phone = vendor.phone;
      if (vendor.email !== undefined) dbVendor.email = vendor.email;
      if (vendor.businessName !== undefined) dbVendor.business_name = vendor.businessName;
      if (vendor.gstNumber !== undefined) dbVendor.gst_number = vendor.gstNumber;
      if (vendor.panNumber !== undefined) dbVendor.pan_number = vendor.panNumber;
      if (vendor.addressLine1 !== undefined) dbVendor.address_line1 = vendor.addressLine1;
      if (vendor.addressLine2 !== undefined) dbVendor.address_line2 = vendor.addressLine2;
      if (vendor.city !== undefined) dbVendor.city = vendor.city;
      if (vendor.state !== undefined) dbVendor.state = vendor.state;
      if (vendor.zipcode !== undefined) dbVendor.zipcode = vendor.zipcode;
      if (vendor.areaName !== undefined) dbVendor.area_name = vendor.areaName;
      if (vendor.status !== undefined) dbVendor.status = vendor.status;

      // Sync the Supabase auth login when phone/password/name change.
      const authUpdates: any = {};
      if (vendor.phone !== undefined) authUpdates.email = `${vendor.phone}@gmail.com`;
      if (options?.password) authUpdates.password = options.password;
      if (vendor.firstName !== undefined || vendor.lastName !== undefined) {
        const current = await this.getVendorById(id);
        const firstName = vendor.firstName ?? current?.firstName ?? "";
        const lastName = vendor.lastName ?? current?.lastName ?? "";
        const displayName = `${firstName} ${lastName}`.trim();
        authUpdates.user_metadata = {
          first_name: firstName,
          last_name: lastName,
          name: displayName,
          full_name: displayName,
          phone: vendor.phone ?? current?.phone,
          role: "vendor",
        };
      }

      if (supabaseAdmin && Object.keys(authUpdates).length > 0) {
        const current = await this.getVendorById(id);
        let authUid = current?.authUid ?? null;

        // Vendor has no linked auth user yet — create one now
        if (!authUid) {
          const email = `${vendor.phone ?? current?.phone}@gmail.com`;            const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: options?.password || vendor.phone || current?.phone || String(id),
            email_confirm: true,
            user_metadata: {
              first_name: vendor.firstName ?? current?.firstName,
              last_name: vendor.lastName ?? current?.lastName,
              name: `${vendor.firstName ?? current?.firstName ?? ""} ${vendor.lastName ?? current?.lastName ?? ""}`.trim(),
              full_name: `${vendor.firstName ?? current?.firstName ?? ""} ${vendor.lastName ?? current?.lastName ?? ""}`.trim(),
              phone: vendor.phone ?? current?.phone,
              role: "vendor",
            },
          });
          if (createErr) {
            console.error("Error creating missing vendor auth user:", createErr.message);
          } else {
            authUid = created.user?.id ?? null;
            dbVendor.auth_uid = authUid;
          }
        } else {
          const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(authUid, authUpdates);
          if (authErr) {
            console.error("Error syncing vendor auth user:", authErr.message);
          }
        }
      }

      const { data, error } = await supabase
        .from("vendors")
        .update(dbVendor)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return mapVendorRow(data);
    } catch (error) {
      console.error("Error updating vendor:", error);
      throw error;
    }
  }

  /**
   * Ensure every vendor in the vendors table has a Supabase auth user
   * ({phone}@gmail.com) and a linked auth_uid. Safe to run repeatedly.
   */
  async backfillVendorAuthUsers(): Promise<{ created: number; linked: number; failed: number }> {
    const result = { created: 0, linked: 0, failed: 0 };
    try {
      const vendors = await this.getVendors();
      if (!supabaseAdmin) {
        console.error("backfillVendorAuthUsers: SUPABASE_SERVICE_ROLE_KEY not configured");
        return { ...result, failed: vendors.length };
      }

      const { data: userData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (listErr) throw listErr;
      const byEmail = new Map(userData.users.map((u) => [u.email, u]));

      for (const v of vendors) {
        const email = `${v.phone}@gmail.com`;
        const existing = byEmail.get(email);
        try {
          if (existing) {
            if (v.authUid !== existing.id) {
              await supabase.from("vendors").update({ auth_uid: existing.id }).eq("id", v.id);
              result.linked++;
            }
          } else {
            const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
              email,
              password: v.phone, // fallback password, same as createVendor
              email_confirm: true,
              user_metadata: {
                first_name: v.firstName,
                last_name: v.lastName,
                name: `${v.firstName} ${v.lastName}`.trim(),
                full_name: `${v.firstName} ${v.lastName}`.trim(),
                phone: v.phone,
                role: "vendor",
              },
            });
            if (createErr) throw createErr;
            await supabase.from("vendors").update({ auth_uid: created.user!.id }).eq("id", v.id);
            result.created++;
          }
        } catch (err: any) {
          console.error(`backfillVendorAuthUsers: vendor #${v.id} (${v.phone}) failed:`, err?.message);
          result.failed++;
        }
      }
      return result;
    } catch (error) {
      console.error("backfillVendorAuthUsers failed:", error);
      return result;
    }
  }

  // Vendor Accounts
  async getVendorAccounts(): Promise<VendorAccount[]> {
    try {
      const { data, error } = await supabase
        .from("vendor_accounts")
        .select("*")
        .order("id", { ascending: false });

      if (error) throw error;
      return (data || []).map(mapVendorAccountRow);
    } catch (error) {
      console.error("Error fetching vendor accounts:", error);
      throw error;
    }
  }

  async getVendorAccountById(id: number): Promise<VendorAccount | undefined> {
    try {
      const { data, error } = await supabase
        .from("vendor_accounts")
        .select("*")
        .eq("id", id)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      if (!data) return undefined;

      return mapVendorAccountRow(data);
    } catch (error) {
      console.error("Error fetching vendor account by id:", error);
      throw error;
    }
  }

  async createVendorAccount(account: InsertVendorAccount): Promise<VendorAccount> {
    try {
      const dbAccount = {
        vendor_id: account.vendorId,
        available_days: account.availableDays ?? 0,
        credit_days: account.creditDays ?? 0,
        used_credits: account.usedCredits ?? 0,
        last_billing_date: account.lastBillingDate ?? null,
      };

      const { data, error } = await supabase
        .from("vendor_accounts")
        .insert([dbAccount])
        .select()
        .single();

      if (error) throw error;
      return mapVendorAccountRow(data);
    } catch (error) {
      console.error("Error creating vendor account:", error);
      throw error;
    }
  }

  async updateVendorAccount(id: number, account: Partial<InsertVendorAccount>): Promise<VendorAccount> {
    try {
      const dbAccount: any = {};
      if (account.vendorId !== undefined) dbAccount.vendor_id = account.vendorId;
      if (account.availableDays !== undefined) dbAccount.available_days = account.availableDays;
      if (account.creditDays !== undefined) dbAccount.credit_days = account.creditDays;
      if (account.usedCredits !== undefined) dbAccount.used_credits = account.usedCredits;
      if (account.lastBillingDate !== undefined) dbAccount.last_billing_date = account.lastBillingDate;

      const { data, error } = await supabase
        .from("vendor_accounts")
        .update(dbAccount)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return mapVendorAccountRow(data);
    } catch (error) {
      console.error("Error updating vendor account:", error);
      throw error;
    }
  }

  async deleteVendorAccount(id: number): Promise<void> {
    try {
      const { error } = await supabase
        .from("vendor_accounts")
        .delete()
        .eq("id", id);

      if (error) throw error;
    } catch (error) {
      console.error("Error deleting vendor account:", error);
      throw error;
    }
  }

  /**
   * Consume 1 day for a vendor: uses an available day first, then a credit day.
   * The credit counter goes 7/7 → 6/7 → ... → 1/7 → 0/7 (blocked at 0).
   * Returns the updated account, or null if the vendor has no account /
   * is already blocked (0 days left anywhere).
   */
  async consumeVendorCreditDay(vendorId: number): Promise<VendorAccount | null> {
    try {
      const { data: existing, error: fetchError } = await supabase
        .from("vendor_accounts")
        .select("*")
        .eq("vendor_id", vendorId)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") throw fetchError;
      if (!existing) return null; // no account → nothing to consume

      const availableDays = existing.available_days ?? 0;
      const creditDays = existing.credit_days ?? 0;
      const usedCredits = existing.used_credits ?? 0;

      // Still has paid available days → consume from those, credits untouched
      if (availableDays > 0) {
        const { data, error } = await supabase
          .from("vendor_accounts")
          .update({ available_days: availableDays - 1 })
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return mapVendorAccountRow(data);
      }

      // No available days left → consume from credit allowance (7/7 → 6/7 ...)
      const remainingCredits = creditDays - usedCredits;
      if (remainingCredits <= 0) {
        return mapVendorAccountRow(existing); // 0/7 → blocked, nothing consumed
      }

      const { data, error } = await supabase
        .from("vendor_accounts")
        .update({ used_credits: usedCredits + 1 })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return mapVendorAccountRow(data);
    } catch (error) {
      console.error("Error consuming vendor credit day:", error);
      throw error;
    }
  }

  /**
   * Check whether a vendor's account is blocked (no paid days left and
   * credit allowance fully consumed). Returns null if vendor not found.
   */
  async isVendorBlocked(vendorId: number): Promise<{ blocked: boolean; availableDays: number; remainingCredits: number; totalCredits: number; usedCredits: number; hasAccount: boolean; vendorName: string; businessName: string | null; phone: string; } | null> {
    try {
      const vendor = await this.getVendorById(vendorId);
      if (!vendor) return null;

      const { data: existing, error } = await supabase
        .from("vendor_accounts")
        .select("*")
        .eq("vendor_id", vendorId)
        .single();
      if (error && error.code !== "PGRST116") throw error;

      const availableDays = existing?.available_days ?? 0;
      const creditDays = existing?.credit_days ?? 0;
      const usedCredits = existing?.used_credits ?? 0;
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
    } catch (error) {
      console.error("Error checking vendor blocked status endpoint:", error);
      throw error;
    }
  }

  // Vendor Supabase Keys
  async getVendorSupabaseKeys(): Promise<VendorSupabaseKey[]> {
    try {
      const { data, error } = await supabase
        .from("vendor_supabase_keys")
        .select("*")
        .order("id", { ascending: false });

      if (error) throw error;
      return (data || []).map(mapVendorSupabaseKeyRow);
    } catch (error) {
      console.error("Error fetching vendor supabase keys:", error);
      throw error;
    }
  }

  async getVendorSupabaseKeyById(id: number): Promise<VendorSupabaseKey | undefined> {
    try {
      const { data, error } = await supabase
        .from("vendor_supabase_keys")
        .select("*")
        .eq("id", id)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      if (!data) return undefined;

      return mapVendorSupabaseKeyRow(data);
    } catch (error) {
      console.error("Error fetching vendor supabase key by id:", error);
      throw error;
    }
  }

  async createVendorSupabaseKey(key: InsertVendorSupabaseKey): Promise<VendorSupabaseKey> {
    try {
      const dbKey = {
        vendor_id: key.vendorId,
        supabase_url: key.supabaseUrl,
        anon_key: key.anonKey,
        database_url: key.databaseUrl,
        service_role_key: key.serviceRoleKey,
        port: key.port ?? 5000,
      };

      const { data, error } = await supabase
        .from("vendor_supabase_keys")
        .insert([dbKey])
        .select()
        .single();

      if (error) throw error;
      return mapVendorSupabaseKeyRow(data);
    } catch (error) {
      console.error("Error creating vendor supabase key:", error);
      throw error;
    }
  }

  async updateVendorSupabaseKey(id: number, key: Partial<InsertVendorSupabaseKey>): Promise<VendorSupabaseKey> {
    try {
      const dbKey: any = {};
      if (key.vendorId !== undefined) dbKey.vendor_id = key.vendorId;
      if (key.supabaseUrl !== undefined) dbKey.supabase_url = key.supabaseUrl;
      if (key.anonKey !== undefined) dbKey.anon_key = key.anonKey;
      if (key.databaseUrl !== undefined) dbKey.database_url = key.databaseUrl;
      if (key.serviceRoleKey !== undefined) dbKey.service_role_key = key.serviceRoleKey;
      if (key.port !== undefined) dbKey.port = key.port;

      const { data, error } = await supabase
        .from("vendor_supabase_keys")
        .update(dbKey)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return mapVendorSupabaseKeyRow(data);
    } catch (error) {
      console.error("Error updating vendor supabase key:", error);
      throw error;
    }
  }

  async deleteVendorSupabaseKey(id: number): Promise<void> {
    try {
      const { error } = await supabase
        .from("vendor_supabase_keys")
        .delete()
        .eq("id", id);

      if (error) throw error;
    } catch (error) {
      console.error("Error deleting vendor supabase key:", error);
      throw error;
    }
  }

  async getAdminSupabaseConfig() {
    return {
      supabaseUrl: maskSecret(process.env.SUPABASE_URL),
      anonKey: maskSecret(process.env.SUPABASE_ANON_KEY),
      databaseUrl: maskSecret(process.env.DATABASE_URL),
      serviceRoleKey: maskSecret(process.env.SUPABASE_SERVICE_ROLE_KEY),
      port: Number(process.env.PORT) || 5000,
    };
  }

  // Vendor Service Charge Plans
  async getVendorServicePlan(
    vendorId: number
  ): Promise<VendorServicePlan | null> {
    const { data, error } = await supabase
      .from("vendor_service_plans")
      .select("*")
      .eq("vendor_id", vendorId)
      .limit(1);

    if (error) {
      console.error("Error fetching vendor service plan:", error);
      throw error;
    }

    const row = data?.[0];
    return row ? mapVendorServicePlanRow(row) : null;
  }

  async upsertVendorServicePlan(
    vendorId: number,
    plan: Pick<
      InsertVendorServicePlan,
      "method" | "perUserCharge" | "defaultPrice"
    >
  ): Promise<VendorServicePlan> {
    const { data, error } = await supabase
      .from("vendor_service_plans")
      .upsert(
        {
          vendor_id: vendorId,
          method: plan.method,
          per_user_charge: plan.perUserCharge,
          default_price: plan.defaultPrice,
        },
        { onConflict: "vendor_id" }
      )
      .select("*");

    if (error) {
      console.error("Error upserting vendor service plan:", error);
      throw error;
    }

    return mapVendorServicePlanRow(data![0]);
  }

  async getVendorServiceCharge(
    vendorId: number
  ): Promise<VendorServiceChargeSummary> {
    const [plan, platform] = await Promise.all([
      this.getVendorServicePlan(vendorId),
      this.getPlatformSettings(),
    ]);

    const method: "per_user" | "fixed" =
      plan?.method === "fixed" ? "fixed" : "per_user";
    const perUserCharge = plan?.perUserCharge ?? 1;
    const defaultPrice = plan?.defaultPrice ?? 199;
    const platformFee = platform.platformFee;

    let userCount: number | null = null;
    let hasKeys = false;

    const { data: keyRows, error: keyError } = await supabase
      .from("vendor_supabase_keys")
      .select("*")
      .eq("vendor_id", vendorId)
      .limit(1);

    if (!keyError && keyRows?.[0]) {
      hasKeys = true;
      try {
        const vendorClient = createClient(
          keyRows[0].supabase_url,
          keyRows[0].service_role_key || keyRows[0].anon_key
        );
        const { count, error } = await vendorClient
          .from("students")
          .select("id", { count: "exact", head: true });
        if (!error) userCount = count ?? 0;
      } catch (error) {
        console.error("Error fetching user count for service charge:", error);
      }
    }

    const users = userCount ?? 0;
    const serviceCharge =
      method === "fixed"
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

  // Platform Settings (global, single row)
  async getPlatformSettings(): Promise<PlatformSettings> {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("*")
      .eq("id", 1)
      .limit(1);

    if (error) {
      console.error("Error fetching platform settings:", error);
      throw error;
    }

    if (!data?.[0]) {
      const now = new Date();
      return {
        id: 1,
        platformFee: 999,
        createdAt: now,
        updatedAt: now,
      };
    }

    return mapPlatformSettingsRow(data[0]);
  }

  async updatePlatformSettings(settings: {
    platformFee: number;
  }): Promise<PlatformSettings> {
    const { data, error } = await supabase
      .from("platform_settings")
      .upsert(
        {
          id: 1,
          platform_fee: settings.platformFee,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select("*");

    if (error) {
      console.error("Error updating platform settings:", error);
      throw error;
    }

    return mapPlatformSettingsRow(data![0]);
  }

  // Reports
  async getVendorReport(vendorId: number): Promise<VendorReport | null> {
    const { data: keyRows, error: keyError } = await supabase
      .from("vendor_supabase_keys")
      .select("*")
      .eq("vendor_id", vendorId)
      .limit(1);

    if (keyError) {
      console.error("Error fetching vendor keys for report:", keyError);
      throw keyError;
    }

    const keyRow = keyRows?.[0];
    if (!keyRow) return null;

    try {
      const vendorClient = createClient(
        keyRow.supabase_url,
        keyRow.service_role_key || keyRow.anon_key
      );

      const [studentsRes, paymentsRes, attendanceRes] = await Promise.all([
        vendorClient.from("students").select("*"),
        vendorClient.from("payments").select("*"),
        vendorClient.from("attendance").select("*"),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (attendanceRes.error) throw attendanceRes.error;

      const students = studentsRes.data || [];
      const payments = paymentsRes.data || [];
      const attendance = attendanceRes.data || [];

      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      const totalMembers = students.length;
      const activeMembers = students.filter(
        (s: any) => s.expiry_date && new Date(s.expiry_date) > now
      ).length;

      const sumAmount = (rows: any[]) =>
        rows.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

      const cashInHand = sumAmount(
        payments.filter((p: any) => p.payment_method === "cash")
      );
      const onlinePayments = sumAmount(
        payments.filter((p: any) => p.payment_method === "online")
      );
      const thisMonthIncome = sumAmount(
        payments.filter((p: any) => {
          const d = new Date(p.date);
          return (
            d.getFullYear() === currentYear && d.getMonth() === currentMonth
          );
        })
      );
      const totalIncome = sumAmount(payments);

      const todayAttendance = attendance.filter(
        (a: any) => a.date === today
      ).length;

      const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];

      const monthlyBreakdown = monthNames.map((month, index) => {
        const monthPayments = payments.filter((p: any) => {
          const d = new Date(p.date);
          return (
            d.getFullYear() === currentYear && d.getMonth() === index
          );
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
        totalPayments: payments.length,
        monthlyBreakdown,
      };
    } catch (error) {
      console.error("Error building vendor report:", error);
      throw error;
    }
  }

  // Attendance
  async getAttendanceByDate(date: string): Promise<Attendance[]> {
    try {
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("date", date);
      
      if (error) throw error;
      return (data || []).map(row => ({
        id: row.id,
        date: row.date,
        registerNo: row.register_no,
        studentName: row.student_name,
        timeIn: row.time_in,
        createdAt: new Date(row.created_at),
      }));
    } catch (error) {
      console.error("Error fetching attendance by date:", error);
      throw error;
    }
  }

  async getTodayAttendanceCount(): Promise<number> {
    try {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("attendance")
        .select("*", { count: "exact", head: true })
        .eq("date", today);
      
      if (error) throw error;
      return data?.length || 0;
    } catch (error) {
      console.error("Error fetching today attendance count:", error);
      throw error;
    }
  }

  async createAttendance(attendance: InsertAttendance): Promise<Attendance> {
    try {
      const dbAttendance = {
        date: attendance.date,
        register_no: attendance.registerNo,
        student_name: attendance.studentName,
        time_in: attendance.timeIn,
      };
      
      const { data, error } = await supabase
        .from("attendance")
        .insert([dbAttendance])
        .select()
        .single();
      
      if (error) throw error;
      
      return {
        id: data.id,
        date: data.date,
        registerNo: data.register_no,
        studentName: data.student_name,
        timeIn: data.time_in,
        createdAt: new Date(data.created_at),
      };
    } catch (error) {
      console.error("Error creating attendance:", error);
      throw error;
    }
  }

  // Dashboard stats
  async getDashboardStats() {
    try {
      const [studentsRes, attendanceRes] = await Promise.all([
        supabase.from("students").select("*"),
        supabase.from("attendance").select("*"),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (attendanceRes.error) throw attendanceRes.error;

      const allStudents = studentsRes.data || [];
      const today = new Date().toISOString().split("T")[0];
      const todayAttendance = (attendanceRes.data || []).filter(a => a.date === today).length;

      const now = new Date();
      const activeMemberships = allStudents.filter(s => {
        if (!s.expiry_date) return false;
        const expiry = new Date(s.expiry_date);
        return expiry > now;
      }).length;

      return {
        totalStudents: allStudents.length,
        activeMemberships,
        expiredMemberships: allStudents.length - activeMemberships,
        todayAttendance,
      };
    } catch (error) {
      console.error("Error getting dashboard stats:", error);
      throw error;
    }
  }

  // Income stats
  async getIncomeStats() {
    try {
      const { data: allPayments, error } = await supabase
        .from("payments")
        .select("*");

      if (error) throw error;

      const payments = allPayments || [];
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      const cashInHand = payments
        .filter(p => p.payment_method === "cash")
        .reduce((sum, p) => sum + p.amount, 0);

      const onlinePayments = payments
        .filter(p => p.payment_method === "online")
        .reduce((sum, p) => sum + p.amount, 0);

      const thisMonthIncome = payments
        .filter((p) => {
          const paymentDate = new Date(p.date);
          return (
            paymentDate.getFullYear() === currentYear &&
            paymentDate.getMonth() === currentMonth
          );
        })
        .reduce((sum, p) => sum + p.amount, 0);

      const thisYearIncome = payments
        .filter((p) => new Date(p.date).getFullYear() === currentYear)
        .reduce((sum, p) => sum + p.amount, 0);

      const totalOverallIncome = payments.reduce((sum, p) => sum + p.amount, 0);

      const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];

      const monthlyBreakdown = monthNames.map((month, index) => {
        const monthPayments = payments.filter((p) => {
          const paymentDate = new Date(p.date);
          return (
            paymentDate.getFullYear() === currentYear &&
            paymentDate.getMonth() === index
          );
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
        totalPaymentsReceived: payments.length,
      };
    } catch (error) {
      console.error("Error getting income stats:", error);
      throw error;
    }
  }
}

export const storage = new SupabaseStorage();

function mapVendorRow(row: any): Vendor {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    email: row.email ?? null,
    businessName: row.business_name ?? null,
    gstNumber: row.gst_number ?? null,
    panNumber: row.pan_number ?? null,
    addressLine1: row.address_line1 ?? null,
    addressLine2: row.address_line2 ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    zipcode: row.zipcode ?? null,
    areaName: row.area_name ?? null,
    status: row.status,
    authUid: row.auth_uid ?? null,
    createdAt: new Date(row.created_at),
  };
}

function mapVendorAccountRow(row: any): VendorAccount {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    availableDays: row.available_days ?? 0,
    creditDays: row.credit_days ?? 0,
    usedCredits: row.used_credits ?? 0,
    lastBillingDate: row.last_billing_date ?? null,
    createdAt: new Date(row.created_at),
  };
}

// Show only the first 3 characters, hide the rest behind dots.
function maskSecret(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  return value.length > 3 ? `${value.slice(0, 3)}....` : `${value}....`;
}

function mapVendorSupabaseKeyRow(row: any): VendorSupabaseKey {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    supabaseUrl: maskSecret(row.supabase_url) ?? "",
    anonKey: maskSecret(row.anon_key) ?? "",
    databaseUrl: maskSecret(row.database_url) ?? "",
    serviceRoleKey: maskSecret(row.service_role_key) ?? "",
    port: row.port ?? 5000,
    createdAt: new Date(row.created_at),
  };
}

function mapVendorServicePlanRow(row: any): VendorServicePlan {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    method: row.method === "fixed" ? "fixed" : "per_user",
    perUserCharge: row.per_user_charge ?? 1,
    defaultPrice: row.default_price ?? 199,
    createdAt: new Date(row.created_at),
  };
}

function mapPlatformSettingsRow(row: any): PlatformSettings {
  return {
    id: row.id ?? 1,
    platformFee: row.platform_fee ?? 999,
    createdAt: new Date(row.created_at ?? Date.now()),
    updatedAt: new Date(row.updated_at ?? Date.now()),
  };
}
