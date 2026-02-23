const { SimplePool, generateSecretKey, getPublicKey, finalizeEvent, nip04, nip19 } = require('nostr-tools');
const fs = require('fs');
const axios = require('axios');
const WebSocket = require('ws');
const db = require('./db');
require('dotenv').config();

// --- CONFIG ---
const RELAYS = ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://nos.lol'];
const AGENT_SK = process.env.AGENT_SK || generateSecretKey(); // Use .env in prod
const AGENT_PK = getPublicKey(AGENT_SK);
const LIGHTNING_ADDRESS = 'waterheartwarming611802@getalby.com'; 
const FEE_PERCENT = 0.01;

// --- NWC SETUP (The Bank) ---
const NWC_STRING = process.env.NWC_CONNECTION_STRING;
let nwcPubkey, nwcRelay, nwcSecret;

if (NWC_STRING) {
  try {
    const url = new URL(NWC_STRING.replace('nostr+walletconnect:', 'http:')); // Hack to parse custom protocol
    nwcPubkey = url.host;
    nwcRelay = url.searchParams.get('relay');
    nwcSecret = url.searchParams.get('secret');
    console.log("✅ NWC Configured (Alby/Mutiny)");
  } catch (e) {
    console.error("❌ Invalid NWC String:", e.message);
  }
} else {
  console.warn("⚠️ No NWC String found. Agent cannot pay winners!");
}

const pool = new SimplePool();
let state = db.load();

// --- MAIN LOOP ---
async function start() {
  console.log("🤖 Zap Pool Manager (NWC Edition) Starting...");
  console.log("🔑 Agent Pubkey:", AGENT_PK);
  
  publishMetadata();
  
  // 1. Recover State
  await recoverState();

  // 2. Listen for NEW Zaps
  const sub = pool.subscribeMany(RELAYS, [
    { kinds: [9735], '#p': [AGENT_PK], since: Math.floor(Date.now() / 1000) }
  ], { onevent: handleZap });

  // 3. Listen for NEW Blocks
  const ws = new WebSocket('wss://mempool.space/api/v1/ws');
  ws.on('open', () => ws.send(JSON.stringify({ action: 'want', data: ['blocks'] })));
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.block) processBlock(msg.block);
    } catch (e) {}
  });
  
  console.log("👂 Watching for Zaps & Blocks...");
}

// --- RECOVERY LOGIC ---
async function recoverState() {
  console.log("🔄 Checking for missed data...");
  const events = await pool.querySync(RELAYS, {
    kinds: [9735],
    '#p': [AGENT_PK],
    since: state.lastZapTimestamp + 1
  });
  console.log(`   Found ${events.length} missed Zaps.`);
  for (const ev of events) await handleZap(ev, false);

  try {
    const tipRes = await axios.get('https://mempool.space/api/v1/blocks/tip/height');
    const currentTip = tipRes.data;
    if (state.lastProcessedBlock > 0 && state.lastProcessedBlock < currentTip) {
      console.log(`   Missed blocks from ${state.lastProcessedBlock} to ${currentTip}`);
      for (let h = state.lastProcessedBlock + 1; h <= currentTip; h++) {
        const hashRes = await axios.get(`https://mempool.space/api/v1/block-height/${h}`);
        const blockRes = await axios.get(`https://mempool.space/api/v1/block/${hashRes.data}`);
        await processBlock(blockRes.data); 
      }
    } else {
      state.lastProcessedBlock = currentTip;
      db.save(state);
    }
  } catch (e) { console.error("Recovery Error:", e.message); }
}

// --- HANDLERS ---
async function handleZap(event, autoSave = true) {
  if (state.pendingBets.find(b => b.id === event.id)) return;

  const bolt11 = event.tags.find(t => t[0] === 'bolt11')?.[1];
  const description = event.tags.find(t => t[0] === 'description')?.[1];
  if (!bolt11 || !description) return;

  try {
    const zapRequest = JSON.parse(description);
    const side = zapRequest.content.toUpperCase().trim(); 
    const amount = 1000; // In prod, use 'bolt11' lib to decode real amount

    if (side === 'HEADS' || side === 'TAILS') {
      console.log(`🎰 Bet Logged: ${amount} sats on ${side}`);
      state.pendingBets.push({
        id: event.id,
        pubkey: zapRequest.pubkey,
        amount,
        side,
        timestamp: event.created_at
      });
      state.lastZapTimestamp = Math.max(state.lastZapTimestamp, event.created_at);
      if (autoSave) db.save(state);
    }
  } catch (e) {}
}

