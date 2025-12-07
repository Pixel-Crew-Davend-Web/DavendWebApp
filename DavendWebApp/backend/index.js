import express from "express";
import nodemailer from "nodemailer";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import cron from "node-cron";
import multer from "multer";
import paypal from "@paypal/checkout-server-sdk";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

console.log("🔥 Server starting…");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });
const requireEnv = (name, validate) => {
  const value = process.env[name];
  if (!value || (validate && !validate(value))) {
    console.error(`❌ Missing or invalid env: ${name}`);
    process.exit(1);
  }
  return value;
};

const STRIPE_SECRET_KEY = requireEnv("STRIPE_SECRET_KEY", (v) => v.startsWith("sk_"));
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const PAYPAL_ENV = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
const PAYPAL_CLIENT_ID = requireEnv("PAYPAL_CLIENT_ID");
const PAYPAL_CLIENT_SECRET = requireEnv("PAYPAL_CLIENT_SECRET");
const payPalEnv =
  PAYPAL_ENV === "live"
    ? new paypal.core.LiveEnvironment(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET)
    : new paypal.core.SandboxEnvironment(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET);
const payPalClient = new paypal.core.PayPalHttpClient(payPalEnv);

const feBaseUrl = () => {
  const url = process.env.FRONTEND_URL || "http://localhost:4200";
  if (!/^https?:\/\//.test(url)) throw new Error(`FRONTEND_URL is invalid (got "${url}")`);
  return url;
};
const toNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

app.use(
  cors({
    origin: ["http://localhost:4200", "https://davendwebapp.onrender.com"],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

//helpers
async function decrementInventory(item) {
  const pid = item.product_id;
  const qty = Number(item.qty) || 1;

  // 1) Check if this is a VARIANT
  const { data: variant, error: variantErr } = await supabase
    .from("ProductVariants")
    .select("id")
    .eq("id", pid)
    .maybeSingle();

  if (variant && !variantErr) {
    console.log(`→ Decrementing VARIANT ${pid} by ${qty}`);
    const { error } = await supabase.rpc("decrement_variant_qty", {
      vid: pid,
      amount: qty,
    });
    if (error) console.error("❌ Variant decrement failed:", error);
    return;
  }

  // 2) Otherwise, decrement PRODUCT
  console.log(`→ Decrementing PRODUCT ${pid} by ${qty}`);
  const { error: prodErr } = await supabase.rpc("decrement_product_qty", {
    pid,
    amount: qty,
  });
  if (prodErr) console.error("❌ Product decrement failed:", prodErr);
}

async function fetchAnyProductOrVariant(id) {
  // Try variant first
  const { data: variant } = await supabase
    .from("ProductVariants")
    .select(`
      id,
      price,
      size,
      length_value,
      product_id,
      Products ( name )
    `)
    .eq("id", id)
    .maybeSingle();

  if (variant) {
    // ALWAYS compute unit_amount from numeric price
    const priceCents = Math.round(Number(variant.price) * 100);

    if (!(priceCents > 0)) {
      throw new Error(`Invalid variant price for id ${id}`);
    }

    return {
      id: variant.id,
      name: `${variant.Products?.name} (${variant.size} - ${variant.length_value})`,
      unit_amount: priceCents,
      product_id: variant.product_id
    };
  }

  // fallback → normal product
  return await fetchProduct(id);
}

async function paypalGenerateAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !secret) {
    throw new Error("Missing PayPal credentials in env");
  }

  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");

  const res = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("❌ PayPal token error:", errText);
    throw new Error("Failed to generate PayPal access token");
  }

  const data = await res.json();
  return data.access_token;
}


async function fetchProduct(productIdRaw) {
  const productId = String(productIdRaw || "").trim();
  if (!productId) throw new Error("Product not found: <empty id>");

  const { data, error } = await supabase
    .from("Products")
    .select("id,name,price,price_cents,active")
    .eq("id", productId)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.active === false) throw new Error(`Product not found: ${productId}`);

  const unit_amount =
    typeof data.price_cents === "number" && Number.isFinite(data.price_cents)
      ? data.price_cents
      : Math.round(Number(data.price) * 100);

  if (!(unit_amount > 0)) throw new Error(`Invalid price for product ${productId}`);

  return { id: data.id, name: data.name ?? `Item ${productId}`, unit_amount };
}

