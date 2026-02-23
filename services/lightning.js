const { authenticatedLndGrpc, createInvoice, subscribeToInvoice, pay } = require('ln-service');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class RealLightningService {
  constructor() {
    this.lnd = null;
    this.isReady = false;
    this.connect();
  }

  // Private connection logic
  connect() {
    try {
      // 1. Validate Credentials (Never hardcoded)
      const certPath = process.env.LND_CERT_PATH; // e.g., ~/.lnd/tls.cert
      const macaroonPath = process.env.LND_MACAROON_PATH; // e.g., ~/.lnd/admin.macaroon
      const socket = process.env.LND_SOCKET; // e.g., 127.0.0.1:10009 or onion address

      if (!certPath || !macaroonPath || !socket) {
        console.warn("⚠️ Lightning Node credentials missing in .env. Falling back to Mock Mode.");
        return;
      }

      // 2. Load Secure Files
      const cert = fs.readFileSync(certPath).toString('base64');
      const macaroon = fs.readFileSync(macaroonPath).toString('base64');

      // 3. Connect to LND (Supports Tor/Onion)
      const { lnd } = authenticatedLndGrpc({
        cert,
        macaroon,
        socket,
      });

      this.lnd = lnd;
      this.isReady = true;
      console.log("⚡ Connected to Real LND Node successfully.");

    } catch (error) {
      console.error("❌ Failed to connect to Lightning Node:", error.message);
      this.isReady = false;
    }
  }

  // Public: Create Invoice for Bet
  async createBetInvoice(amountSats, memo = "Bitcoin Block Bet") {
    if (!this.isReady) throw new Error("Lightning Node not connected");

    try {
      const invoice = await createInvoice({
        lnd: this.lnd,
        tokens: amountSats,
        description: memo,
        expires_at: new Date(Date.now() + 1000 * 60 * 10).toISOString(), // 10 mins
      });
      return invoice;
    } catch (error) {
      console.error("Error creating invoice:", error);
      throw new Error("Failed to generate invoice");
    }
  }

  // Public: Pay Winner (Outbound)
  async payWinner(invoiceRequest) {
    if (!this.isReady) throw new Error("Lightning Node not connected");

    try {
      const payment = await pay({
        lnd: this.lnd,
        request: invoiceRequest,
      });
      return payment;
    } catch (error) {
      console.error("Error paying winner:", error);
      throw new Error("Payment failed");
    }
  }

  // Public: Monitor Specific Invoice
  monitorInvoice(id, callback) {
    if (!this.isReady) return;

    const sub = subscribeToInvoice({ lnd: this.lnd, id });

    sub.on('invoice_updated', (invoice) => {
      if (invoice.is_confirmed) {
        callback(invoice);
      }
    });

    return sub;
  }
}

module.exports = new RealLightningService();
