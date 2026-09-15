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
} from "@shared/schema";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables");
}

const supabase = createClient(supabaseUrl, supabaseKey);

export interface IStorage {
  // Students
  getStudents(): Promise<Student[]>;
  getStudentById(id: number): Promise<Student | undefined>;
  getStudentByRegisterNo(registerNo: string): Promise<Student | undefined>;
  createStudent(student: InsertStudent): Promise<Student>;
  updateStudent(id: number, student: Partial<InsertStudent>): Promise<Student>;
  deleteStudent(id: number): Promise<void>;

  // Payments
  getPayments(): Promise<Payment[]>;
  getPaymentById(id: number): Promise<Payment | undefined>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: number, payment: Partial<Omit<InsertPayment, 'studentId' | 'registerNo' | 'studentName'>>): Promise<Payment>;
  deletePayment(id: number): Promise<void>;

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

  async createStudent(student: InsertStudent): Promise<Student> {
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

  async updateStudent(id: number, student: Partial<InsertStudent>): Promise<Student> {
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