async function upsertOrder(order) {
  const { data, error } = await supabase.from("Orders").upsert(order, { onConflict: "draft_id" }).select().single();
  if (error) throw error;
  return data;
}

/* ---------- Stripe webhook (raw body) ---------- */
app.post(
  "/api/webhooks/stripe",
  bodyParser.raw({ type: "application/json" }),
  async (req, res) => {
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("❌ Stripe signature fail:", err?.message || err);
      return res.status(400).send("bad signature");
    }

    if (event.type !== "checkout.session.completed") {
      // Ignore other events
      return res.sendStatus(200);
    }

    console.log("🔥 Stripe checkout.session.completed received");

    try {
      const s = event.data.object;

      /* -------------------- SAVE / UPSERT ORDER -------------------- */
      const orderDraftId =
        s?.metadata?.orderDraftId ?? s?.metadata?.draft_id ?? null;

      if (!orderDraftId) {
        console.error("❌ Missing draft_id in Stripe metadata");
        return res.status(500).send("missing draft_id");
      }

      const order = {
        draft_id: orderDraftId,
        status: "paid",
        method: "stripe",
        reference: s?.payment_intent ?? s?.id ?? null,
        message: s?.metadata?.message ?? "",
        amount:
          typeof s?.amount_total === "number" ? s.amount_total / 100 : null,
        currency: s?.currency?.toLowerCase() ?? "cad",
        full_name: s?.customer_details?.name ?? s?.metadata?.fullName ?? "",
        email: s?.customer_details?.email ?? s?.customer_email ?? "",
        phone: s?.metadata?.phone ?? "",
        address: s?.metadata?.address ?? "",
        city: s?.metadata?.city ?? "",
        postal_code: s?.metadata?.postalCode ?? "",
      };

      console.log("💾 Upserting Stripe order:", orderDraftId);
      await supabase.from("Orders").upsert(order, {
        onConflict: "draft_id",
      });

      /* -------------------- REBUILD CART FROM METADATA -------------------- */
      let rawItems = [];
      try {
        rawItems = JSON.parse(s?.metadata?.items || "[]");
      } catch (e) {
        console.error("❌ Failed to parse Stripe metadata.items:", e);
        rawItems = [];
      }

      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        console.warn(
          "⚠ No cart items in Stripe metadata for draft:",
          orderDraftId
        );
      } else {
        console.log(
          `🧾 Rebuilding ${rawItems.length} Stripe items from metadata for order ${orderDraftId}`
        );
      }

      // ✅ Normalize items & prices using variant-aware helper
      let normalizedItems = [];
      try {
        for (const it of rawItems) {
          // Just in case tax ever gets into metadata – skip it
          if (it.name === "HST (13%)") continue;

          const p = await fetchAnyProductOrVariant(it.id);

          normalizedItems.push({
            product_id: p.id,             // product OR variant ID
            name: p.name,                 // variant-aware display name
            qty: Number(it.qty ?? 1),
            price: p.unit_amount / 100,   // unit price in dollars
          });
        }
      } catch (e) {
        console.error("❌ Stripe normalization failed:", e);
        normalizedItems = [];
      }

      /* -------------------- UPSERT ORDER ITEMS -------------------- */
      try {
        // Idempotency: clear any existing items for this order first
        const { error: delErr } = await supabase
          .from("OrderItems")
          .delete()
          .eq("order_id", orderDraftId);

        if (delErr) {
          console.error(
            "❌ Failed to clear existing OrderItems for Stripe:",
            delErr
          );
        }

        for (const ni of normalizedItems) {
          const row = {
            order_id: orderDraftId,
            product_id: ni.product_id,
            name: ni.name,
            price: ni.price,
            qty: ni.qty,
          };

          console.log("→ Inserting Stripe OrderItem:", row);

          const { error: itemErr } = await supabase
            .from("OrderItems")
            .insert(row);

          if (itemErr) {
            console.error("❌ Stripe OrderItem insert error:", itemErr);
          }
        }
      } catch (e) {
        console.error("❌ Stripe OrderItems block failed:", e);
      }

      /* -------------------- UPDATE INVENTORY (PRODUCTS + VARIANTS) -------------------- */
      console.log("🔥 Updating inventory for Stripe...");

      const { data: orderItems, error: oiErr } = await supabase
        .from("OrderItems")
        .select("product_id, qty")
        .eq("order_id", orderDraftId);

      if (oiErr) {
        console.error(
          "❌ Could not fetch OrderItems for Stripe inventory:",
          oiErr
        );
      } else {
        for (const it of orderItems || []) {
          await decrementInventory(it);
        }
      }

      return res.sendStatus(200);
    } catch (err) {
      console.error("❌ Stripe webhook error:", err);
      return res.status(500).send("webhook error");
    }
  }
);
console.log("🔥 Stripe webhook mounted");

