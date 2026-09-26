import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { log } from "./logger.js";
import { getDb, type DrizzleDB } from "./db.js";
import { insertStudentSchema, insertPaymentSchema, insertAttendanceSchema, insertVendorSchema, insertVendorAccountSchema, insertVendorNeonProjectSchema, insertVendorServicePlanSchema, insertPlatformSettingsSchema, insertMembershipPlanSchema, type MemberBatch } from "../shared/schema.js";
import { addMonths } from "../shared/duration.js";
import { z } from "zod";

/**
 * Bulk student import.
 *
 * Capped at 1000 rows: the whole file is validated and inserted in one request,
 * so an unbounded array would be a cheap way for a client to pin the event loop
 * and hold a transaction open.
 */
const MAX_IMPORT_ROWS = 1000;

const importStudentsBodySchema = z.object({
  students: z
    .array(z.record(z.any()))
    .min(1, "No rows to import")
    .max(MAX_IMPORT_ROWS, `Cannot import more than ${MAX_IMPORT_ROWS} students at a time`),
});

type ImportRowResult = {
  /** 1-based spreadsheet row number, header included. */
  row: number;
  registerNo: string;
  name: string;
  status: "success" | "failed";
  error?: string;
};

/**
 * `join_date` is a Postgres DATE column and everything downstream —
 * `isMembershipExpired`, `getDaysLeft`, date filters, sorting — treats it as
 * ISO `YYYY-MM-DD`. The zod schema types it as a plain string with no format
 * check, so a spreadsheet cell has to be parsed and normalised here or it would
 * sail through validation and then blow up as an opaque per-row database error,
 * or worse, be stored as literal "15-01-2026" and never compare correctly again.
 *
 * The template asks for day-month-year, which is how people in this locale read
 * a date, so `DD-MM-YYYY` is the documented form. `DD/MM/YYYY` is accepted
 * because nobody types a hyphen when they mean a slash, and `YYYY-MM-DD` is
 * kept so templates downloaded before this change still import.
 *
 * `DD-MM` is deliberately never read as `MM-DD`: guessing would silently turn a
 * membership expiry into a different month.
 */
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_FIRST_DATE_PATTERN = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;

/** Rejects well-shaped but impossible dates like 31-02-2026 or month 13. */
function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

type ParsedImportDate = { iso: string } | { error: string };

function normaliseImportDate(value: unknown, label: string): ParsedImportDate | null {
  const raw = String(value ?? "").trim();

  const iso = ISO_DATE_PATTERN.exec(raw);
  if (iso) {
    const [, year, month, day] = iso;
    if (!isRealCalendarDate(+year, +month, +day)) {
      return { error: `${label} "${raw}" is not a real date` };
    }
    return { iso: `${year}-${month}-${day}` };
  }

  const dayFirst = DAY_FIRST_DATE_PATTERN.exec(raw);
  if (dayFirst) {
    const [, day, month, year] = dayFirst;
    if (!isRealCalendarDate(+year, +month, +day)) {
      return { error: `${label} "${raw}" is not a real date` };
    }
    return {
      iso: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
    };
  }

  return { error: `${label} must be DD-MM-YYYY, for example 15-01-2026` };
}

/**
 * Map whatever a spreadsheet put in the Batch column onto a real batch.
 * Returns null for a value we can't interpret so the row can be reported
 * rather than silently defaulting to "morning".
 */
function normaliseBatch(value: unknown): MemberBatch | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "") return "morning";
  if (raw === "morning" || raw === "m" || raw === "am") return "morning";
  if (raw === "evening" || raw === "e" || raw === "pm") return "evening";
  return null;
}

function isAdminRequest(req: Request): boolean {
  const adminUid = process.env.VITE_ADMIN_UID || process.env.ADMIN_UID;
  return Boolean(adminUid && (req as any).auth?.user?.id === adminUid);
}

function isUniqueViolation(error: any): boolean {
  return error?.code === "23505" || error?.cause?.code === "23505";
}

