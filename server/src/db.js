const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required. Set Postgres connection string in environment variables.");
}

function shouldUseSsl(url) {
  try {
    const host = new URL(url).hostname;
    return host !== "localhost" && host !== "127.0.0.1";
  } catch (_error) {
    return true;
  }
}

const pool = new Pool({
  connectionString,
  ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false,
});

function normalizeSql(sql) {
  let normalized = String(sql || "");
  normalized = normalized.replace(/datetime\('now'\)/g, "NOW()");
  normalized = normalized.replace(/datetime\(([^,()]+),\s*'localtime'\)/g, "($1)");
  normalized = normalized.replace(/datetime\(([^()]+)\)/g, "($1)");
  return normalized;
}

function splitSqlStatements(sql) {
  return String(sql || "")
    .split(/;\s*(?:\r?\n|$)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function runSchemaInit(client) {
  const schemaPath = path.resolve(__dirname, "..", "sql", "init.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  const statements = splitSqlStatements(schemaSql);
  for (const statement of statements) {
    await client.query(statement);
  }
}

async function seedServiceOptions(client) {
  const defaults = [
    { type: "material", code: "pla", name: "PLA", priceDelta: 0, sortOrder: 1 },
    { type: "material", code: "abs", name: "ABS", priceDelta: 400, sortOrder: 2 },
    { type: "material", code: "petg", name: "PETG", priceDelta: 600, sortOrder: 3 },
    { type: "material", code: "resin", name: "Смола", priceDelta: 1200, sortOrder: 4 },
    { type: "technology", code: "fdm", name: "FDM", priceDelta: 0, sortOrder: 1 },
    { type: "technology", code: "sla", name: "SLA", priceDelta: 1000, sortOrder: 2 },
    { type: "technology", code: "sls", name: "SLS", priceDelta: 1300, sortOrder: 3 },
    { type: "color", code: "white", name: "Белый", priceDelta: 0, sortOrder: 1 },
    { type: "color", code: "black", name: "Черный", priceDelta: 100, sortOrder: 2 },
    { type: "color", code: "green", name: "Зеленый", priceDelta: 150, sortOrder: 3 },
    { type: "thickness", code: "0.1", name: "0.1 мм", priceDelta: 600, sortOrder: 1 },
    { type: "thickness", code: "0.2", name: "0.2 мм", priceDelta: 300, sortOrder: 2 },
    { type: "thickness", code: "0.3", name: "0.3 мм", priceDelta: 0, sortOrder: 3 },
  ];

  for (const option of defaults) {
    await client.query(
      `INSERT INTO service_options (id, type, code, name, price_delta, sort_order, active)
       VALUES ($1, $2, $3, $4, $5, $6, 1)
       ON CONFLICT (type, code)
       DO UPDATE SET
         name = EXCLUDED.name,
         price_delta = EXCLUDED.price_delta,
         sort_order = EXCLUDED.sort_order,
         active = EXCLUDED.active`,
      [randomUUID(), option.type, option.code, option.name, option.priceDelta, option.sortOrder]
    );
  }
}

async function ensureAdminUser(client) {
  const adminPhone = process.env.ADMIN_PHONE || "+79990000000";
  const adminPasswordHash =
    process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync(process.env.ADMIN_PASSWORD || "Admin12345!", 12);

  await client.query(
    `INSERT INTO users (id, phone, password_hash, full_name, role, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'admin', 1, NOW(), NOW())
     ON CONFLICT (phone)
     DO UPDATE SET
       role = 'admin',
       password_hash = EXCLUDED.password_hash,
       full_name = EXCLUDED.full_name,
       updated_at = NOW()`,
    [randomUUID(), adminPhone, adminPasswordHash, "Администратор"]
  );
}

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await runSchemaInit(client);
    await seedServiceOptions(client);
    await ensureAdminUser(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const initPromise = initDb().catch((error) => {
  console.error("Database initialization failed:", error);
  throw error;
});

async function query(sql, params = []) {
  await initPromise;
  const result = await pool.query(normalizeSql(sql), params);
  return {
    rows: result.rows || [],
    rowCount: result.rowCount || 0,
  };
}

module.exports = { query, pool };
