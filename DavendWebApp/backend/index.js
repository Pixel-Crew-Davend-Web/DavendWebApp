import express from "express";
import nodemailer from "nodemailer";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import multer from "multer";
import paypal from "@paypal/checkout-server-sdk";
import Stripe from "stripe";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

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
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PAYPAL_ENV = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
const PAYPAL_CLIENT_ID = requireEnv("PAYPAL_CLIENT_ID");
const PAYPAL_CLIENT_SECRET = requireEnv("PAYPAL_CLIENT_SECRET");
const payPalEnv =
  PAYPAL_ENV === "live"
    ? new paypal.core.LiveEnvironment(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET)
    : new paypal.core.SandboxEnvironment(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET);
const payPalClient = new paypal.core.PayPalHttpClient(payPalEnv);

/* ---------- Helpers ---------- */

const feBaseUrl = () => {
  const url = process.env.FRONTEND_URL || "http://localhost:4200";
  if (!/^https?:\/\//.test(url)) throw new Error(`FRONTEND_URL is invalid (got "${url}")`);
  return url;
};

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function fetchProduct(productId) {
  const { data, error } = await supabase
    .from("Products")
    .select("id, name, price")
    .eq("id", productId)
    .single();

  if (error || !data) throw new Error(`Product not found: ${productId}`);

  const priceNum = toNum(data.price);
  if (!(priceNum > 0)) {
    console.error("❌ Invalid product price", { productId, name: data.name, rawPrice: data.price });
    throw new Error(`Invalid price for product ${productId}`);
  }

  return { id: data.id, name: data.name ?? `Item ${productId}`, unit_amount: Math.round(priceNum * 100) };
}

const getServerProduct = (productId) => fetchProduct(productId);

async function buildStripeLineItems(items) {
  const rows = await Promise.all(
    (items || []).map(async (it) => {
      const p = await fetchProduct(it.id);
      return {
        quantity: Number(it.qty) || 1,
        price_data: { currency: "cad", unit_amount: p.unit_amount, product_data: { name: p.name } },
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
    normalized.push({ product_id: p.id, name: it.name || p.name, price: p.unit_amount / 100, qty });
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

/* ---------- Async wrapper & error middleware ---------- */

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.use((req, res, next) => next()); // placeholder to keep middleware order readable

/* ---------- Stripe webhook (raw body) ---------- */

app.post(
  "/api/webhooks/stripe",
  bodyParser.raw({ type: "application/json" }),
  asyncHandler(async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (e) {
      console.error("⚠️ Webhook signature verification failed:", e.message);
      return res.status(400).send(`Webhook Error: ${e.message}`);
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object; 

        const draftId = session?.metadata?.orderDraftId || session.id;

        const pi = await stripe.paymentIntents.retrieve(session.payment_intent, {
          expand: ["charges.data.balance_transaction"],
        });
        const charge = pi.charges?.data?.[0] || null;

        const order = {
          draft_id: draftId,
          method: "card",
          status: "paid",
          amount: (session.amount_total || 0) / 100,
          currency: (session.currency || "cad").toLowerCase(),
          stripe_payment_intent: pi.id,
          stripe_charge_id: charge?.id || null,
          reference: charge?.id || null, 
          message: session.metadata?.message || "",
          full_name: session.metadata?.fullName || "",
          email: session.customer_details?.email || "",
          phone: session.metadata?.phone || "",
          address: session.metadata?.address || "",
          city: session.metadata?.city || "",
          postal_code: session.metadata?.postalCode || "",
        };

        const { error: upsertErr } = await supabase
          .from("Orders")
          .upsert(order, { onConflict: "draft_id" });

        if (upsertErr) {
          console.error("❌ Failed to upsert Stripe order:", upsertErr);
          return res.sendStatus(200);
        }

        const { data: existingItems, error: existErr } = await supabase
          .from("OrderItems")
          .select("id")
          .eq("order_id", draftId)
          .limit(1);

        if (existErr) {
          console.error("⚠️ Could not check existing items:", existErr);
        }

        if (!existingItems || existingItems.length === 0) {
          const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
          for (const li of lineItems.data) {
            const qty = li.quantity || 1;
            const unit = li.amount_total && qty ? li.amount_total / qty / 100 : 0;

            const { error: itemErr } = await supabase.from("OrderItems").insert({
              order_id: draftId,
              product_id: li.price?.product || "adhoc",
              name: li.description || "Unnamed item",
              price: unit,
              qty,
            });
            if (itemErr) console.error("⚠️ Failed to insert OrderItem:", itemErr, li);
          }
        } else {
          console.log(`ℹ️ Items already exist for ${draftId}; skipping re-insert.`);
        }

        console.log("✅ Stripe order saved:", draftId);
      } else {
        console.log(`ℹ️ Unhandled Stripe event: ${event.type}`);
      }

      return res.sendStatus(200);
    } catch (err) {
      console.error("❌ Webhook handler error:", err);
      return res.sendStatus(200);
    }
  })
);


async function handleStripeCheckoutCompleted(session) {
  const draftId = session?.metadata?.orderDraftId || session.id;

  const order = await insertOrder({
    draft_id: draftId,
    stripe_payment_intent: session.payment_intent,
    status: "paid",
    method: "card",
    reference: null,
    message: session.metadata?.message || "",
    amount: (session.amount_total || 0) / 100,
    currency: (session.currency || "cad").toLowerCase(),
    full_name: session.metadata?.fullName || "",
    email: session.customer_details?.email || "",
    phone: session.metadata?.phone || "",
    address: session.metadata?.address || "",
    city: session.metadata?.city || "",
    postal_code: session.metadata?.postalCode || "",
  });

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
  for (const li of lineItems.data) {
    const qty = li.quantity || 1;
    const unit = li.amount_total && qty ? li.amount_total / qty / 100 : 0;
    await insertItem({
      order_id: order.draft_id,
      product_id: li.price?.product || "adhoc",
      name: li.description || "Unnamed item",
      price: unit,
      qty,
    });
  }
}

/* ---------- JSON parser (after webhook) ---------- */

app.use(bodyParser.json());

/* ---------- Health ---------- */

app.get("/", (_req, res) => res.send("Davend Email + Payments Backend Running ✔️"));

/* ---------- Stripe (card) ---------- */

app.post(
  "/api/payments/checkout-session",
  asyncHandler(async (req, res) => {
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

    res.json({ id: session.id });
  })
);

/* ---------- E-Transfer (pending) ---------- */

app.post(
  "/api/payments/etransfer-order",
  asyncHandler(async (req, res) => {
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
      await insertItem({ order_id: order.draft_id, product_id: ni.product_id, name: ni.name, price: ni.price, qty: ni.qty });
    }

    res.json({ message: "Order created with status pending", order });
  })
);

/* ---------- PayPal: create ---------- */

app.post(
  "/api/payments/paypal/create-order",
  asyncHandler(async (req, res) => {
    const { items = [], orderDraftId = "" } = req.body;

    const ppItems = [];
    let total = 0;
    for (const it of items) {
      const p = await getServerProduct(it.id);
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
    res.json({ id: order.result.id });
  })
);

/* ---------- PayPal: capture ---------- */

app.post(
  "/api/payments/paypal/capture-order",
  asyncHandler(async (req, res) => {
    const { orderID, orderDraftId, customer = {}, items = [] } = req.body;

    const capReq = new paypal.orders.OrdersCaptureRequest(orderID);
    capReq.requestBody({});
    const capRes = await payPalClient.execute(capReq);

    const pu = capRes.result?.purchase_units?.[0];
    const cap = pu?.payments?.captures?.[0];
    const capturedAmount = toNum(cap?.amount?.value);
    const capturedCurrency = String(cap?.amount?.currency_code || "CAD").toLowerCase();

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

        await insertItem({ order_id: orderDraftId, product_id: String(productId), name, price, qty });
      }
    }

    res.json({ status: "success", order });
  })
);

/* ---------- Success helpers ---------- */

// Unified success payload: works with Stripe session IDs (cs_*) and PayPal draft_ids (ORD-####)
app.get(
  "/api/payments/session/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id;

    // Try Stripe session first if it looks like one
    if (id.startsWith("cs_")) {
      try {
        const session = await stripe.checkout.sessions.retrieve(id);
        const order = {
          id: session.metadata?.orderDraftId || session.id,
          date: new Date(session.created * 1000).toISOString(),
          method: session.payment_method_types?.[0] || "card",
          amount: (session.amount_total || 0) / 100,
          reference: null,
          message: session.metadata?.message || "",
          customer: {
            fullName: session.metadata?.fullName || "",
            email: session.customer_details?.email || "",
            phone: session.metadata?.phone || "",
            address: session.metadata?.address || "",
            city: session.metadata?.city || "",
            postalCode: session.metadata?.postalCode || "",
          },
        };
        return res.json({ session, order });
      } catch {
        // fall through to draft_id lookup
      }
    }

    // Fallback: treat :id as an Orders.draft_id (PayPal / E-Transfer)
    const { data: o } = await supabase
      .from("Orders")
      .select(
        "draft_id, created_at, method, amount, reference, message, full_name, email, phone, address, city, postal_code"
      )
      .eq("draft_id", id)
      .single();

    if (!o) return res.status(404).json({ error: "Session or order not found" });

    // Shape matches your success screen bindings (order.customer.*)
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

/* ---------- Errors ---------- */

app.use((err, _req, res, _next) => {
  console.error("❌ Unhandled error:", err?.raw?.message || err?.message || err);
  res.status(500).json({ error: err?.raw?.message || err?.message || "Internal server error" });
});

/* ---------- Start ---------- */

app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
