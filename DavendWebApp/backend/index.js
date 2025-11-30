import express from "express";
import nodemailer from "nodemailer";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import multer from "multer";
import paypal from "@paypal/checkout-server-sdk";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

app.use(
  cors({
    origin: ["http://localhost:4200", "https://davendwebapp.onrender.com"],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

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

//  Product helpers 
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

async function buildStripeLineItems(items) {
  const rows = await Promise.all(
    (items || []).map(async (it) => {
      const p = await fetchProduct(it.id);
      return {
        quantity: Number(it.qty) || 1,
        price_data: {
          currency: "cad",
          unit_amount: p.unit_amount,
          product_data: { name: p.name },
        },
      };
    })
  );
  return rows;
}

async function computeEtransfer(items) {
  let totalCents = 0;
  const normalized = [];
  for (const it of items || []) {
    const p = await fetchProduct(it.id);
    const qty = Number(it.qty) || 1;
    totalCents += p.unit_amount * qty;
    normalized.push({
      product_id: p.id,
      name: it.name || p.name,
      price: p.unit_amount / 100,
      qty,
    });
  }
  return { totalCents, normalizedItems: normalized };
}

async function insertOrder(order) {
  const { data, error } = await supabase.from("Orders").insert(order).select().single();
  if (error) throw error;
  return data;
}

async function upsertOrder(order) {
  const { data, error } = await supabase.from("Orders").upsert(order, { onConflict: "draft_id" }).select().single();
  if (error) throw error;
  return data;
}

async function insertItem(item) {
  const { error } = await supabase.from("OrderItems").insert(item);
  if (error) throw error;
}

// ---- Async wrapper & error middleware
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.use((req, res, next) => next());

/* ---------- Stripe webhook (raw body) ---------- */
app.post("/api/webhooks/stripe", bodyParser.raw({ type: "application/json" }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("signature fail:", err?.message || err);
    return res.status(400).send("bad signature");
  }

  if (event.type !== "checkout.session.completed") {
    return res.sendStatus(200);
  }

  try {
    const s = event.data.object;
    const order = {
      draft_id: s?.metadata?.orderDraftId ?? s?.metadata?.draft_id ?? null,

      status: "paid",
      method: "stripe",

      // Match field names used by PayPal + E-transfer
      reference: s?.payment_intent ?? s?.id ?? null,
      message: s?.metadata?.message ?? "",

      amount: typeof s?.amount_total === "number" ? s.amount_total / 100 : null,
      currency: s?.currency?.toLowerCase() ?? "cad",

      full_name: s?.customer_details?.name ?? s?.metadata?.fullName ?? "",
      email: s?.customer_details?.email ?? s?.customer_email ?? "",
      phone: s?.metadata?.phone ?? "",

      address: s?.metadata?.address ?? "",
      city: s?.metadata?.city ?? "",
      postal_code: s?.metadata?.postalCode ?? "",
    };


    if (!order.draft_id) return res.status(500).send("missing draft_id");

    const { error } = await supabase.from("Orders").upsert(order, { onConflict: "draft_id" });
    if (error) {
      console.error("Orders upsert failed:", error.message || error);
      return res.status(500).send("db fail");
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("webhook error:", err);
    return res.status(500).send("webhook error");
  }
});


app.use(bodyParser.json());

/* ---------- Health ---------- */
app.get("/", (_req, res) => res.send("Davend Email + Payments Backend Running ✔️"));

/* ---------- Stripe (card) ---------- */
app.post(
  "/api/payments/checkout-session",
  asyncHandler(async (req, res) => {
    try {
      const { items = [], customer = {}, orderDraftId = "" } = req.body;
      const line_items = await buildStripeLineItems(items);

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
        },
      });

      return res.json({ id: session.id });
    } catch (err) {
      if (String(err?.message || "").startsWith("Product not found:")) {
        return res.status(404).send("Product not found");
      }
      console.error("❌ checkout-session failed:", err);
      return res.status(500).send("Internal server error");
    }
  })
);

