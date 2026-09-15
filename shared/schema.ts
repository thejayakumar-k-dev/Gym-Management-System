import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, date, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Students table
export const students = pgTable("students", {
  id: serial("id").primaryKey(),
  registerNo: varchar("register_no", { length: 50 }).notNull().unique(),
  name: text("name").notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  address: text("address").notNull(),
  joinDate: date("join_date").notNull(),
  expiryDate: date("expiry_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStudentSchema = createInsertSchema(students).omit({
  id: true,
  createdAt: true,
  expiryDate: true,
});

export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type Student = typeof students.$inferSelect;

// Payments table
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  tokenNumber: varchar("token_number", { length: 50 }).notNull().unique(),
  date: date("date").notNull(),
  studentId: integer("student_id").notNull(),
  registerNo: varchar("register_no", { length: 50 }).notNull(),
  studentName: text("student_name").notNull(),
  duration: integer("duration").notNull(), // days
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