app.use(bodyParser.json());




// ---- Async wrapper & error middleware
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- Health ---------- */
app.get("/", (_req, res) =>
  res.send("Davend Email + Payments Backend Running ✔️")
);

console.log("🚦 Stripe + PayPal + Etransfer routes loading");
/* ---------- Stripe (card) ---------- */
app.post(
  "/api/payments/checkout-session",
  asyncHandler(async (req, res) => {
    try {
      const { items = [], customer = {}, orderDraftId = "" } = req.body;

      // ============================================================
      // 1) Build Stripe line items AND calculate subtotal
      // ============================================================
      let subtotalCents = 0;
      const normalizedItems = [];
      const line_items = [];

      for (const it of items) {
        const p = await fetchAnyProductOrVariant(it.id); // supports variants & products

        const qty = Number(it.qty ?? 1);
        const unitCents = p.unit_amount; // already cents

        subtotalCents += unitCents * qty;

        // For webhook reconstruction
        normalizedItems.push({
          id: it.id,
          qty,
          name: p.name,
          unitPrice: unitCents / 100,
        });

        // Stripe Checkout: one line per product
        line_items.push({
          quantity: qty,
          price_data: {
            currency: "cad",
            unit_amount: unitCents,
            product_data: {
              name: p.name,
              metadata: {
                product_id: p.id,
                variant_parent: p.product_id ?? null
              }
            }
          }
        });
      }

      // ============================================================
      // 2) Apply 13% tax as a separate line item
      // ============================================================
      const taxCents = Math.round(subtotalCents * 0.13);

      line_items.push({
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: taxCents,
          product_data: {
            name: "HST (13%)"
          }
        }
      });

      // ============================================================
      // 3) Create Stripe Checkout Session
      // ============================================================
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items,
        success_url: `${feBaseUrl()}/success/{CHECKOUT_SESSION_ID}`,
        cancel_url: `${feBaseUrl()}/checkout`,
        customer_email: customer.email,
        metadata: {
          orderDraftId,
          fullName: customer.fullName ?? "",
          phone: customer.phone ?? "",
          address: customer.address ?? "",
          city: customer.city ?? "",
          postalCode: customer.postalCode ?? "",
          message: customer.message ?? "",
         items: JSON.stringify(normalizedItems),
          subtotal: (subtotalCents / 100).toFixed(2),
          tax: (taxCents / 100).toFixed(2),
          total: ((subtotalCents + taxCents) / 100).toFixed(2),
        },
      });

      return res.json({ id: session.id });
    } catch (err) {
      console.error("❌ checkout-session failed:", err);
      return res.status(500).send("Internal server error");
    }
  })
);

