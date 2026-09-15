// One-off script: creates the vendors table only. Does NOT touch other tables.
import "dotenv/config";
import pg from "pg";

const SQL = `
CREATE TABLE IF NOT EXISTS vendors (
  id serial PRIMARY KEY,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone varchar(20) NOT NULL,
  email text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zipcode varchar(20),
  area_name text,
  status varchar(20) NOT NULL DEFAULT 'active',
  created_at timestamp NOT NULL DEFAULT now()
);
`;

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(SQL);
  console.log("OK: vendors table created (or already exists)");
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