/* ---------- E-Transfer (pending) ---------- */
app.post(
  "/api/payments/etransfer-order",
  asyncHandler(async (req, res) => {
    try {
      const { items = [], customer = {}, orderDraftId = "", reference: refIn } = req.body;
      const reference = (refIn && String(refIn).trim()) || `ET-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const { totalCents, normalizedItems } = await computeEtransfer(items);

      const order = await insertOrder({
        draft_id: orderDraftId,
        status: "pending",
        method: "etransfer",
        reference,
        message: customer.message || "",
        amount: Math.round(totalCents) / 100,
        currency: "cad",
        full_name: customer.fullName || "",
        email: customer.email || "",
        phone: customer.phone || "",
        address: customer.address || "",
        city: customer.city || "",
        postal_code: customer.postalCode || "",
      });

      for (const ni of normalizedItems) {
        await insertItem({
          order_id: order.draft_id,
          product_id: ni.product_id,
          name: ni.name,
          price: ni.price,
          qty: ni.qty,
        });
      }

      return res.json({ message: "Order created with status pending", order });
    } catch (err) {
      if (String(err?.message || "").startsWith("Product not found:")) {
        return res.status(404).send("Product not found");
      }
      console.error("❌ etransfer failed:", err);
      return res.status(500).send("Internal server error");
    }
  })
);

/* ---------- PayPal: create ---------- */
app.post(
  "/api/payments/paypal/create-order",
  asyncHandler(async (req, res) => {
    try {
      const { items = [], orderDraftId = "" } = req.body;

      const ppItems = [];
      let total = 0;
      for (const it of items) {
        const p = await fetchProduct(it.id);
        const qty = Number(it.qty) || 1;
        const unit = p.unit_amount / 100;
        total += unit * qty;
        ppItems.push({
          name: p.name,
          sku: p.id,
          quantity: String(qty),
          unit_amount: { currency_code: "CAD", value: unit.toFixed(2) },
        });
      }

      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer("return=representation");
      request.requestBody({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: orderDraftId,
            amount: {
              currency_code: "CAD",
              value: total.toFixed(2),
              breakdown: { item_total: { currency_code: "CAD", value: total.toFixed(2) } },
            },
            items: ppItems,
          },
        ],
      });

      const order = await payPalClient.execute(request);
      return res.json({ id: order.result.id });
    } catch (err) {
      if (String(err?.message || "").startsWith("Product not found:")) {
        return res.status(404).send("Product not found");
      }
      console.error("❌ paypal create failed:", err);
      return res.status(500).send("Internal server error");
    }
  })
);

/* ---------- PayPal: capture ---------- */
app.post(
  "/api/payments/paypal/capture-order",
  asyncHandler(async (req, res) => {
    try {
      const { orderID, orderDraftId, customer = {}, items = [] } = req.body;

      // Capture
      const capReq = new paypal.orders.OrdersCaptureRequest(orderID);
      capReq.requestBody({});
      const capRes = await payPalClient.execute(capReq);

      const pu = capRes.result?.purchase_units?.[0];
      const cap = pu?.payments?.captures?.[0];
      const capturedAmount = toNum(cap?.amount?.value);
      const capturedCurrency = String(cap?.amount?.currency_code || "CAD").toLowerCase();

      // Upsert order
      const order = await upsertOrder({
        draft_id: orderDraftId,
        status: "paid",
        method: "paypal",
        reference: capRes.result.id,
        message: customer.message || "",
        amount: capturedAmount,
        currency: capturedCurrency,
        full_name: customer.fullName || "",
        email: customer.email || "",
        phone: customer.phone || "",
        address: customer.address || "",
        city: customer.city || "",
        postal_code: customer.postalCode || "",
      });

      // Build items from PayPal 
      let itemsToInsert = [];
      try {
        const getReq = new paypal.orders.OrdersGetRequest(orderID);
        const getRes = await payPalClient.execute(getReq);
        const ppItems = getRes.result?.purchase_units?.[0]?.items || [];
        itemsToInsert =
          ppItems.length > 0
            ? ppItems.map((i) => ({
              productIdFromSku: i.sku || null,
              name: i.name,
              qty: Number(i.quantity || 1),
              unitAmountFromGateway: toNum(i.unit_amount?.value),
            }))
            : [];
      } catch {
        itemsToInsert = [];
      }
      if (itemsToInsert.length === 0 && Array.isArray(items) && items.length > 0) {
        itemsToInsert = items.map((it) => ({
          productIdFromSku: it.id || null,
          name: it.name,
          qty: Number(it.qty || 1),
          unitAmountFromGateway: null,
        }));
      }

      // Skip if items already there
      const { data: existing } = await supabase.from("OrderItems").select("id").eq("order_id", orderDraftId).limit(1);
      const hasItems = Array.isArray(existing) && existing.length > 0;

      if (!hasItems && itemsToInsert.length > 0) {
        for (const it of itemsToInsert) {
          const qty = Number(it.qty) || 1;
          let productId = it.productIdFromSku;
          let name;
          let price;

          if (productId) {
            const p = await fetchProduct(productId);
            productId = p.id;
            name = it.name || p.name;
            price = p.unit_amount / 100;
          } else {
            name = it.name || "Unnamed item";
            price = typeof it.unitAmountFromGateway === "number" ? it.unitAmountFromGateway : 0;
            productId = "adhoc";
          }

          await insertItem({
            order_id: orderDraftId,
            product_id: String(productId),
            name,
            price,
            qty,
          });
        }
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
      }
    }

    const { data: o } = await supabase
      .from("Orders")
      .select(
        "draft_id, created_at, method, amount, reference, message, full_name, email, phone, address, city, postal_code"
      )
      .eq("draft_id", id)
      .single();

    if (!o) return res.status(404).json({ error: "Session or order not found" });

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

    if (!order) return res.status(404).json({ error: "Order not found" });

    const { data: items, error: itemsErr } = await supabase
      .from("OrderItems")
      .select("product_id, name, price, qty, subtotal")
      .eq("order_id", draftId)
      .order("name", { ascending: true });

    if (itemsErr) return res.status(500).json({ error: "Failed to fetch items" });

    const subtotal = (items || []).reduce((acc, it) => acc + toNum(it.price) * toNum(it.qty), 0);

    res.json({
      order,
      items: items || [],
      totals: { subtotal: Number(subtotal), total: Number(order.amount), currency: (order.currency || "cad").toUpperCase() },
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

    if (!o) return res.status(404).json({ error: "Order not found" });

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


/* ---------- Errors ---------- */
app.use((err, _req, res, _next) => {
  console.error("❌ Unhandled error:", err?.raw?.message || err?.message || err);
  res.status(500).json({ error: err?.raw?.message || err?.message || "Internal server error" });
});

/* ---------- Start ---------- */
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