/* ---------- E-Transfer (variant-aware + tax) ---------- */
app.post(
  "/api/payments/etransfer-order",
  asyncHandler(async (req, res) => {
    try {
      const { items = [], customer = {}, orderDraftId = "" } = req.body;

      if (!items.length) {
        return res.status(400).json({ error: "Cart is empty" });
      }

      if (!orderDraftId) {
        return res.status(400).json({ error: "Missing orderDraftId" });
      }

      // ---------------------------
      // 1) Calculate totals
      // ---------------------------
      let subtotalCents = 0;
      const normalizedItems = [];

      for (const it of items) {
        const p = await fetchAnyProductOrVariant(it.id); // 👈 FIXED

        const qty = Number(it.qty);
        const unitCents = p.unit_amount;

        subtotalCents += unitCents * qty;

        normalizedItems.push({
          product_id: p.id,           // variant OR product
          name: p.name,
          price: unitCents / 100,
          qty,
        });
      }

      const taxCents = Math.round(subtotalCents * 0.13);
      const totalCents = subtotalCents + taxCents;

      // ---------------------------
      // 2) Upsert order in DB
      // ---------------------------
      const orderRow = {
        draft_id: orderDraftId,
        status: "pending",
        method: "etransfer",
        reference: `ET-${Date.now()}`,
        amount: totalCents / 100,
        currency: "cad",
        message: customer.message || "",
        full_name: customer.fullName || "",
        email: customer.email || "",
        phone: customer.phone || "",
        address: customer.address || "",
        city: customer.city || "",
        postal_code: customer.postalCode || "",
      };

      await supabase.from("Orders").upsert(orderRow, { onConflict: "draft_id" });

      // ---------------------------
      // 3) Insert order items
      // ---------------------------
      await supabase.from("OrderItems").delete().eq("order_id", orderDraftId);

      for (const ni of normalizedItems) {
        await supabase.from("OrderItems").insert({
          order_id: orderDraftId,
          product_id: ni.product_id,
          name: ni.name,
          price: ni.price,
          qty: ni.qty,
        });
      }


      return res.json({ status: "success", order: orderRow });

    } catch (err) {
      console.error("❌ E-transfer error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  })
);

/* ---------- PayPal: capture (WITH TAX + VARIANTS, ROBUST) ---------- */
app.post(
  "/api/payments/paypal/capture-order",
  asyncHandler(async (req, res) => {
    try {
      const { orderID, orderDraftId, customer = {}, items = [] } = req.body;

      // 1) Capture the PayPal order
      const capReq = new paypal.orders.OrdersCaptureRequest(orderID);
      capReq.requestBody({});
      const capRes = await payPalClient.execute(capReq);

      const pu = capRes.result?.purchase_units?.[0];
      const cap = pu?.payments?.captures?.[0];

      // Try to use PayPal’s own captured amount first
      let capturedTotal = toNum(cap?.amount?.value);
      const capturedCurrency = String(
        cap?.amount?.currency_code || "CAD"
      ).toLowerCase();

      console.log("💰 PayPal raw capture amount =", capturedTotal);

      // 2) If PayPal returns 0/NaN, recompute subtotal + 13% tax server-side
      if ((!capturedTotal || Number.isNaN(capturedTotal)) && Array.isArray(items) && items.length > 0) {
        let subtotalCents = 0;

        for (const it of items) {
          const p = await fetchAnyProductOrVariant(it.id);
          const qty = Number(it.qty ?? 1);
          subtotalCents += p.unit_amount * qty; // unit_amount is cents
        }

        const taxCents = Math.round(subtotalCents * 0.13);
        const totalCents = subtotalCents + taxCents;
        capturedTotal = totalCents / 100;

        console.log("🧮 Recomputed PayPal total from items =", {
          subtotal: subtotalCents / 100,
          tax: taxCents / 100,
          total: capturedTotal,
        });
      }

      console.log("📦 Final PayPal total that will be stored in DB:", capturedTotal);

      // 3) Upsert order with this final total
      const order = await upsertOrder({
        draft_id: orderDraftId,
        status: "paid",
        method: "paypal",
        reference: capRes.result.id,
        amount: capturedTotal,
        currency: capturedCurrency,
        message: customer.message || "",
        full_name: customer.fullName || "",
        email: customer.email || "",
        phone: customer.phone || "",
        address: customer.address || "",
        city: customer.city || "",
        postal_code: customer.postalCode || "",
      });

      // 4) Build real items from request (variant-aware)
      const itemsToInsert = [];

      for (const it of items) {
        const p = await fetchAnyProductOrVariant(it.id);
        const qty = Number(it.qty ?? 1);

        itemsToInsert.push({
          order_id: orderDraftId,
          product_id: p.id,
          name: p.name,
          price: p.unit_amount / 100, // back to dollars
          qty,
        });
      }

      // 5) Replace order items
      await supabase.from("OrderItems").delete().eq("order_id", orderDraftId);
      for (const row of itemsToInsert) {
        await supabase.from("OrderItems").insert(row);
      }

      // 6) Update inventory using the variant-aware product_id
      for (const row of itemsToInsert) {
        await decrementInventory(row);
      }


      return res.json({ status: "success", order });
    } catch (err) {
      if (String(err?.message || "").startsWith("Product not found:")) {
        return res.status(404).send("Product not found");
      }
      console.error("❌ paypal capture failed:", err);
      return res.status(500).send("Internal server error");
    }
  })
);



/* ---------- PayPal: CREATE ORDER ---------- */
app.post(
  "/api/payments/paypal/create-order",
  asyncHandler(async (req, res) => {
    const { items = [], customer = {}, orderDraftId = "" } = req.body;

    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: "Cart is empty" });

    if (!orderDraftId)
      return res.status(400).json({ error: "Missing orderDraftId" });

    // 1) PRICE CALCULATION
    let subtotalCents = 0;
    const normalizedItems = [];

    for (const it of items) {
      const p = await fetchAnyProductOrVariant(it.id);
      const qty = Number(it.qty ?? 1);
      const unitCents = p.unit_amount;

      subtotalCents += unitCents * qty;

      normalizedItems.push({
        id: it.id,
        qty,
        name: p.name,
        unitPrice: unitCents / 100,
      });
    }

    const taxCents = Math.round(subtotalCents * 0.13);
    const totalCents = subtotalCents + taxCents;

    // 2) BUILD PAYPAL ORDER
    const purchaseUnit = {
      custom_id: orderDraftId,

      amount: {
        currency_code: "CAD",
        value: (totalCents / 100).toFixed(2),
        breakdown: {
          item_total: {
            currency_code: "CAD",
            value: (subtotalCents / 100).toFixed(2),
          },
          tax_total: {
            currency_code: "CAD",
            value: (taxCents / 100).toFixed(2),
          },
        },
      },

      items: normalizedItems.map((i) => ({
        name: i.name,
        quantity: String(i.qty),
        unit_amount: {
          currency_code: "CAD",
          value: i.unitPrice.toFixed(2),
        },
      })),
    };


    const order = {
      intent: "CAPTURE",
      purchase_units: [purchaseUnit],
      application_context: {
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
        return_url: `${feBaseUrl()}/success`,
        cancel_url: `${feBaseUrl()}/checkout`,
      },
    };

    // 3) SEND ORDER TO PAYPAL
    const ppRes = await fetch(
      "https://api-m.sandbox.paypal.com/v2/checkout/orders",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await paypalGenerateAccessToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(order),
      }
    );

    const data = await ppRes.json();
    if (!data.id) {
      console.error("❌ PayPal create-order error:", data);
      return res.status(500).json({ error: "PayPal order creation failed" });
    }

    return res.json({ id: data.id });
  })
);


/* ---------- Success helpers ---------- */
app.get(
  "/api/payments/session/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id;

    if (id.startsWith("cs_")) {
      try {
        const session = await stripe.checkout.sessions.retrieve(id);
        const order = {
          id: session.metadata?.orderDraftId || session.id,
          date: new Date(session.created * 1000).toISOString(),
          method: session.payment_method_types?.[0] || "card",
          amount:
            typeof session.amount_total === "number"
              ? session.amount_total / 100
              : 0,
          reference: session.payment_intent || session.id || null,
          message: session.metadata?.message || "",
          customer: {
            fullName:
              session.customer_details?.name ||
              session.metadata?.fullName ||
              "",
            email: session.customer_details?.email || "",
            phone: session.metadata?.phone || "",
            address: session.metadata?.address || "",
            city: session.metadata?.city || "",
            postalCode: session.metadata?.postalCode || "",
          },
        };
        return res.json({ session, order });
      } catch {
        // fall through to DB lookup
      }
    }

    const { data: o } = await supabase
      .from("Orders")
      .select(
        "draft_id, created_at, method, amount, reference, message, full_name, email, phone, address, city, postal_code"
      )
      .eq("draft_id", id)
      .single();

    if (!o) {
      return res.status(404).json({ error: "Session or order not found" });
    }

    const order = {
      id: o.draft_id,
      date: new Date(o.created_at).toISOString(),
      method: o.method || "paypal",
      amount: Number(o.amount || 0),
      reference: o.reference || null,
      message: o.message || "",
      customer: {
        fullName: o.full_name || "",
        email: o.email || "",
        phone: o.phone || "",
        address: o.address || "",
        city: o.city || "",
        postalCode: o.postal_code || "",
      },
    };

    return res.json({ order });
  })
);

