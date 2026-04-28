const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { normalizeServiceType, getAllowedStatuses } = require("../domain/order-statuses");

const router = express.Router();

const uploadDir = path.resolve(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const allowedExts = new Set(["stl", "obj", "amf", "3mf", "fbx"]);

function modelExtFromFilename(name) {
  const lower = String(name || "").toLowerCase();
  const ordered = ["3mf", "amf", "stl", "obj", "fbx"];
  for (const ext of ordered) {
    if (lower.endsWith(`.${ext}`)) return ext;
  }
  return "";
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const extFromName = modelExtFromFilename(file.originalname);
    const ext = extFromName ? `.${extFromName}` : path.extname(file.originalname || "").toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = modelExtFromFilename(file.originalname);
    if (!ext || !allowedExts.has(ext)) {
      cb(new Error("Поддерживаются только STL, OBJ, AMF, 3MF, FBX."));
      return;
    }
    cb(null, true);
  },
});

function normalizeOrderNumber(index) {
  return `A-${String(index).padStart(3, "0")}`;
}

async function generateOrderNumber() {
  const result = await db.query("SELECT COUNT(*) AS count FROM orders");
  const next = Number(result.rows[0]?.count || 0) + 1;
  return normalizeOrderNumber(next);
}

async function loadPriceMap() {
  const result = await db.query(
    `SELECT type, code, price_delta
     FROM service_options
     WHERE active = 1`
  );
  const map = new Map();
  result.rows.forEach((row) => {
    map.set(`${row.type}:${row.code}`, Number(row.price_delta || 0));
  });
  return map;
}

async function loadPricingRule(serviceType) {
  const result = await db.query(
    `SELECT service_type, base_fee, min_price, hour_rate, setup_fee, waste_percent, support_percent,
            machine_hour_rate, default_model_volume_cm3
     FROM service_pricing_rules
     WHERE service_type = $1
     LIMIT 1`,
    [serviceType]
  );
  const row = result.rows[0];
  return {
    serviceType,
    baseFee: Number(row?.base_fee || 0),
    minPrice: Number(row?.min_price || 500),
    hourRate: Number(row?.hour_rate || 0),
    setupFee: Number(row?.setup_fee || 0),
    wastePercent: Number(row?.waste_percent || 0),
    supportPercent: Number(row?.support_percent || 0),
    machineHourRate: Number(row?.machine_hour_rate || 0),
    defaultModelVolumeCm3: Number(row?.default_model_volume_cm3 || 20),
  };
}

async function loadPrintInventoryRows() {
  const result = await db.query(
    `SELECT id, item_type, code, name, technology_code, material_code, color_code, thickness_mm,
            unit, stock_qty, reserved_qty, consumed_qty, price_per_cm3, low_stock_threshold, stop_stock_threshold,
            active, sort_order, meta_json
     FROM print_inventory
     WHERE active = 1
     ORDER BY item_type ASC, sort_order ASC, name ASC`
  );
  return result.rows.map((row) => {
    let meta = null;
    try {
      meta = row.meta_json ? JSON.parse(row.meta_json) : null;
    } catch {
      meta = null;
    }
    return {
      id: row.id,
      itemType: row.item_type,
      code: row.code,
      name: row.name,
      technologyCode: String(row.technology_code || ""),
      materialCode: String(row.material_code || ""),
      colorCode: String(row.color_code || ""),
      thicknessMm: row.thickness_mm != null ? Number(row.thickness_mm) : null,
      unit: row.unit || "g",
      stockQty: Number(row.stock_qty || 0),
      reservedQty: Number(row.reserved_qty || 0),
      consumedQty: Number(row.consumed_qty || 0),
      pricePerCm3: Number(row.price_per_cm3 || 0),
      lowStockThreshold: Number(row.low_stock_threshold || 0),
      stopStockThreshold: Number(row.stop_stock_threshold || 0),
      sortOrder: Number(row.sort_order || 0),
      meta,
    };
  });
}

function findInventoryVariant(inventoryRows, { technology, material, color, thickness }) {
  const normalizedThickness = thickness != null && thickness !== "" ? Number(thickness) : null;
  const normalizedMaterial = String(material || "");
  const candidates = inventoryRows.filter(
    (row) =>
      row.itemType === "material_variant" &&
      row.technologyCode === String(technology || "") &&
      row.colorCode === String(color || "") &&
      Number(row.thicknessMm || 0) === Number(normalizedThickness || 0)
  );
  if (!candidates.length) return null;
  return (
    (normalizedMaterial ? candidates.find((row) => row.materialCode === normalizedMaterial) : null) ||
    candidates[0]
  );
}

