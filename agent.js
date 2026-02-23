const { authenticatedLndGrpc, createInvoice, subscribeToInvoice } = require('ln-service');
const { SimplePool, generateSecretKey, getPublicKey, finalizeEvent } = require('nostr-tools');
const fs = require('fs');
require('dotenv').config();
const WebSocket = require('ws');

// --- CONFIG ---
const RELAYS = ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://nos.lol'];
const APP_TAG = 'bitcoin-block-bet-v1';
const AGENT_SK = generateSecretKey(); // In prod, load from .env
const AGENT_PK = getPublicKey(AGENT_SK);

console.log("🤖 AI Betting Agent Starting...");
console.log("🔑 Pubkey:", AGENT_PK);

// --- LIGHTNING SETUP ---
let lnd = null;
try {
  const cert = fs.readFileSync(process.env.LND_CERT_PATH).toString('base64');
  const macaroon = fs.readFileSync(process.env.LND_MACAROON_PATH).toString('base64');
  const socket = process.env.LND_SOCKET;

  const { lnd: _lnd } = authenticatedLndGrpc({ cert, macaroon, socket });
  lnd = _lnd;
  console.log("⚡ LND Connected Successfully");
} catch (e) {
  console.error("❌ LND Connection Failed. Agent will run in READ-ONLY mode.");
}

// --- NOSTR SETUP ---
const pool = new SimplePool();

async function start() {
  // Subscribe to Bet Requests
  const sub = pool.subscribeMany(RELAYS, [
    {
      kinds: [1],
      '#t': [APP_TAG],
      since: Math.floor(Date.now() / 1000)
    }
  ], {
    onevent(event) {
      handleEvent(event);
    }
  });
  
  console.log("👂 Listening for bets on Nostr...");
}

async function handleEvent(event) {
  try {
    const data = JSON.parse(event.content);
    
    // 1. Handle Bet Request
    if (data.type === 'bet_request' && lnd) {
      console.log(`🤑 Bet Request: ${data.amount} sats on ${data.side} from ${data.pubkey.slice(0,8)}`);
      
      // Generate Invoice
      const invoice = await createInvoice({
        lnd,
        tokens: data.amount,
        description: `Bet on ${data.side} vs AI Agent`,
        expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(), // 5 mins
      });

      // Reply with Invoice Offer
      const replyEvent = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['t', APP_TAG], ['e', event.id], ['p', event.pubkey]],
        content: JSON.stringify({
          type: 'invoice_offer',
          invoice: invoice.request,
          amount: data.amount,
          side: data.side,
          target_pubkey: data.pubkey,
          agent_pubkey: AGENT_PK
        }),
      };
      
      const signedEvent = finalizeEvent(replyEvent, AGENT_SK);
      await Promise.any(pool.publish(RELAYS, signedEvent));
      console.log("   -> Invoice Offer Sent!");

      // Monitor for Payment
      monitorPayment(invoice.id, data, event.pubkey);
    }

  } catch (e) {
    // console.error("Event parse error", e);
  }
}

function monitorPayment(id, betData, userPubkey) {
  const sub = subscribeToInvoice({ lnd, id });
  
  sub.on('invoice_updated', async (invoice) => {
    if (invoice.is_confirmed) {
      console.log(`💰 PAYMENT CONFIRMED! ${invoice.tokens} sats from ${userPubkey.slice(0,8)}`);
      
      // Broadcast Confirmation
      const confirmEvent = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['t', APP_TAG], ['p', userPubkey]],
        content: JSON.stringify({
          type: 'payment_confirmed',
          amount: invoice.tokens,
          side: betData.side,
          target_pubkey: userPubkey,
          tx_id: id // In prod, don't leak this
        }),
      };
      
      const signedEvent = finalizeEvent(confirmEvent, AGENT_SK);
      await Promise.any(pool.publish(RELAYS, signedEvent));
    }
  });
}

start();