async function processBlock(block) {
  console.log(`🧱 Processing Block ${block.height}...`);
  const eligibleBets = state.pendingBets.filter(b => b.timestamp < block.timestamp);
  
  if (eligibleBets.length === 0) {
    state.lastProcessedBlock = block.height;
    db.save(state);
    return;
  }

  const lastChar = block.id.slice(-1);
  const isEven = parseInt(lastChar, 16) % 2 === 0;
  const winnerSide = isEven ? 'TAILS' : 'HEADS';
  console.log(`   Outcome: ${winnerSide} (Hash: ...${lastChar})`);

  const totalPot = eligibleBets.reduce((sum, b) => sum + b.amount, 0);
  const winners = eligibleBets.filter(b => b.side === winnerSide);
  const totalWinningBet = winners.reduce((sum, b) => sum + b.amount, 0);
  const houseFee = Math.floor(totalPot * FEE_PERCENT);
  const payoutPool = totalPot - houseFee;

  console.log(`   💰 Pot: ${totalPot} | Winners: ${winners.length} | Payout Pool: ${payoutPool}`);

  if (winners.length > 0 && nwcSecret) {
    for (const winner of winners) {
      const share = (winner.amount / totalWinningBet) * payoutPool;
      const payout = Math.floor(share);
      console.log(`      -> Paying ${payout} sats to ${winner.pubkey.slice(0,8)}`);
      await payWinner(winner.pubkey, payout);
    }
  } else if (winners.length > 0) {
    console.log("      ⚠️ NWC not configured. Payouts skipped (Simulated).");
  } else {
    console.log("      😈 House Wins Everything.");
  }

  state.pendingBets = state.pendingBets.filter(b => b.timestamp >= block.timestamp);
  state.lastProcessedBlock = block.height;
  db.save(state);
}

// --- PAYOUT VIA NWC ---
async function payWinner(pubkey, amount) {
  try {
    // 1. Get Winner's Invoice (via LNURL)
    const event = await pool.get(RELAYS, { kinds: [0], authors: [pubkey] });
    if (!event) return;
    const profile = JSON.parse(event.content);
    if (!profile.lud16) return;

    const [name, domain] = profile.lud16.split('@');
    const res = await axios.get(`https://${domain}/.well-known/lnurlp/${name}`);
    
    // Some LNURLs return metadata as string, others as object
    const metadata = typeof res.data.metadata === 'string' ? res.data.metadata : JSON.stringify(res.data.metadata);
    const zapReq = {
      kind: 9734,
      content: "Payout for Bitcoin Block Bet",
      tags: [
        ['p', pubkey],
        ['amount', (amount * 1000).toString()],
        ['relays', RELAYS[0]],
        ['lnurl', res.data.callback]
      ],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: AGENT_PK
    };
    // Note: We don't have the user's private key to sign the Zap Request, but for a payout 
    // we might just pay a standard invoice if they support it, or construct a generic zap.
    // For simplicity, we just request a standard invoice.
    
    const invRes = await axios.get(`${res.data.callback}?amount=${amount * 1000}`);
    const invoice = invRes.data.pr;

    // 2. Pay via NWC
    const command = { method: "pay_invoice", params: { invoice } };
    const encrypted = await nip04.encrypt(AGENT_SK, nwcPubkey, JSON.stringify(command));
    
    const reqEvent = finalizeEvent({
      kind: 23194,
      content: encrypted,
      tags: [['p', nwcPubkey]],
      created_at: Math.floor(Date.now() / 1000),
    }, AGENT_SK);

    const ws = new WebSocket(nwcRelay);
    ws.on('open', () => {
      ws.send(JSON.stringify(["EVENT", reqEvent]));
      console.log("      ✅ NWC Payout Command Sent!");
      setTimeout(() => ws.close(), 2000);
    });

  } catch (e) { console.error(`      ❌ Payout Error: ${e.message}`); }
}

async function publishMetadata() {
  const event = finalizeEvent({
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify({
      name: "AI-Bitcoiner",
      display_name: "AI-Bitcoiner",
      about: "The Official House Agent for Bitcoin Block Betting. Zap me HEADS or TAILS to play! 🎲⚡",
      lud16: LIGHTNING_ADDRESS,
      picture: "https://robohash.org/" + AGENT_PK
    })
  }, process.env.AGENT_SK || generateSecretKey());
  await Promise.any(pool.publish(RELAYS, event));
}

start();