function buildReserveEstimate({ variant, volumeCm3, qty, rule }) {
  const quantity = Math.max(1, Number(qty || 1));
  const density = Math.max(0.1, Number(variant?.meta?.densityGcm3 || 1));
  const wasteK = 1 + Math.max(0, Number(rule?.wastePercent || 0)) / 100;
  const supportK = 1 + Math.max(0, Number(rule?.supportPercent || 0)) / 100;
  const cm3Total = Math.max(0, Number(volumeCm3 || 0)) * quantity * wasteK * supportK;
  if ((variant?.unit || "").toLowerCase() === "ml") {
    return Math.ceil(cm3Total);
  }
  return Math.ceil(cm3Total * density);
}

async function calculateOrderPrice({ serviceType, material, technology, color, thickness, qty, modelVolumeCm3, complexity, estimatedHours }) {
  const quantity = Math.max(1, Number(qty || 1));
  const rule = await loadPricingRule(serviceType);
  if (serviceType === "print") {
    const inventoryRows = await loadPrintInventoryRows();
    const variant = findInventoryVariant(inventoryRows, { technology, material, color, thickness });
    if (!variant) {
      return Math.max(rule.minPrice, 700);
    }
    const availableQty = Math.max(0, Number(variant.stockQty || 0) - Number(variant.reservedQty || 0));
    if (availableQty <= 0) {
      return Math.max(rule.minPrice, 700);
    }
    const rawVolume = Number(modelVolumeCm3 || 0);
    const volumeCm3 = rawVolume > 0 ? rawVolume : Math.max(1, Number(rule.defaultModelVolumeCm3 || 20));
    const speedCm3h = Math.max(6, Number(variant.meta?.defaultSpeedCm3h || 20));
    const machineHours = volumeCm3 / speedCm3h;
    const materialCost = volumeCm3 * Math.max(0, Number(variant.pricePerCm3 || 0));
    const machineCost = machineHours * Math.max(0, Number(rule.machineHourRate || 0));
    const base = Math.max(0, Number(rule.baseFee || 0)) + Math.max(0, Number(rule.setupFee || 0));
    const subtotal = (materialCost + machineCost + base) * quantity;
    const wasteK = 1 + Math.max(0, Number(rule.wastePercent || 0)) / 100;
    const supportK = 1 + Math.max(0, Number(rule.supportPercent || 0)) / 100;
    return Math.max(rule.minPrice, Math.round(subtotal * wasteK * supportK));
  }

  const hours = Math.max(0.5, Number(estimatedHours || 1));
  const complexityK = Math.max(1, Number(complexity || 1));
  const priceMap = await loadPriceMap();
  const extras =
    (priceMap.get(`material:${material}`) || 0) +
    (priceMap.get(`technology:${technology}`) || 0) +
    (priceMap.get(`color:${color}`) || 0);
  const subtotal = Number(rule.baseFee || 0) + Number(rule.hourRate || 0) * hours * complexityK + extras;
  const total = subtotal * quantity;
  return Math.max(rule.minPrice || 500, Math.round(total));
}

