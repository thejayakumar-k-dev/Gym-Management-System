import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { log } from "./vite";
import { insertStudentSchema, insertPaymentSchema, insertAttendanceSchema, insertVendorSchema, insertVendorAccountSchema, insertVendorNeonProjectSchema, insertVendorServicePlanSchema, insertPlatformSettingsSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Dashboard stats
  app.get("/api/dashboard/stats", async (_req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  // Students endpoints
  app.get("/api/students", async (_req, res) => {
    try {
      const students = await storage.getStudents();
      res.json(students);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch students" });
    }
  });

  app.get("/api/students/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const student = await storage.getStudentById(id);
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
      const validatedData = insertStudentSchema.omit({ registerNo: true }).parse(req.body);

      // Auto-generate sequential register number: 1, 2, 3, ...
      const allStudents = await storage.getStudents();
      const maxNum = allStudents.reduce((max, s) => {
        const n = parseInt(s.registerNo, 10);
        return Number.isFinite(n) && n > max ? n : max;
      }, 0);
      const registerNo = String(maxNum + 1);

      const student = await storage.createStudent({ ...validatedData, registerNo });
      res.status(201).json(student);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid student data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create student" });
    }
  });

  app.patch("/api/students/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const student = await storage.getStudentById(id);
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      const updatedStudent = await storage.updateStudent(
        id,
        insertStudentSchema.partial().parse(req.body)
      );
      res.json(updatedStudent);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ error: "Invalid student data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update student" });
    }
  });

  app.delete("/api/students/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const student = await storage.getStudentById(id);
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      await storage.deleteStudent(id);
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

      const remainingCredits = account.creditDays - account.usedCredits;
      res.json({
        account,
        remainingCredits,
        blocked: remainingCredits <= 0 && account.availableDays <= 0,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to consume vendor credit" });
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
      const validatedData = insertVendorNeonProjectSchema.parse(req.body);
      const project = await storage.createVendorNeonProject(validatedData);
      res.status(201).json(project);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid Neon project data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create vendor Neon project" });
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
      await storage.upsertVendorServicePlan(vendorId, {
        method: parsed.method,
        perUserCharge: parsed.perUserCharge,
        defaultPrice: parsed.defaultPrice,
      });

      if (req.body?.platformFee !== undefined) {
        const platform = insertPlatformSettingsSchema.parse({
          platformFee: req.body.platformFee,
        });
        await storage.updatePlatformSettings({
          platformFee: platform.platformFee,
        });
      }

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

  // Payments endpoints
  app.get("/api/payments", async (_req, res) => {
    try {
      const payments = await storage.getPayments();
      res.json(payments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });

  app.post("/api/payments", async (req, res) => {
    try {
      const tokenNumber = `TKN-${Date.now()}`;
      const validatedData = insertPaymentSchema.parse({
        ...req.body,
        tokenNumber,
      });
      const payment = await storage.createPayment(validatedData);
      
      // Update student's expiry date based on payment duration
      const today = new Date();
      const expiryDate = new Date(today);
      expiryDate.setDate(expiryDate.getDate() + validatedData.duration);
      
      // Update student with new expiry date
      await storage.updateStudent(validatedData.studentId, {
        expiryDate: expiryDate.toISOString().split("T")[0],
      });
      
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
      const payment = await storage.getPaymentById(id);
      if (!payment) {
        return res.status(404).json({ error: "Payment not found" });
      }

      const updatedPayment = await storage.updatePayment(id, req.body);
      res.json(updatedPayment);
    } catch (error) {
      res.status(500).json({ error: "Failed to update payment" });
    }
  });

  app.delete("/api/payments/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const payment = await storage.getPaymentById(id);
      if (!payment) {
        return res.status(404).json({ error: "Payment not found" });
      }

      await storage.deletePayment(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete payment" });
    }
  });

  // Income stats
  app.get("/api/income/stats", async (_req, res) => {
    try {
      const stats = await storage.getIncomeStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch income stats" });
    }
  });

  // Attendance endpoints
  app.get("/api/attendance", async (req, res) => {
    try {
      const date = req.query.date as string || new Date().toISOString().split("T")[0];
      const records = await storage.getAttendanceByDate(date);
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch attendance records" });
    }
  });

  app.post("/api/attendance", async (req, res) => {
    try {
      // Accept registerNumber from attendance pad or registerNo from students dashboard
      const registerNumber = req.body.registerNumber || req.body.registerNo;
      
      if (!registerNumber || registerNumber === "") {
        return res.status(400).json({ 
          type: "error",
          message: "Register number is required",
          student: null,
          daysLeft: 0,
          isExpired: false
        });
      }

      // Convert to string for database lookup
      const registerNoString = String(registerNumber).trim();

      // Step 1: Check if student exists
      const student = await storage.getStudentByRegisterNo(registerNoString);
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
      const existingRecord = await storage.getAttendanceByDate(today);
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
      });

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

  // ── Daily auto-reduction of vendor account days ──
  // Available days reduce 1/day while > 0; when 0, credit counter ticks
  // 7/7 → 6/7 → ... → 0/7; at 0/7 the account is blocked.
  // Runs once at startup + once every 24h. Idempotent via last_billing_date.
  const runDailyVendorBilling = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const accounts = await storage.getVendorAccounts();
      let availableReduced = 0;
      let creditsConsumed = 0;
      let blockedNow = 0;

      for (const account of accounts) {
        const lastBilling = account.lastBillingDate; // 'YYYY-MM-DD' or null
        if (lastBilling === today) continue; // already ran today for this vendor

        if (account.availableDays > 0) {
          // Phase 1: burn paid days one per day
          await storage.updateVendorAccount(account.id, {
            availableDays: account.availableDays - 1,
            lastBillingDate: today,
          });
          availableReduced++;
        } else {
          // Phase 2: paid days exhausted → burn credit days one per day
          const remaining = account.creditDays - account.usedCredits;
          if (remaining > 0) {
            const used = account.usedCredits + 1;
            await storage.updateVendorAccount(account.id, {
              usedCredits: used,
              lastBillingDate: today,
            });
            creditsConsumed++;
            const after = account.creditDays - used;
            if (after <= 0) blockedNow++;
          }
          // remaining <= 0 → already at 0/7, blocked; nothing to burn
        }
      }

      if (availableReduced || creditsConsumed || blockedNow) {
        log(
          `Daily vendor billing: ${availableReduced} available days reduced, ${creditsConsumed} credits consumed, ${blockedNow} newly blocked`
        );
      }
    } catch (error) {
      console.error("Daily vendor billing failed:", error);
    }
  };

  // Kick off immediately, then every 24 hours
  runDailyVendorBilling();
  setInterval(runDailyVendorBilling, 24 * 60 * 60 * 1000);

  return httpServer;
}
