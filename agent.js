const { authenticatedLndGrpc, pay, decodePaymentRequest } = require('ln-service');
const { SimplePool, generateSecretKey, getPublicKey, finalizeEvent, nip19 } = require('nostr-tools');
const fs = require('fs');
require('dotenv').config();
const axios = require('axios');
const WebSocket = require('ws');

// --- CONFIG ---
const RELAYS = ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://nos.lol'];
const AGENT_SK = generateSecretKey(); // In prod, load from .env (hex)
const AGENT_PK = getPublicKey(AGENT_SK);
const LIGHTNING_ADDRESS = 'waterheartwarming611802@getalby.com'; // Your Alby Address
const FEE_PERCENT = 0.01; // 1% House Edge

console.log("🤖 Zap Pool Manager Starting...");
console.log("🔑 Agent Pubkey:", AGENT_PK);
console.log("⚡ Fee:", FEE_PERCENT * 100, "%");
console.log("📧 Lightning Address:", LIGHTNING_ADDRESS);

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

// --- STATE ---
let currentBlockHeight = 0;
let bets = []; // { pubkey, amount, side, invoice (optional) }
const pool = new SimplePool();

// --- MAIN LOOP ---
async function start() {
  // 0. Publish Metadata (Link Pubkey -> Lightning Address)
  const metadata = {
    name: "Bitcoin Block Bet Agent",
    about: "Zap me with 'HEADS' or 'TAILS' to bet on the next block hash! 1% fee. #bitcoin-block-bet-v1",
    lud16: LIGHTNING_ADDRESS, // Allows Zaps!
    picture: "https://robohash.org/" + AGENT_PK
  };

  const kind0 = {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(metadata),
  };
  
  const signedKind0 = finalizeEvent(kind0, AGENT_SK);
  await Promise.any(pool.publish(RELAYS, signedKind0));
  console.log("📢 Announced Agent Metadata to Relays!");

  // 1. Connect to Mempool for Blocks
  connectMempool();

  // 2. Listen for Zaps (Kind 9735)
  const sub = pool.subscribeMany(RELAYS, [
    {
      kinds: [9735], // Zap Receipt
      '#p': [AGENT_PK], // Sent to ME
      since: Math.floor(Date.now() / 1000)
    }
  ], {
    onevent(event) {
      handleZap(event);
    }
  });
  
  console.log("👂 Listening for Zaps on Nostr...");
}

// --- HANDLE ZAPS (BETS) ---
async function handleZap(event) {
  try {
    const bolt11 = event.tags.find(t => t[0] === 'bolt11')?.[1];
    const description = event.tags.find(t => t[0] === 'description')?.[1];
    
    if (!bolt11 || !description) return;

    // Parse the Zap Request (embedded JSON)
    const zapRequest = JSON.parse(description);
    const content = zapRequest.content.toUpperCase().trim(); // "HEADS" or "TAILS"
    const amountSats = getInvoiceAmount(bolt11); // Implement decode helper

    if (content === 'HEADS' || content === 'TAILS') {
      console.log(`🎰 New Bet: ${amountSats} sats on ${content} from ${zapRequest.pubkey.slice(0,8)}`);
      
      bets.push({
        pubkey: zapRequest.pubkey,
        amount: amountSats,
        side: content,
        timestamp: Date.now()
      });
    }

  } catch (e) {
    // console.error("Zap parse error", e);
  }
}

// --- BLOCK MINED (PAYOUT) ---
async function handleBlock(block) {
  if (block.height <= currentBlockHeight) return;
  currentBlockHeight = block.height;

  const winnerSide = getParity(block.id); // 'HEADS' or 'TAILS'
  console.log(`🧱 Block ${block.height} Mined! Winner: ${winnerSide}`);

  if (bets.length === 0) return;

  // 1. Calculate Pot
  const totalPot = bets.reduce((sum, b) => sum + b.amount, 0);
  const winners = bets.filter(b => b.side === winnerSide);
  const totalWinningBet = winners.reduce((sum, b) => sum + b.amount, 0);

  // 2. House Take
  const houseFee = Math.floor(totalPot * FEE_PERCENT);
  const payoutPool = totalPot - houseFee;

  console.log(`💰 Pot: ${totalPot} | Fee: ${houseFee} | Payout: ${payoutPool}`);

  // 3. Distribute
  if (winners.length > 0 && lnd) {
    for (const winner of winners) {
      // Pro-rata share
      const share = (winner.amount / totalWinningBet) * payoutPool;
      const payoutAmount = Math.floor(share);

      console.log(`   -> Paying ${payoutAmount} sats to ${winner.pubkey.slice(0,8)}`);
      await payWinner(winner.pubkey, payoutAmount);
    }
  } else {
    console.log("   -> No winners this round. House keeps pot! 😈");
  }

  // 4. Reset
  bets = [];
}

// --- HELPERS ---
async function payWinner(pubkey, amount) {
  try {
    // Fetch user's LNURL from Nostr profile (Kind 0)
    const event = await pool.get(RELAYS, { kinds: [0], authors: [pubkey] });
    if (!event) return;
    
    const profile = JSON.parse(event.content);
    const lud16 = profile.lud16; // e.g. user@getalby.com
    
    if (lud16) {
      // 1. Get LNURL Pay Params
      const [name, domain] = lud16.split('@');
      const res = await axios.get(`https://${domain}/.well-known/lnurlp/${name}`);
      
      // 2. Get Invoice
      const callback = res.data.callback;
      const invRes = await axios.get(`${callback}?amount=${amount * 1000}`); // millisats
      const invoice = invRes.data.pr;

      // 3. Pay
      await pay({ lnd, request: invoice });
      console.log(`      ✅ Paid ${amount} sats to ${lud16}`);
    }
  } catch (e) {
    console.error(`      ❌ Payment failed to ${pubkey}:`, e.message);
  }
}

function getParity(hash) {
  const lastChar = hash.slice(-1);
  const val = parseInt(lastChar, 16);
  return val % 2 === 0 ? 'TAILS' : 'HEADS';
}

function getInvoiceAmount(bolt11) {
  // In prod, use 'decodePaymentRequest' from ln-service
  // Mocking simple decode for now or assume 1000 sats if missing
  return 1000; 
}

function connectMempool() {
  const ws = new WebSocket('wss://mempool.space/api/v1/ws');
  ws.on('open', () => ws.send(JSON.stringify({ action: 'want', data: ['blocks'] })));
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.block) handleBlock(msg.block);
    } catch (e) {}
  });
}

start();
