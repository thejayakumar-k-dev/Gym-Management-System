import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, date, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Shared validation regexes ───────────────────────────────────────────
// Single source of truth: used by server schemas and client-side forms.
export const NAME_REGEX =
  /^[A-Za-z][A-Za-z .'\-]*$/; // letters + space . ' - only, no special chars
export const PHONE_REGEX = /^\d{10}$/; // exactly 10 digits
export const ZIP_CODE_REGEX = /^\d{5,6}$/; // 5-6 digits
export const ADDRESS_REGEX =
  /^[A-Za-z0-9][A-Za-z0-9 ,.#'\/()\-]*$/; // no special symbols


export const MEMBER_BATCHES = ["morning", "evening"] as const;
export const memberBatchSchema = z.enum(MEMBER_BATCHES);
export type MemberBatch = z.infer<typeof memberBatchSchema>;

// Students table
export const students = pgTable("students", {
  id: serial("id").primaryKey(),
  registerNo: varchar("register_no", { length: 50 }).notNull().unique(),
  name: text("name").notNull(),
  batch: varchar("batch", { length: 10 }).$type<MemberBatch>().notNull().default("morning"),
  phone: varchar("phone", { length: 20 }).notNull(),
  address: text("address").notNull().default(""),
  joinDate: date("join_date").notNull(),
  expiryDate: date("expiry_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStudentSchema = createInsertSchema(students)
  .omit({
    id: true,
    createdAt: true,
    expiryDate: true,
  })
  .extend({
    registerNo: z
      .string()
      .trim()
      .min(1, "Member ID is required")
      .regex(/^\d+$/, "Member ID must contain only numbers"),
    name: z
      .string()
      .min(1, "Name is required")
      .regex(NAME_REGEX, "Name cannot contain special characters"),
    batch: memberBatchSchema.default("morning"),
    phone: z
      .string()
      .regex(PHONE_REGEX, "Phone number must be exactly 10 digits"),
    address: z
      .string()
      .trim()
      .refine(
        (val) => !val || ADDRESS_REGEX.test(val),
        "Address cannot contain special characters"
      )
      .optional()
      .default(""),
  });

export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type Student = typeof students.$inferSelect;

// Vendors table
export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull().default(""),
  phone: varchar("phone", { length: 20 }).notNull(),
  email: text("email"),
  businessName: text("business_name"),
  gstNumber: text("gst_number"),
  panNumber: text("pan_number"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  zipcode: varchar("zipcode", { length: 20 }),
  areaName: text("area_name"),
  status: varchar("status", { length: 20 }).notNull().default("active"), // 'active' or 'inactive'
  authUid: text("auth_uid"), // Neon Auth user ID for vendor login
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVendorSchema = createInsertSchema(vendors)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    firstName: z
      .string()
      .min(1, "First name is required")
      .regex(NAME_REGEX, "First name cannot contain special characters"),
    lastName: z
      .string()
      .regex(NAME_REGEX, "Last name cannot contain special characters")
      .optional()
      .or(z.literal("")),
    phone: z
      .string()
      .regex(PHONE_REGEX, "Phone number must be exactly 10 digits"),
    email: z
      .string()
      .email("Invalid email address")
      .optional()
      .or(z.literal("")),
    businessName: z.string().optional().or(z.literal("")),
    gstNumber: z.string().optional().or(z.literal("")),
    panNumber: z.string().optional().or(z.literal("")),
    addressLine1: z
      .string()
      .min(1, "Address line 1 is required")
      .regex(ADDRESS_REGEX, "Address cannot contain special characters"),
    addressLine2: z
      .string()
      .regex(ADDRESS_REGEX, "Address cannot contain special characters")
      .optional()
      .or(z.literal("")),
    city: z
      .string()
      .min(1, "City is required")
      .regex(NAME_REGEX, "City cannot contain special characters"),
    state: z
      .string()
      .min(1, "State is required")
      .regex(NAME_REGEX, "State cannot contain special characters"),
    zipcode: z
      .string()
      .regex(ZIP_CODE_REGEX, "Enter a valid zipcode (5-6 digits)"),
    areaName: z
      .string()
      .min(1, "Area name is required")
      .regex(NAME_REGEX, "Area name cannot contain special characters"),
  });

export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendors.$inferSelect;

// Vendor Accounts table
export const vendorAccounts = pgTable("vendor_accounts", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id")
    .notNull()
    .references(() => vendors.id, { onDelete: "cascade" }),
  availableDays: integer("available_days").notNull().default(0),
  creditDays: integer("credit_days").notNull().default(0),
  usedCredits: integer("used_credits").notNull().default(0), // consumed credit days: 6/7 left = 1 outstanding, 0/7 = blocked
  lastBillingDate: date("last_billing_date"), // last day the daily auto-reduction ran for this vendor
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVendorAccountSchema = createInsertSchema(vendorAccounts)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    vendorId: z.coerce
      .number()
      .int()
      .positive("Select a vendor"),
    availableDays: z.coerce
      .number()
      .int()
      .min(0, "Available days cannot be negative"),
    creditDays: z.coerce
      .number()
      .int()
      .min(0, "Credit days cannot be negative"),
    // usedCredits is managed internally (consume/daily billing) - optional from client
    usedCredits: z.coerce.number().int().min(0).optional(),
    lastBillingDate: z.string().optional().nullable(),
  });

export type InsertVendorAccount = z.infer<typeof insertVendorAccountSchema>;
export type VendorAccount = typeof vendorAccounts.$inferSelect;

// Vendor Neon Projects table
// Stores Neon project credentials for each vendor/gym.
// Currently only "gym-admin" (the admin project) is configured;
// each future gym will have its own row here.
export const vendorNeonProjects = pgTable("vendor_neon_projects", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id")
    .notNull()
    .references(() => vendors.id, { onDelete: "cascade" }),
  authUrl: text("auth_url").notNull(),
  apiKey: text("api_key").notNull(),
  databaseUrl: text("database_url").notNull(),
  authSecret: text("auth_secret").notNull(),
  port: integer("port").notNull().default(5000),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVendorNeonProjectSchema = createInsertSchema(
  vendorNeonProjects
)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    vendorId: z.coerce.number().int().positive("Select a vendor"),
    authUrl: z
      .string()
      .min(1, "Neon Auth URL is required")
      .url("Enter a valid Neon Auth URL"),
    apiKey: z.string().min(1, "API key is required"),
    databaseUrl: z.string().min(1, "Database URL is required"),
    authSecret: z.string().min(1, "Auth secret is required"),
    port: z.coerce
      .number()
      .int()
      .min(1, "Enter a valid port")
      .max(65535, "Enter a valid port")
      .default(5000),
  });

export type InsertVendorNeonProject = z.infer<
  typeof insertVendorNeonProjectSchema
>;
export type VendorNeonProject = typeof vendorNeonProjects.$inferSelect;

// Vendor Service Charge Plans table
// Service charge = max(users * perUserCharge, defaultPrice)
export const vendorServicePlans = pgTable("vendor_service_plans", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id")
    .notNull()
    .unique()
    .references(() => vendors.id, { onDelete: "cascade" }),
  method: varchar("method", { length: 20 }).notNull().default("per_user"), // 'per_user' or 'fixed'
  perUserCharge: integer("per_user_charge").notNull().default(1), // rupees charged per user
  defaultPrice: integer("default_price").notNull().default(199), // minimum service charge
  // Per-vendor platform fee. NULL = fall back to the global default in
  // platform_settings, so individual gyms can be charged differently.
  platformFee: integer("platform_fee"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVendorServicePlanSchema = createInsertSchema(
  vendorServicePlans
)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    vendorId: z.coerce.number().int().positive("Select a vendor"),
    method: z.enum(["per_user", "fixed"]).default("per_user"),
    perUserCharge: z.coerce
      .number()
      .int()
      .min(0, "Per user charge cannot be negative"),
    defaultPrice: z.coerce
      .number()
      .int()
      .min(0, "Default price cannot be negative"),
    platformFee: z.coerce
      .number()
      .int()
      .min(0, "Platform fee cannot be negative")
      .nullable()
      .optional(),
  });

export type InsertVendorServicePlan = z.infer<
  typeof insertVendorServicePlanSchema
>;
export type VendorServicePlan = typeof vendorServicePlans.$inferSelect;

// Platform Settings table — single global row (id = 1) shared by all vendors.
export const platformSettings = pgTable("platform_settings", {
  id: integer("id").primaryKey().default(1),
  platformFee: integer("platform_fee").notNull().default(999),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPlatformSettingsSchema = createInsertSchema(platformSettings)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    platformFee: z.coerce
      .number()
      .int()
      .min(0, "Platform fee cannot be negative"),
  });

export type InsertPlatformSettings = z.infer<typeof insertPlatformSettingsSchema>;
export type PlatformSettings = typeof platformSettings.$inferSelect;

// Membership Plans table — per-vendor plan pricing keyed by duration in months.
// Drives the Membership Plans tab and auto-calculates payment amounts.
export const membershipPlans = pgTable("membership_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default(""),
  durationMonths: integer("duration_months").notNull().unique(), // months
  price: integer("price").notNull().default(0), // rupees
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Starter plans (1 Month / 3 Month / 1 Year). Not seeded automatically any
// more — kept as an optional starting point for a future "add default plans".
export const DEFAULT_MEMBERSHIP_PLANS = [
  {
    name: "1 Month",
    durationMonths: 1,
    price: 0,
  },
  {
    name: "3 Month",
    durationMonths: 3,
    price: 0,
  },
  {
    name: "1 Year",
    durationMonths: 12,
    price: 0,
  },
] as const;

export const insertMembershipPlanSchema = createInsertSchema(membershipPlans)
  .omit({
    id: true,
    updatedAt: true,
  })
  .extend({
    name: z
      .string()
      .min(1, "Plan name is required")
      .max(60, "Name is too long"),
    durationMonths: z.coerce
      .number()
      .int("Duration must be whole months")
      .min(1, "Duration must be at least 1 month")
      .max(120, "Duration cannot exceed 120 months"),
    price: z.coerce
      .number()
      .int()
      .min(0, "Price cannot be negative"),
  });

export type InsertMembershipPlan = z.infer<typeof insertMembershipPlanSchema>;
export type MembershipPlan = typeof membershipPlans.$inferSelect;

// Computed service charge summary for a vendor (plan + live user count).
export type VendorServiceChargeSummary = {
  vendorId: number;
  method: "per_user" | "fixed";
  perUserCharge: number;
  defaultPrice: number;
  platformFee: number;
  userCount: number | null;
  serviceCharge: number;
  total: number;
  hasKeys: boolean;
};

// Aggregated summary report pulled from a vendor's own Neon database.
export type VendorReport = {
  totalMembers: number;
  activeMembers: number;
  expiredMembers: number;
  todayAttendance: number;
  cashInHand: number;
  onlinePayments: number;
  thisMonthIncome: number;
  totalIncome: number;
  totalPayments: number;
  monthlyBreakdown: { month: string; amount: number; count: number }[];
};

// Payments table
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  tokenNumber: varchar("token_number", { length: 50 }).notNull().unique(),
  date: date("date").notNull(),
  studentId: integer("student_id").notNull(),
  registerNo: varchar("register_no", { length: 50 }).notNull(),
  studentName: text("student_name").notNull(),
  duration: integer("duration").notNull(), // months
  amount: integer("amount").notNull(), // in rupees
  paymentMethod: varchar("payment_method", { length: 20 }).notNull(), // 'cash' or 'online'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
});

export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// Attendance table
export const attendance = pgTable("attendance", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  registerNo: varchar("register_no", { length: 50 }).notNull(),
  studentName: text("student_name").notNull(),
  timeIn: text("time_in").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAttendanceSchema = createInsertSchema(attendance).omit({
  id: true,
  createdAt: true,
});

export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendance.$inferSelect;