app.get(
  "/api/orders/:draftId",
  asyncHandler(async (req, res) => {
    const draftId = req.params.draftId;

    const { data: order } = await supabase
      .from("Orders")
      .select(
        "draft_id, status, method, reference, message, amount, currency, full_name, email, phone, address, city, postal_code, created_at"
      )
      .eq("draft_id", draftId)
      .single();

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const { data: items, error: itemsErr } = await supabase
      .from("OrderItems")
      .select("product_id, name, price, qty, subtotal")
      .eq("order_id", draftId)
      .order("name", { ascending: true });

    if (itemsErr) {
      return res.status(500).json({ error: "Failed to fetch items" });
    }

    const subtotal = (items || []).reduce(
      (acc, it) => acc + toNum(it.price) * toNum(it.qty),
      0
    );

    res.json({
      order,
      items: items || [],
      totals: {
        subtotal: Number(subtotal),
        total: Number(order.amount),
        currency: (order.currency || "cad").toUpperCase(),
      },
    });
  })
);

app.get(
  "/api/payments/success/:draftId",
  asyncHandler(async (req, res) => {
    const draftId = req.params.draftId;

    const { data: o } = await supabase
      .from("Orders")
      .select(
        "draft_id, created_at, method, amount, reference, message, full_name, email, phone, address, city, postal_code"
      )
      .eq("draft_id", draftId)
      .single();

    if (!o) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = {
      id: o.draft_id,
      date: new Date(o.created_at).toISOString(),
      method: o.method || "paypal",
      amount: Number(o.amount || 0),
      reference: o.reference || null,
      message: o.message || "",
      customer: {
        fullName: o.full_name || "",
        email: o.email || "",
        phone: o.phone || "",
        address: o.address || "",
        city: o.city || "",
        postalCode: o.postal_code || "",
      },
    };

    res.json({ order });
  })
);