/**
 * Resolves which database a request should read/write from.
 *
 * - Admin impersonating a vendor: uses the `x-vendor-id` request header.
 * - Vendor logged in: maps the Firebase UID to their vendor record.
 * - Otherwise (admin panel, anonymous, no Neon project): central DB (null).
 */
async function resolveVendorDb(req: Request): Promise<DrizzleDB | undefined> {
  let vendorId: number | null = null;

  const headerVendorId = Number((req.headers["x-vendor-id"] as string) ?? "");
  if (Number.isInteger(headerVendorId) && headerVendorId > 0) {
    vendorId = headerVendorId;
  } else if ((req as any).auth?.user?.id) {
    const auth = (req as any).auth.user;
    let vendor = await storage.getVendorByAuthUid(auth.id);
    // Legacy vendors may not have authUid stored — fall back to their phone email.
    if (!vendor && auth.email) {
      const phone = auth.email.match(/^(\d{10})@gmail\.com$/)?.[1];
      if (phone) vendor = await storage.getVendorByPhone(phone);
    }
    if (vendor) vendorId = vendor.id;
  }

  if (!vendorId) return undefined;

  const project = await storage.getVendorNeonProjectByVendorId(vendorId);
  if (!project?.databaseUrl) return undefined;

  try {
    return getDb(project.databaseUrl);
  } catch (error) {
    console.error("[routes] Failed to connect to vendor Neon project:", error);
    return undefined;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Dashboard stats
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats(await resolveVendorDb(req));
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  // Students endpoints
  app.get("/api/students", async (req, res) => {
    try {
      const students = await storage.getStudents(await resolveVendorDb(req));
      res.json(students);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch students" });
    }
  });

  app.get("/api/students/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const student = await storage.getStudentById(id, await resolveVendorDb(req));
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }
      res.json(student);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch student" });
    }
  });

  app.post("/api/students", async (req, res) => {
    try {
      const validatedData = insertStudentSchema.parse(req.body);
      const registerNo = validatedData.registerNo.trim();
      const vdb = await resolveVendorDb(req);
      const existingStudent = await storage.getStudentByRegisterNo(registerNo, vdb);

      if (existingStudent) {
        return res.status(409).json({ error: "Member ID already exists" });
      }

      const student = await storage.createStudent({ ...validatedData, registerNo }, vdb);
      res.status(201).json(student);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ error: "Invalid student data", details: error.errors });
      }
      if (isUniqueViolation(error)) {
        return res.status(409).json({ error: "Member ID already exists" });
      }
      res.status(500).json({ error: "Failed to create student" });
    }
  });

  app.post("/api/students/import", async (req, res) => {
    try {
      // The envelope only checks the shape of the batch. Each row is validated
      // individually below so one bad member can't fail the whole file.
      const parsed = importStudentsBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid import payload", details: parsed.error.errors });
      }

      const rows = parsed.data.students;
      const vdb = await resolveVendorDb(req);

      const results: ImportRowResult[] = [];
      let imported = 0;

      // Sequential rather than one bulk INSERT: every row needs its own
      // validation verdict and its own duplicate-key attribution, and a gym's
      // import is tens to low hundreds of rows, not millions.
      for (let index = 0; index < rows.length; index++) {
        // +1 for the header row, +1 to make it 1-based like a spreadsheet.
        const rowNumber = index + 2;
        const row = rows[index];
        const registerNo = String(row.registerNo ?? "").trim();
        const name = String(row.name ?? "").trim();
        const fail = (error: string) =>
          results.push({ row: rowNumber, registerNo, name, status: "failed", error });

        const batch = normaliseBatch(row.batch);
        if (batch === null) {
          fail("Batch must be Morning or Evening");
          continue;
        }

        const joinDateCell = String(row.joinDate ?? "").trim();
        if (joinDateCell === "") {
          fail("Join Date is required");
          continue;
        }
        const parsedJoinDate = normaliseImportDate(joinDateCell, "Join Date");
        if (parsedJoinDate === null) {
          fail("Join Date is required");
          continue;
        }
        if ("error" in parsedJoinDate) {
          fail(parsedJoinDate.error);
          continue;
        }
        const joinDate = parsedJoinDate.iso;

        const validated = insertStudentSchema.safeParse({
          registerNo,
          name,
          batch,
          phone: String(row.phone ?? "").trim(),
          address: String(row.address ?? "").trim(),
          joinDate,
        });
        if (!validated.success) {
          fail(validated.error.errors[0]?.message ?? "Invalid student data");
          continue;
        }

        try {
          // Expiry is owned by payments, not by the import, so it always starts
          // empty: the member shows as Pay Required with 0 days left until a
          // payment sets a real expiry. An Expiry Date column left over in an
          // older file is ignored rather than trusted against payment history.
          await storage.createStudent(
            { ...validated.data, expiryDate: null },
            vdb,
          );
          imported++;
          results.push({ row: rowNumber, registerNo, name, status: "success" });
        } catch (error: any) {
          fail(
            isUniqueViolation(error)
              ? "Member ID already exists"
              : "Failed to save student",
          );
        }
      }

      res.json({
        total: rows.length,
        imported,
        failed: rows.length - imported,
        results,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to import students" });
    }
  });

  app.patch("/api/students/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const vdb = await resolveVendorDb(req);
      const student = await storage.getStudentById(id, vdb);
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      const validatedData = insertStudentSchema.partial().parse(req.body);
      if (validatedData.registerNo !== undefined) {
        const registerNo = validatedData.registerNo.trim();
        const existingStudent = await storage.getStudentByRegisterNo(registerNo, vdb);
        if (existingStudent && existingStudent.id !== id) {
          return res.status(409).json({ error: "Member ID already exists" });
        }
        validatedData.registerNo = registerNo;
      }

      const updatedStudent = await storage.updateStudent(
        id,
        {
          ...validatedData,
          batch: validatedData.batch ?? student.batch,
        },
        vdb
      );
      res.json(updatedStudent);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ error: "Invalid student data", details: error.errors });
      }
      if (isUniqueViolation(error)) {
        return res.status(409).json({ error: "Member ID already exists" });
      }
      res.status(500).json({ error: "Failed to update student" });
    }
  });

  app.delete("/api/students/:id", async (req, res) => {
    try {
      if (!isAdminRequest(req)) {
        return res.status(403).json({ error: "Only admins can delete students" });
      }
      const id = parseInt(req.params.id);
      const vdb = await resolveVendorDb(req);
      const student = await storage.getStudentById(id, vdb);
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      await storage.deleteStudent(id, vdb);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete student" });
    }
  });

  // Vendors endpoints
  app.get("/api/vendors", async (_req, res) => {
    try {
      const vendors = await storage.getVendors();
      res.json(vendors);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch vendors" });
    }
  });

  app.get("/api/vendors/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const vendor = await storage.getVendorById(id);
      if (!vendor) {
        return res.status(404).json({ error: "Vendor not found" });
      }
      res.json(vendor);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch vendor" });
    }
  });

  app.post("/api/vendors", async (req, res) => {
    try {
      const { password, ...body } = req.body;
      const validatedData = insertVendorSchema.parse(body);
      const vendor = await storage.createVendor(validatedData, password);
      res.status(201).json(vendor);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid vendor data", details: error.errors });
      }
      if (error.message?.startsWith("Login not created")) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to create vendor" });
    }
  });

  app.patch("/api/vendors/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const vendor = await storage.getVendorById(id);
      if (!vendor) {
        return res.status(404).json({ error: "Vendor not found" });
      }

      const { password, ...body } = req.body;
      const updatedVendor = await storage.updateVendor(
        id,
        insertVendorSchema.partial().parse(body),
        { password }
      );
      res.json(updatedVendor);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ error: "Invalid vendor data", details: error.errors });
      }
      if (error.message?.startsWith("Login not created") || error.message?.startsWith("Auth sync failed")) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to update vendor" });
    }
  });

  // One-click repair: create missing Neon Auth users for vendors and
  // link any unlinked auth_uids. Safe to run repeatedly.
  app.post("/api/vendors/backfill-auth", async (_req, res) => {
    try {
      const result = await storage.backfillVendorAuthUsers();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to backfill vendor auth users" });
    }
  });

  // Public status endpoint for the login screen: is this vendor's account blocked?
  app.get("/api/vendor-accounts/status/:phone", async (req, res) => {
    try {
      const phone = String(req.params.phone || "").replace(/\D/g, "");
      if (phone.length !== 10) {
        return res.status(400).json({ error: "Valid 10-digit phone required" });
      }

      const vendors = await storage.getVendors();
      const vendor = vendors.find((v) => v.phone === phone);
      if (!vendor) {
        return res.status(404).json({ error: "Vendor not found" });
      }

      const status = await storage.isVendorBlocked(vendor.id);
      if (!status) {
        return res.status(404).json({ error: "Vendor not found" });
      }
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch vendor status" });
    }
  });

  // Vendor Accounts endpoints
  app.get("/api/vendor-accounts", async (_req, res) => {
    try {
      const accounts = await storage.getVendorAccounts();
      res.json(accounts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch vendor accounts" });
    }
  });

  app.post("/api/vendor-accounts", async (req, res) => {
    try {
      const validatedData = insertVendorAccountSchema.parse(req.body);
      const account = await storage.createVendorAccount(validatedData);
      res.status(201).json(account);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid vendor account data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create vendor account" });
    }
  });

  app.patch("/api/vendor-accounts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const account = await storage.getVendorAccountById(id);
      if (!account) {
        return res.status(404).json({ error: "Vendor account not found" });
      }

      const updated = await storage.updateVendorAccount(
        id,
        insertVendorAccountSchema.partial().parse(req.body)
      );
      res.json(updated);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ error: "Invalid vendor account data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update vendor account" });
    }
  });

  app.delete("/api/vendor-accounts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const account = await storage.getVendorAccountById(id);
      if (!account) {
        return res.status(404).json({ error: "Vendor account not found" });
      }

      await storage.deleteVendorAccount(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete vendor account" });
    }
  });

  // Consume one day for a vendor: paid days first, then credit days
  // (7/7 → 6/7 → ... → 0/7 → blocked)
  app.post("/api/vendor-accounts/consume", async (req, res) => {
    try {
      const vendorId = Number(req.body?.vendorId);
      if (!Number.isInteger(vendorId) || vendorId <= 0) {
        return res.status(400).json({ error: "Valid vendorId is required" });
      }

      const account = await storage.consumeVendorCreditDay(vendorId);
      if (!account) {
        return res.status(404).json({ error: "Vendor account not found" });
      }

      const remainingCredits = Math.max(account.creditDays - account.usedCredits, 0);
      res.json({
        account,
        remainingCredits,
        blocked: remainingCredits <= 0 && account.availableDays <= 0,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to consume vendor credit" });
    }
  });

  // Force the daily day-billing sweep for every account and report how many
  // balances were touched. The sweep also runs lazily on every read, so this is
  // only needed to settle days without waiting for someone to open the tab.
  app.post("/api/vendor-accounts/run-billing", async (_req, res) => {
    try {
      const updated = await storage.runDailyVendorBilling();
      res.json({ updated, ranAt: new Date().toISOString() });
    } catch (error) {
      res.status(500).json({ error: "Failed to run vendor billing" });
    }
  });

  // Vendor Neon Projects endpoints
  app.get("/api/vendor-neon-projects", async (_req, res) => {
    try {
      const projects = await storage.getVendorNeonProjects();
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch vendor Neon projects" });
    }
  });

  // Admin config comes from .env and is always returned masked.
  app.get("/api/admin-neon-config", async (_req, res) => {
    try {
      const config = await storage.getAdminNeonConfig();
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch admin Neon config" });
    }
  });

  app.post("/api/vendor-neon-projects", async (req, res) => {
    try {
      const vendorId = Number(req.body?.vendorId);
      if (!Number.isInteger(vendorId) || vendorId <= 0) {
        return res.status(400).json({ error: "Select a valid vendor" });
      }

      const vendor = await storage.getVendorById(vendorId);
      if (!vendor) {
        return res.status(404).json({ error: "Vendor not found" });
      }

      const nameHint =
        typeof req.body?.projectName === "string" &&
        req.body.projectName.trim()
          ? req.body.projectName.trim()
          : undefined;

      const project = await storage.createVendorNeonProject(vendorId, nameHint);
      res.status(201).json(project);
    } catch (error: any) {
      console.error("[routes] Failed to provision Neon project:", error.message);
      res.status(500).json({ error: error.message || "Failed to create vendor Neon project" });
    }
  });

  app.patch("/api/vendor-neon-projects/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const project = await storage.getVendorNeonProjectById(id);
      if (!project) {
        return res.status(404).json({ error: "Vendor Neon project not found" });
      }

      const updated = await storage.updateVendorNeonProject(
        id,
        insertVendorNeonProjectSchema.partial().parse(req.body)
      );
      res.json(updated);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ error: "Invalid Neon project data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update vendor Neon project" });
    }
  });

  app.delete("/api/vendor-neon-projects/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const project = await storage.getVendorNeonProjectById(id);
      if (!project) {
        return res.status(404).json({ error: "Vendor Neon project not found" });
      }

      await storage.deleteVendorNeonProject(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete vendor Neon project" });
    }
  });

  // Reports endpoint — aggregates data from the vendor's own Neon database.
  app.get("/api/reports/vendor/:vendorId", async (req, res) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      if (Number.isNaN(vendorId)) {
        return res.status(400).json({ error: "Invalid vendor id" });
      }

      const report = await storage.getVendorReport(vendorId);
      if (!report) {
        return res
          .status(404)
          .json({ error: "No Neon project configured for this vendor" });
      }
      res.json(report);
    } catch (error) {
      res
        .status(502)
        .json({ error: "Failed to load report from the vendor database" });
    }
  });

  // Vendor service charge plan — plan config + live user count from the vendor DB.
  app.get("/api/vendor-service-charge/:vendorId", async (req, res) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      if (Number.isNaN(vendorId)) {
        return res.status(400).json({ error: "Invalid vendor id" });
      }
      const summary = await storage.getVendorServiceCharge(vendorId);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: "Failed to load service charge plan" });
    }
  });

  app.put("/api/vendor-service-charge/:vendorId", async (req, res) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      if (Number.isNaN(vendorId)) {
        return res.status(400).json({ error: "Invalid vendor id" });
      }

      const parsed = insertVendorServicePlanSchema.parse({
        ...req.body,
        vendorId,
      });
      // Platform fee is stored per vendor (NULL → global default), so saving
      // one vendor's plan no longer changes the fee for every other vendor.
      await storage.upsertVendorServicePlan(vendorId, {
        method: parsed.method,
        perUserCharge: parsed.perUserCharge,
        defaultPrice: parsed.defaultPrice,
        platformFee: parsed.platformFee ?? null,
      });

      const summary = await storage.getVendorServiceCharge(vendorId);
      res.json(summary);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res
          .status(400)
          .json({ error: "Invalid service plan data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to save service charge plan" });
    }
  });

  // Platform settings — global single row shared by all vendors.
  app.get("/api/platform-settings", async (_req, res) => {
    try {
      res.json(await storage.getPlatformSettings());
    } catch (error) {
      res.status(500).json({ error: "Failed to load platform settings" });
    }
  });

  app.put("/api/platform-settings", async (req, res) => {
    try {
      const parsed = insertPlatformSettingsSchema.parse(req.body);
      const settings = await storage.updatePlatformSettings({
        platformFee: parsed.platformFee,
      });
      res.json(settings);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res
          .status(400)
          .json({ error: "Invalid platform settings", details: error.errors });
      }
      res.status(500).json({ error: "Failed to save platform settings" });
    }
  });

  // Membership plans — plan prices used to auto-calculate payment amounts.
  app.get("/api/membership-plans", async (req, res) => {
    try {
      const plans = await storage.getMembershipPlans(await resolveVendorDb(req));
      res.json(plans);
    } catch (error) {
      res.status(500).json({ error: "Failed to load membership plans" });
    }
  });

  app.post("/api/membership-plans", async (req, res) => {
    try {
      const parsed = insertMembershipPlanSchema.parse(req.body);
      const vdb = await resolveVendorDb(req);
      const plan = await storage.createMembershipPlan({
        name: parsed.name,
        durationMonths: parsed.durationMonths,
        price: parsed.price,
      }, vdb);
      res.status(201).json(plan);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res
          .status(400)
          .json({ error: "Invalid membership plan", details: error.errors });
      }
      if (isUniqueViolation(error)) {
        return res
          .status(400)
          .json({ error: "A plan with this duration already exists" });
      }
      res.status(500).json({ error: "Failed to create membership plan" });
    }
  });

  app.put("/api/membership-plans/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ error: "Invalid plan id" });
      }
      const parsed = insertMembershipPlanSchema.parse(req.body);
      const vdb = await resolveVendorDb(req);
      const plan = await storage.updateMembershipPlan(id, {
        name: parsed.name,
        durationMonths: parsed.durationMonths,
        price: parsed.price,
      }, vdb);
      if (!plan) {
        return res.status(404).json({ error: "Membership plan not found" });
      }
      res.json(plan);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res
          .status(400)
          .json({ error: "Invalid membership plan", details: error.errors });
      }
      if (isUniqueViolation(error)) {
        return res
          .status(400)
          .json({ error: "A plan with this duration already exists" });
      }
      res.status(500).json({ error: "Failed to update membership plan" });
    }
  });

  app.delete("/api/membership-plans/:id", async (req, res) => {
    try {
      if (!isAdminRequest(req)) {
        return res.status(403).json({ error: "Only admins can delete membership plans" });
      }
      const id = parseInt(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ error: "Invalid plan id" });
      }
      const vdb = await resolveVendorDb(req);
      const deleted = await storage.deleteMembershipPlan(id, vdb);
      if (!deleted) {
        return res.status(404).json({ error: "Membership plan not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete membership plan" });
    }
  });

  // Payments endpoints
  app.get("/api/payments", async (req, res) => {
    try {
      const payments = await storage.getPayments(await resolveVendorDb(req));
      res.json(payments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });

  app.post("/api/payments", async (req, res) => {
    try {
      const clientToken =
        typeof req.body?.tokenNumber === "string" &&
        /^TKN-\d+$/.test(req.body.tokenNumber)
          ? req.body.tokenNumber
          : null;
      const tokenNumber = clientToken || `TKN-${Date.now()}`;
      const validatedData = insertPaymentSchema.parse({
        ...req.body,
        tokenNumber,
      });
      const vdb = await resolveVendorDb(req);
      const payment = await storage.createPayment(validatedData, vdb);

      // Update student's expiry date based on payment duration (in months)
      const today = new Date();
      const expiryDate = addMonths(today, validatedData.duration);

      // Update student with new expiry date
      await storage.updateStudent(validatedData.studentId, {
        expiryDate: expiryDate.toISOString().split("T")[0],
      }, vdb);

      res.status(201).json(payment);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid payment data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create payment" });
    }
  });

  app.patch("/api/payments/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const vdb = await resolveVendorDb(req);
      const payment = await storage.getPaymentById(id, vdb);
      if (!payment) {
        return res.status(404).json({ error: "Payment not found" });
      }

      const updatedPayment = await storage.updatePayment(id, req.body, vdb);
      res.json(updatedPayment);
    } catch (error) {
      res.status(500).json({ error: "Failed to update payment" });
    }
  });

  app.delete("/api/payments/:id", async (req, res) => {
    try {
      if (!isAdminRequest(req)) {
        return res.status(403).json({ error: "Only admins can delete payments" });
      }
      const id = parseInt(req.params.id);
      const vdb = await resolveVendorDb(req);
      const payment = await storage.getPaymentById(id, vdb);
      if (!payment) {
        return res.status(404).json({ error: "Payment not found" });
      }

      await storage.deletePayment(id, vdb);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete payment" });
    }
  });

  // Income stats
  app.get("/api/income/stats", async (req, res) => {
    try {
      // `?year=` scopes the year-based figures; absent or invalid means the
      // current year (getIncomeStats sanitises it).
      const rawYear = Number(req.query.year);
      const year =
        req.query.year != null && String(req.query.year).trim() !== "" && Number.isInteger(rawYear)
          ? rawYear
          : undefined;
      const stats = await storage.getIncomeStats(await resolveVendorDb(req), year);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch income stats" });
    }
  });

  // Attendance endpoints
  app.get("/api/attendance", async (req, res) => {
    try {
      const vdb = await resolveVendorDb(req);
      const today = new Date().toISOString().split("T")[0];
      const from = (req.query.from as string) || undefined;
      const to = (req.query.to as string) || undefined;

      // `?from=&to=` is a range (inclusive); `?date=` stays supported as the
      // single-day form the attendance pad and older clients use.
      if (from || to) {
        const records = await storage.getAttendanceInRange(
          from || to!,
          to || from!,
          vdb,
        );
        return res.json(records);
      }

      const date = (req.query.date as string) || today;
      const records = await storage.getAttendanceByDate(date, vdb);
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch attendance records" });
    }
  });

  app.post("/api/attendance", async (req, res) => {
    try {
      const vdb = await resolveVendorDb(req);

      // Accept registerNumber from attendance pad or registerNo from students dashboard
      const registerNumber = req.body.registerNumber || req.body.registerNo;
      
      if (!registerNumber || registerNumber === "") {
        return res.status(400).json({ 
          type: "error",
          message: "Member ID is required",
          student: null,
          daysLeft: 0,
          isExpired: false
        });
      }

      // Convert to string for database lookup
      const registerNoString = String(registerNumber).trim();
      if (!/^\d+$/.test(registerNoString)) {
        return res.status(400).json({
          type: "error",
          message: "Member ID must contain only numbers",
          student: null,
          daysLeft: 0,
          isExpired: false
        });
      }

      // Step 1: Check if student exists
      const student = await storage.getStudentByRegisterNo(registerNoString, vdb);
      if (!student) {
        return res.status(404).json({ 
          type: "error",
          message: "Student not found",
          student: null,
          daysLeft: 0,
          isExpired: false
        });
      }

      // Step 2: Calculate days left
      const now = new Date();
      let daysLeft = 0;
      if (student.expiryDate) {
        const expiryDate = new Date(student.expiryDate);
        // Calculate full days remaining
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const expiryStart = new Date(expiryDate.getFullYear(), expiryDate.getMonth(), expiryDate.getDate());
        const daysDiff = Math.ceil((expiryStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
        daysLeft = daysDiff;
      }
      
      // Expired if: no expiry date OR days left <= 0
      const isExpired = !student.expiryDate || daysLeft <= 0;

      // Step 3: Check if expired FIRST - don't insert for expired members
      if (isExpired) {
        return res.status(200).json({ 
          type: "expired",
          message: "You have to pay the fees",
          student: {
            name: student.name,
            registerNumber: student.registerNo,
            expiryDate: student.expiryDate
          },
          daysLeft,
          isExpired: true
        });
      }

      // Step 4: Check if already marked today (only for active members)
      const today = new Date().toISOString().split("T")[0];
      const existingRecord = await storage.getAttendanceByDate(today, vdb);
      const alreadyMarked = existingRecord.some((r) => r.registerNo === registerNoString);

      if (alreadyMarked) {
        return res.status(200).json({ 
          type: "warning",
          message: "Attendance already marked for today",
          student: {
            name: student.name,
            registerNumber: student.registerNo,
            expiryDate: student.expiryDate
          },
          daysLeft,
          isExpired: false
        });
      }

      // Step 5: Active member and not yet marked - insert attendance
      const timeIn = now.toISOString();

      await storage.createAttendance({
        date: today,
        registerNo: student.registerNo,
        studentName: student.name,
        timeIn,
      }, vdb);

      // Return success response
      res.status(200).json({ 
        type: "success",
        message: "Attendance marked successfully",
        student: {
          name: student.name,
          registerNumber: student.registerNo,
          expiryDate: student.expiryDate
        },
        daysLeft,
        isExpired: false
      });
    } catch (error: any) {
      res.status(500).json({ 
        type: "error",
        message: "Failed to record attendance",
        student: null,
        daysLeft: 0,
        isExpired: false
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