router.get("/options", async (_req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, type, code, name, price_delta, active, sort_order, meta_json
       FROM service_options
       ORDER BY type ASC, sort_order ASC, name ASC`
    );
    const grouped = { material: [], technology: [], color: [], thickness: [] };
    result.rows.forEach((row) => {
      const item = {
        id: row.id,
        code: row.code,
        name: row.name,
        priceDelta: Number(row.price_delta || 0),
        active: Boolean(row.active),
        meta: row.meta_json ? JSON.parse(row.meta_json) : null,
      };
      if (!grouped[row.type]) grouped[row.type] = [];
      grouped[row.type].push(item);
    });
    const inventoryRows = await loadPrintInventoryRows();
    const activeTechnologies = new Set((grouped.technology || []).filter((item) => item.active).map((item) => item.code));
    const activeMaterials = new Set((grouped.material || []).filter((item) => item.active).map((item) => item.code));
    const activeColors = new Set((grouped.color || []).filter((item) => item.active).map((item) => item.code));
    const sellableVariants = inventoryRows.filter((row) => {
      if (row.itemType !== "material_variant") return false;
      if (activeTechnologies.size && !activeTechnologies.has(row.technologyCode)) return false;
      if (activeMaterials.size && !activeMaterials.has(row.materialCode)) return false;
      if (activeColors.size && !activeColors.has(row.colorCode)) return false;
      const availableQty = Math.max(0, Number(row.stockQty || 0) - Number(row.reservedQty || 0));
      const stockQty = Math.max(0, Number(row.stockQty || 0));
      const stockPercent = stockQty > 0 ? (availableQty / stockQty) * 100 : 0;
      return stockPercent >= 20;
    });

    const technologyCodes = new Set(sellableVariants.map((row) => row.technologyCode));
    const technologies = inventoryRows
      .filter((row) => row.itemType === "technology")
      .filter((row) => technologyCodes.has(row.technologyCode || row.code))
      .map((row) => ({
        id: row.id,
        code: row.technologyCode || row.code,
        name: row.name,
        active: true,
      }));
    const variants = sellableVariants
      .map((row) => ({
        id: row.id,
        code: row.code,
        technologyCode: row.technologyCode,
        materialCode: row.materialCode,
        materialName: String(row.meta?.materialName || row.materialCode || ""),
        colorCode: row.colorCode,
        colorName: String(row.meta?.colorName || row.colorCode || ""),
        thicknessMm: Number(row.thicknessMm || 0),
        unit: row.unit || "g",
        stockQty: Number(row.stockQty || 0),
        reservedQty: Number(row.reservedQty || 0),
        availableQty: Math.max(0, Number(row.stockQty || 0) - Number(row.reservedQty || 0)),
        pricePerCm3: Number(row.pricePerCm3 || 0),
        lowStockThreshold: Number(row.lowStockThreshold || 0),
        stopStockThreshold: Number(row.stopStockThreshold || 0),
        name: row.name,
      }));

    res.json({ ok: true, options: grouped, printInventory: { technologies, variants } });
  } catch (error) {
    next(error);
  }
});

router.post("/price-preview", async (req, res, next) => {
  try {
    const amount = await calculateOrderPrice(req.body || {});
    res.json({ ok: true, totalAmount: amount });
  } catch (error) {
    next(error);
  }
});

router.post("/upload", requireAuth, upload.single("modelFile"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Файл не загружен." });
    }
    const ext = modelExtFromFilename(req.file.originalname) || path.extname(req.file.originalname || "").slice(1).toLowerCase();
    const fileInfo = {
      name: req.file.originalname,
      path: `/uploads/${path.basename(req.file.path)}`,
      size: req.file.size,
      ext,
    };
    res.status(201).json({ ok: true, file: fileInfo });
  } catch (error) {
    next(error);
  }
});

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
    const result = await db.query(
      `SELECT o.*,
              u.phone,
              u.full_name,
              u.email,
              a.address_line,
              a.city,
              p.card_mask
       FROM orders o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN user_addresses a ON a.id = o.address_id
       LEFT JOIN payment_methods p ON p.id = o.payment_method_id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC
       LIMIT $2`,
      [req.auth.userId, limit]
    );

    const orders = result.rows.map((order) => {
      let details = {};
      try {
        details = order.details_json ? JSON.parse(order.details_json) : {};
      } catch {
        details = {};
      }
      return {
        id: order.id,
        orderNumber: order.order_number || "",
        status: order.status,
        allowedStatuses: getAllowedStatuses(order.service_type),
        createdAt: order.created_at,
        totalAmount: Number(order.total_amount || 0),
        serviceType: order.service_type || "",
        serviceName: order.service_name || "Услуга",
        fileName: order.file_name || "",
        filePath: order.file_path || "",
        modelingTask: order.modeling_task || "",
        details,
        paymentCardMask: order.card_mask || "",
        deliveryAddress: [order.city, order.address_line].filter(Boolean).join(", "),
        user: {
          id: order.user_id,
          phone: order.phone,
          fullName: order.full_name || "",
          email: order.email || "",
        },
      };
    });

    res.json({ ok: true, orders });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const {
      serviceType,
      serviceName,
      qty,
      material,
      technology,
      color,
      thickness,
      modelingTask,
      uploadedFile,
      addressId,
      paymentMethodId,
      totalAmount,
      modelVolumeCm3,
      complexity,
      estimatedHours,
    } = req.body || {};

    const normalizedServiceType = normalizeServiceType(serviceType);
    if (!normalizedServiceType) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Укажите тип услуги." });
    }
    if (getAllowedStatuses(normalizedServiceType).length === 0) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Неизвестный тип услуги." });
    }

    let finalAmount = Number(totalAmount);
    let inventoryReservation = null;
    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      finalAmount = await calculateOrderPrice({
        serviceType: normalizedServiceType,
        material,
        technology,
        color,
        thickness,
        qty,
        modelVolumeCm3,
        complexity,
        estimatedHours,
      });
    }
    if (normalizedServiceType === "print") {
      const inventoryRows = await loadPrintInventoryRows();
      const variant = findInventoryVariant(inventoryRows, { technology, material, color, thickness });
      if (!variant) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "Выбранная комбинация материала недоступна на складе.",
        });
      }
      const rule = await loadPricingRule("print");
      const estimatedReserveQty = buildReserveEstimate({
        variant,
        volumeCm3: Number(modelVolumeCm3 || 0) || Number(rule.defaultModelVolumeCm3 || 20),
        qty,
        rule,
      });
      const availableQty = Math.max(0, Number(variant.stockQty || 0) - Number(variant.reservedQty || 0));
      if (estimatedReserveQty > availableQty) {
        return res.status(400).json({
          error: "OUT_OF_STOCK",
          message: `Недостаточно материала на складе. Доступно: ${availableQty} ${variant.unit}.`,
        });
      }
      await db.query(
        `UPDATE print_inventory
         SET reserved_qty = reserved_qty + $1,
             updated_at = datetime('now')
         WHERE id = $2`,
        [estimatedReserveQty, variant.id]
      );
      inventoryReservation = {
        inventoryId: variant.id,
        variantCode: variant.code,
        reservedQty: estimatedReserveQty,
        unit: variant.unit,
        state: "reserved",
      };
    }

    let savedAddressId = null;
    if (addressId) {
      const addressRes = await db.query("SELECT id FROM user_addresses WHERE id = $1 AND user_id = $2 LIMIT 1", [
        addressId,
        req.auth.userId,
      ]);
      if (addressRes.rows[0]) savedAddressId = addressRes.rows[0].id;
    } else {
      const addressRes = await db.query(
        "SELECT id FROM user_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC LIMIT 1",
        [req.auth.userId]
      );
      savedAddressId = addressRes.rows[0]?.id || null;
    }

    let savedPaymentMethodId = null;
    if (paymentMethodId) {
      const paymentRes = await db.query(
        "SELECT id FROM payment_methods WHERE id = $1 AND user_id = $2 LIMIT 1",
        [paymentMethodId, req.auth.userId]
      );
      if (paymentRes.rows[0]) savedPaymentMethodId = paymentRes.rows[0].id;
    } else {
      const paymentRes = await db.query(
        "SELECT id FROM payment_methods WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC LIMIT 1",
        [req.auth.userId]
      );
      savedPaymentMethodId = paymentRes.rows[0]?.id || null;
    }

    const orderId = crypto.randomUUID();
    const orderNumber = await generateOrderNumber();
    const detailsJson = JSON.stringify({
      qty: Number(qty || 1),
      material: String(material || ""),
      technology: String(technology || ""),
      color: String(color || ""),
      thickness: String(thickness || ""),
      modelVolumeCm3: Number(modelVolumeCm3 || 0),
      complexity: Number(complexity || 1),
      estimatedHours: Number(estimatedHours || 0),
      inventoryReservation,
    });
    await db.query(
      `INSERT INTO orders (
          id, user_id, order_number, service_type, service_name, status, total_amount, currency,
          details_json, modeling_task, address_id, payment_method_id, file_name, file_path, file_size, file_ext,
          created_at, updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, 'Оплачен', $6, 'RUB',
         $7, $8, $9, $10, $11, $12, $13, $14,
         datetime('now'), datetime('now')
       )`,
      [
        orderId,
        req.auth.userId,
        orderNumber,
        normalizedServiceType,
        String(serviceName || "Услуга").trim(),
        finalAmount,
        detailsJson,
        String(modelingTask || "").trim() || null,
        savedAddressId,
        savedPaymentMethodId,
        uploadedFile?.name || null,
        uploadedFile?.path || null,
        uploadedFile?.size || null,
        uploadedFile?.ext || null,
      ]
    );

    res.status(201).json({ ok: true, orderId, orderNumber });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