/* ---------- Email endpoints ---------- */
app.post(
  "/service-send-email",
  upload.single("designFile"),
  asyncHandler(async (req, res) => {
    const { fullName, email, phoneNumber, message, selectedService } = req.body;
    const file = req.file;
    if (!fullName || !email || !phoneNumber || !message || !selectedService || !file)
      return res.status(400).json({ message: "Missing required fields or file" });

    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass },
      tls: { rejectUnauthorized: false },
    });

    const mailOptions = {
      from: `"${fullName}" <${email}>`,
      to: "example@gmail.com",
      subject: `${selectedService} - Service Request`,
      text: `Service Requested: ${selectedService}
Full Name: ${fullName}
Email: ${email}
Phone Number: ${phoneNumber}

Message:
${message}`,
      attachments: [{ filename: file.originalname, content: file.buffer }],
    };

    const info = await transporter.sendMail(mailOptions);
    res.status(200).json({ message: "Email sent successfully!", preview: nodemailer.getTestMessageUrl(info) });
  })
);

app.post(
  "/contact-send-email",
  upload.single("attachment"),
  asyncHandler(async (req, res) => {
    const { fullName, email, subject, message } = req.body;
    const file = req.file ?? null;
    if (!fullName || !email || !subject || !message) return res.status(400).json({ message: "Missing required fields" });

    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass },
      tls: { rejectUnauthorized: false },
    });

    const mailOptions = {
      from: `"${fullName}" <${email}>`,
      to: "example@gmail.com",
      subject: `[Contact] ${subject}`,
      text: `From: ${fullName}
Email: ${email}

Message:
${message}`,
      ...(file ? { attachments: [{ filename: file.originalname, content: file.buffer }] } : {}),
    };

    const info = await transporter.sendMail(mailOptions);
    res.status(200).json({ message: "Contact email sent!", preview: nodemailer.getTestMessageUrl(info) });
  })
);

