const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const QRCode = require("qrcode");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const BASE44_WEBHOOK = process.env.BASE44_WEBHOOK_URL;

let client;
let currentQR = null;
let clientStatus = "disconnected";

function initClient() {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true,
    },
  });

  client.on("qr", async (qr) => {
    currentQR = await QRCode.toDataURL(qr);
    clientStatus = "qr";
    console.log("QR generado");
  });

  client.on("ready", () => {
    clientStatus = "ready";
    currentQR = null;
    console.log("WhatsApp conectado!");
  });

  client.on("disconnected", () => {
    clientStatus = "disconnected";
    currentQR = null;
    console.log("WhatsApp desconectado");
  });

  client.on("message", async (msg) => {
    if (!BASE44_WEBHOOK) return;
    try {
      await fetch(BASE44_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: msg.from,
          body: msg.body,
          timestamp: msg.timestamp,
          name: msg._data?.notifyName || "",
        }),
      });
    } catch (e) {
      console.error("Error:", e.message);
    }
  });

  client.initialize();
  clientStatus = "waiting_qr";
}

app.get("/status", (req, res) => {
  res.json({ status: clientStatus, qr: currentQR });
});

app.post("/request-qr", (req, res) => {
  if (client) client.destroy().catch(() => {});
  initClient();
  res.json({ ok: true });
});

app.post("/disconnect", async (req, res) => {
  if (client) {
    await client.destroy().catch(() => {});
    client = null;
  }
  clientStatus = "disconnected";
  currentQR = null;
  res.json({ ok: true });
});

app.post("/send", async (req, res) => {
  const { phone, message } = req.body;
  if (!client || clientStatus !== "ready") {
    return res.status(400).json({ error: "WhatsApp no conectado" });
  }
  try {
    await client.sendMessage(`${phone}@c.us`, message);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Bridge corriendo en puerto", process.env.PORT || 3000);
});
