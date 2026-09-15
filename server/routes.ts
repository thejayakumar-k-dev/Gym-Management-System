import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertStudentSchema, insertPaymentSchema, insertAttendanceSchema } from "@shared/schema";

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
      const validatedData = insertStudentSchema.parse(req.body);
      
      // Check if register number already exists
      const existing = await storage.getStudentByRegisterNo(validatedData.registerNo);
      if (existing) {
        return res.status(400).json({ error: "Register number already exists" });
      }

      const student = await storage.createStudent(validatedData);
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

      const updatedStudent = await storage.updateStudent(id, req.body);
      res.json(updatedStudent);
    } catch (error) {
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
  return httpServer;
}
