/**
 * One-off migration: allocate a Neon project for every vendor that doesn't
 * have one, copy the central-DB vendor data (students, payments, attendance)
 * into it, then remove the copied rows from the central DB.
 *
 * Usage:
 *   npx tsx server/scripts/migrate-vendor-data.ts --dry-run   # just show the plan
 *   npx tsx server/scripts/migrate-vendor-data.ts              # actually migrate
 *
 * Safe to re-run: vendors that already have a project are skipped, and rows
 * are deleted from the central DB only after every copy succeeds.
 */

import "dotenv/config";
import {
  db,
  getDb,
  type DrizzleDB,
} from "../db.js";
import {
  vendors,
  vendorNeonProjects,
  students,
  payments,
  attendance,
  type Vendor,
  type Student,
  type Payment,
  type Attendance,
} from "../../shared/schema.js";
import { createNeonProject } from "../neon-api.js";
import { runMigration } from "../migrate.js";
import { encrypt } from "../crypto.js";

const DRY_RUN = process.argv.includes("--dry-run");

function projectNameFor(vendor: Vendor): string {
  const rawName = vendor.businessName?.trim() || `Gym-${vendor.id}`;
  return (
    rawName
      .replace(/[^a-zA-Z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || `Gym-${vendor.id}`
  );
}

async function provisionFor(vendor: Vendor): Promise<DrizzleDB> {
  const name = projectNameFor(vendor);
  console.log(`  [provision] Creating Neon project "${name}"`);
  const project = await createNeonProject(name);
  const connUri = project.connection_uris?.[0]?.pooler_connection_uri;
  if (!connUri) {
    throw new Error(`No connection URI for project "${name}"`);
  }

  console.log(`  [provision] Running migration on "${name}"`);
  const migration = await runMigration(connUri);
  if (!migration.success) {
    throw new Error(`Migration failed on "${name}": ${migration.error}`);
  }

  await db.insert(vendorNeonProjects).values({
    vendorId: vendor.id,
    authUrl: encrypt(project.connection_uris?.[0]?.host || ""),
    apiKey: encrypt(project.connection_uris?.[0]?.api_password || ""),
    databaseUrl: encrypt(connUri),
    authSecret: encrypt(project.connection_uris?.[0]?.password || ""),
    port: 5000,
  });

  console.log(`  [provision] Stored encrypted credentials for vendor #${vendor.id}`);
  return getDb(connUri);
}

async function copyTo(vendorDb: DrizzleDB): Promise<{ students: number; payments: number; attendance: number }> {
  const destinationHasRows = (await vendorDb.select().from(students).limit(1)).length > 0;
  if (destinationHasRows) {
    console.log("  [copy] Vendor DB already has data — skipping copy");
    return { students: 0, payments: 0, attendance: 0 };
  }

  const centralStudents: Student[] = await db.select().from(students);
  const centralPayments: Payment[] = await db.select().from(payments);
  const centralAttendance: Attendance[] = await db.select().from(attendance);

  if (centralStudents.length > 0) {
    await vendorDb.insert(students).values(
      centralStudents.map((s) => ({
        id: s.id,
        registerNo: s.registerNo,
        name: s.name,
        batch: s.batch,
        phone: s.phone,
        address: s.address,
        joinDate: s.joinDate,
        expiryDate: s.expiryDate,
        createdAt: s.createdAt,
      }))
    );
  }
  if (centralPayments.length > 0) {
    await vendorDb.insert(payments).values(
      centralPayments.map((p) => ({
        id: p.id,
        tokenNumber: p.tokenNumber,
        date: p.date,
        studentId: p.studentId,
        registerNo: p.registerNo,
        studentName: p.studentName,
        duration: p.duration,
        amount: p.amount,
        paymentMethod: p.paymentMethod,
        createdAt: p.createdAt,
      }))
    );
  }
  if (centralAttendance.length > 0) {
    await vendorDb.insert(attendance).values(
      centralAttendance.map((a) => ({
        id: a.id,
        date: a.date,
        registerNo: a.registerNo,
        studentName: a.studentName,
        timeIn: a.timeIn,
        createdAt: a.createdAt,
      }))
    );
  }

  console.log(
    `  [copy] Copied ${centralStudents.length} students, ${centralPayments.length} payments, ${centralAttendance.length} attendance`
  );
  return {
    students: centralStudents.length,
    payments: centralPayments.length,
    attendance: centralAttendance.length,
  };
}

import { storage } from "../storage.js";

async function main() {
  console.log(`=== Vendor data migration (${DRY_RUN ? "DRY RUN" : "LIVE"}) ===`);
  if (DRY_RUN) console.log("No data will be changed.");

  const allVendors = await db.select().from(vendors).orderBy(vendors.id);

  const centralStudents = await storage.getStudents();
  const centralPayments = await db.select().from(payments);
  const centralAttendance = await db.select().from(attendance);
  const centralCounts = {
    students: centralStudents.length,
    payments: centralPayments.length,
    attendance: centralAttendance.length,
  };
  console.log(`Central DB: ${centralCounts.students} students, ${centralCounts.payments} payments, ${centralCounts.attendance} attendance`);

  let totalCopied = { students: 0, payments: 0, attendance: 0 };
  let totalRemoved = { students: 0, payments: 0, attendance: 0 };

  for (const vendor of allVendors) {
    console.log(`\nVendor #${vendor.id} ${vendor.firstName} ${vendor.lastName || ""} (${vendor.phone})`);
    const project = await storage.getVendorNeonProjectByVendorId(vendor.id);

    if (!project?.databaseUrl) {
      console.log("  [status] No Neon project connected to this vendor.");
      if (DRY_RUN) {
        console.log(`  [provision] Would try to auto-create "${projectNameFor(vendor)}" (blocked by org unless API key permits).`);
        console.log(`  [copy] Would copy ${centralCounts.students} students, ${centralCounts.payments} payments, ${centralCounts.attendance} attendance`);
        continue;
      }
      try {
        await provisionFor(vendor);
      } catch (error) {
        console.error(`  [provision] FAILED: ${(error as Error).message}`);
        console.error("  Central data NOT deleted for this vendor. Connect a Neon project manually (Neon console or Neon Projects page), then re-run.");
        continue;
      }
    }

    let vendorDb: DrizzleDB;
    if (DRY_RUN) {
      console.log(`  [copy] Would copy ${centralCounts.students} students, ${centralCounts.payments} payments, ${centralCounts.attendance} attendance into connected project, then remove them from central DB`);
      continue;
    }

    const projectRow =
      project?.databaseUrl ? project : (await storage.getVendorNeonProjectByVendorId(vendor.id))!;
    vendorDb = await getDb(projectRow.databaseUrl);

    const copied = await copyTo(vendorDb);
    totalCopied.students += copied.students;
    totalCopied.payments += copied.payments;
    totalCopied.attendance += copied.attendance;

    // Remove from central DB only after this vendor's copy fully succeeded.
    if (copied.students + copied.payments + copied.attendance > 0) {
      await db.delete(attendance);
      await db.delete(payments);
      await db.delete(students);
      totalRemoved.students += copied.students;
      totalRemoved.payments += copied.payments;
      totalRemoved.attendance += copied.attendance;
      console.log(`  [cleanup] Removed ${copied.attendance} attendance, ${copied.payments} payments, ${copied.students} students from central DB.`);
    }
  }

  if (DRY_RUN) {
    console.log("\n[plan] Dry run only — nothing was changed. Run without --dry-run to execute.");
    return;
  }

  console.log(`\nMigration complete. Copied ${totalCopied.students} students, ${totalCopied.payments} payments, ${totalCopied.attendance} attendance; removed ${totalRemoved.students} students, ${totalRemoved.payments} payments, ${totalRemoved.attendance} attendance from central DB.`);
  if (totalCopied.students + totalCopied.payments + totalCopied.attendance === 0) {
    console.log("Nothing to migrate — every vendor either has no connected project or an empty connected DB.");
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});