/* ---------- Admin Authentication ---------- */
app.post("/api/admin/signup", asyncHandler(async (req, res) => {
  const { nickName, email, password } = req.body;

  if (!nickName || !email || !password)
    return res.status(400).json({ success: false, message: "Missing fields" });

  // Hash password
  const hashed = await bcrypt.hash(password, 10);

  // Insert new admin user
  const { data, error } = await supabase
    .from("AdminUsers")
    .insert({
      nickName,
      email: email.toLowerCase(),
      password: hashed
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    return res.json({ success: false, message: "Error creating user" });
  }

  return res.json({ success: true, adminID: data.id });
}));


app.post("/api/admin/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const { data: admin, error } = await supabase
    .from("AdminUsers")
    .select("*")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (!admin || error) {
    return res.json({ success: false, message: "Invalid email or password" });
  }

  // Compare password
  const match = await bcrypt.compare(password, admin.password);
  if (!match) {
    return res.json({ success: false, message: "Invalid email or password" });
  }

  // Create a new login token
  const token = crypto.randomUUID();
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

  // Insert or update AdminLoginToken table
  const { error: tokenErr } = await supabase
    .from("AdminLoginToken")
    .upsert({
      AdminID: admin.id,
      ADMIN_TOKEN_KEY: token,
      ADMIN_TOKEN_EXPIRY: expiry
    });

  if (tokenErr) {
    console.error(tokenErr);
    return res.json({ success: false, message: "Failed to set login token" });
  }

  return res.json({
    success: true,
    adminID: admin.id,
    adminToken: token,
    adminTokenExpiry: expiry
  });
}));


cron.schedule("0 * * * *", async () => { 
  // Runs every hour at minute 0
  console.log("⏰ Running E-transfer expiry check...");

  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("Orders")
      .update({ status: "cancelled" })
      .eq("method", "etransfer")
      .eq("status", "pending")
      .lt("created_at", cutoff)
      .select();

    if (error) {
      console.error("❌ Failed to expire e-transfer orders:", error);
    } else if (data?.length) {
      console.log(`🚫 Auto-cancelled ${data.length} expired E-transfer orders`);
    } else {
      console.log("✔ No expired e-transfer orders found");
    }
  } catch (err) {
    console.error("❌ Cron job failed:", err);
  }
});



/* ---------- Errors ---------- */
app.use((err, _req, res, _next) => {
  console.error("❌ Unhandled error:", err?.raw?.message || err?.message || err);
  res.status(500).json({ error: err?.raw?.message || err?.message || "Internal server error" });
});

console.log("🚀 Booting server now...");

/* ---------- Start ---------- */
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
