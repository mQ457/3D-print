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

async function seedPrintInventory(client) {
  const rows = [
    {
      itemType: "technology",
      code: "tech-fdm",
      name: "FDM",
      technologyCode: "fdm",
      unit: "service",
      stockQty: 0,
      pricePerCm3: 0,
      sortOrder: 1,
      meta: { defaultSpeedCm3h: 22 },
    },
    {
      itemType: "technology",
      code: "tech-sla",
      name: "SLA",
      technologyCode: "sla",
      unit: "service",
      stockQty: 0,
      pricePerCm3: 0,
      sortOrder: 2,
      meta: { defaultSpeedCm3h: 18 },
    },
    {
      itemType: "material_variant",
      code: "fdm-pla-green-0.2",
      name: "PLA Зеленый 0.2мм",
      technologyCode: "fdm",
      materialCode: "pla",
      colorCode: "green",
      thicknessMm: 0.2,
      unit: "g",
      stockQty: 12000,
      pricePerCm3: 42,
      lowStockThreshold: 1800,
      stopStockThreshold: 500,
      sortOrder: 10,
      meta: { displayName: "PLA / Зеленый / 0.2 мм", densityGcm3: 1.24, defaultSpeedCm3h: 24 },
    },
    {
      itemType: "material_variant",
      code: "fdm-pla-white-0.3",
      name: "PLA Белый 0.3мм",
      technologyCode: "fdm",
      materialCode: "pla",
      colorCode: "white",
      thicknessMm: 0.3,
      unit: "g",
      stockQty: 8000,
      pricePerCm3: 36,
      lowStockThreshold: 1200,
      stopStockThreshold: 400,
      sortOrder: 11,
      meta: { displayName: "PLA / Белый / 0.3 мм", densityGcm3: 1.24, defaultSpeedCm3h: 28 },
    },
    {
      itemType: "material_variant",
      code: "fdm-abs-green-0.2",
      name: "ABS Зеленый 0.2мм",
      technologyCode: "fdm",
      materialCode: "abs",
      colorCode: "green",
      thicknessMm: 0.2,
      unit: "g",
      stockQty: 6000,
      pricePerCm3: 50,
      lowStockThreshold: 1000,
      stopStockThreshold: 300,
      sortOrder: 12,
      meta: { displayName: "ABS / Зеленый / 0.2 мм", densityGcm3: 1.04, defaultSpeedCm3h: 20 },
    },
    {
      itemType: "material_variant",
      code: "sla-resin-clear-0.1",
      name: "Resin Прозрачный 0.1мм",
      technologyCode: "sla",
      materialCode: "resin",
      colorCode: "clear",
      thicknessMm: 0.1,
      unit: "ml",
      stockQty: 5000,
      pricePerCm3: 95,
      lowStockThreshold: 900,
      stopStockThreshold: 250,
      sortOrder: 20,
      meta: { displayName: "Resin / Прозрачный / 0.1 мм", densityGcm3: 1.1, defaultSpeedCm3h: 16 },
    },
  ];

  for (const row of rows) {
    await client.query(
      `INSERT INTO print_inventory (
        id, item_type, code, name, technology_code, material_code, color_code, thickness_mm,
        unit, stock_qty, reserved_qty, consumed_qty, price_per_cm3, low_stock_threshold, stop_stock_threshold,
        active, sort_order, meta_json, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, 0, 0, $11, $12, $13, 1, $14, $15, NOW(), NOW()
      )
      ON CONFLICT (code)
      DO UPDATE SET
        item_type = EXCLUDED.item_type,
        name = EXCLUDED.name,
        technology_code = EXCLUDED.technology_code,
        material_code = EXCLUDED.material_code,
        color_code = EXCLUDED.color_code,
        thickness_mm = EXCLUDED.thickness_mm,
        unit = EXCLUDED.unit,
        price_per_cm3 = EXCLUDED.price_per_cm3,
        low_stock_threshold = EXCLUDED.low_stock_threshold,
        stop_stock_threshold = EXCLUDED.stop_stock_threshold,
        sort_order = EXCLUDED.sort_order,
        meta_json = EXCLUDED.meta_json,
        active = EXCLUDED.active,
        updated_at = NOW()`,
      [
        randomUUID(),
        row.itemType,
        row.code,
        row.name,
        row.technologyCode || null,
        row.materialCode || null,
        row.colorCode || null,
        row.thicknessMm ?? null,
        row.unit || "g",
        Number(row.stockQty || 0),
        Number(row.pricePerCm3 || 0),
        Number(row.lowStockThreshold || 1000),
        Number(row.stopStockThreshold || 300),
        Number(row.sortOrder || 0),
        row.meta ? JSON.stringify(row.meta) : null,
      ]
    );
  }
}

async function seedServicePricingRules(client) {
  const defaults = [
    {
      serviceType: "print",
      baseFee: 250,
      minPrice: 700,
      hourRate: 0,
      setupFee: 180,
      wastePercent: 8,
      supportPercent: 5,
      machineHourRate: 260,
      defaultModelVolumeCm3: 28,
    },
    {
      serviceType: "modeling",
      baseFee: 900,
      minPrice: 1800,
      hourRate: 1200,
      setupFee: 0,
      wastePercent: 0,
      supportPercent: 0,
      machineHourRate: 0,
      defaultModelVolumeCm3: 0,
    },
    {
      serviceType: "scan",
      baseFee: 1200,
      minPrice: 1500,
      hourRate: 1000,
      setupFee: 0,
      wastePercent: 0,
      supportPercent: 0,
      machineHourRate: 0,
      defaultModelVolumeCm3: 0,
    },
  ];

  for (const row of defaults) {
    await client.query(
      `INSERT INTO service_pricing_rules (
         service_type, base_fee, min_price, hour_rate, setup_fee, waste_percent, support_percent,
         machine_hour_rate, default_model_volume_cm3, created_at, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
       ON CONFLICT (service_type)
       DO UPDATE SET
         base_fee = EXCLUDED.base_fee,
         min_price = EXCLUDED.min_price,
         hour_rate = EXCLUDED.hour_rate,
         setup_fee = EXCLUDED.setup_fee,
         waste_percent = EXCLUDED.waste_percent,
         support_percent = EXCLUDED.support_percent,
         machine_hour_rate = EXCLUDED.machine_hour_rate,
         default_model_volume_cm3 = EXCLUDED.default_model_volume_cm3,
         updated_at = NOW()`,
      [
        row.serviceType,
        row.baseFee,
        row.minPrice,
        row.hourRate,
        row.setupFee,
        row.wastePercent,
        row.supportPercent,
        row.machineHourRate,
        row.defaultModelVolumeCm3,
      ]
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
    await seedPrintInventory(client);
    await seedServicePricingRules(client);
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
