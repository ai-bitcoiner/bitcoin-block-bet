const { authenticatedLndGrpc, pay } = require('ln-service');
const { SimplePool, generateSecretKey, getPublicKey, finalizeEvent } = require('nostr-tools');
const fs = require('fs');
const axios = require('axios');
const WebSocket = require('ws');
const db = require('./db');
require('dotenv').config();

// --- CONFIG ---
const RELAYS = ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://nos.lol'];
const AGENT_SK = generateSecretKey(); // In prod, use process.env.AGENT_SK
const AGENT_PK = getPublicKey(AGENT_SK);
const LIGHTNING_ADDRESS = 'waterheartwarming611802@getalby.com'; 
const FEE_PERCENT = 0.01;

console.log("🤖 Zap Pool Manager (Persistent) Starting...");
console.log("🔑 Agent Pubkey:", AGENT_PK);

// --- LIGHTNING SETUP ---
let lnd = null;
try {
  const cert = fs.readFileSync(process.env.LND_CERT_PATH).toString('base64');
  const macaroon = fs.readFileSync(process.env.LND_MACAROON_PATH).toString('base64');
  const socket = process.env.LND_SOCKET;
  const { lnd: _lnd } = authenticatedLndGrpc({ cert, macaroon, socket });
  lnd = _lnd;
  console.log("⚡ LND Connected");
} catch (e) { console.error("❌ LND Failed (Read-Only Mode)"); }

const pool = new SimplePool();
let state = db.load();

// --- MAIN LOOP ---
async function start() {
  publishMetadata();
  
  // 1. Recover State (Catch-up)
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
  
  // A. Fetch missed Zaps
  const events = await pool.querySync(RELAYS, {
    kinds: [9735],
    '#p': [AGENT_PK],
    since: state.lastZapTimestamp + 1
  });
  
  console.log(`   Found ${events.length} missed Zaps.`);
  for (const ev of events) {
    await handleZap(ev, false); // Don't save yet
  }

  // B. Fetch missed Blocks
  try {
    const tipRes = await axios.get('https://mempool.space/api/v1/blocks/tip/height');
    const currentTip = tipRes.data;
    
    if (state.lastProcessedBlock > 0 && state.lastProcessedBlock < currentTip) {
      console.log(`   Missed blocks from ${state.lastProcessedBlock} to ${currentTip}`);
      // Process sequential blocks
      for (let h = state.lastProcessedBlock + 1; h <= currentTip; h++) {
        // Get hash & timestamp for this block
        // (Mempool API doesn't allow batch fetch easily, getting hash by height)
        const hashRes = await axios.get(`https://mempool.space/api/v1/block-height/${h}`);
        const hash = hashRes.data;
        const blockRes = await axios.get(`https://mempool.space/api/v1/block/${hash}`);
        await processBlock(blockRes.data); 
      }
    } else {
      // First run or up to date
      state.lastProcessedBlock = currentTip;
      db.save(state);
    }
  } catch (e) { console.error("Recovery Error:", e.message); }
}

// --- HANDLERS ---
async function handleZap(event, autoSave = true) {
  // Deduplicate
  if (state.pendingBets.find(b => b.id === event.id)) return;

  const bolt11 = event.tags.find(t => t[0] === 'bolt11')?.[1];
  const description = event.tags.find(t => t[0] === 'description')?.[1];
  if (!bolt11 || !description) return;

  try {
    const zapRequest = JSON.parse(description);
    const side = zapRequest.content.toUpperCase().trim(); // "HEADS" or "TAILS"
    // In prod, decode bolt11 for real amount. Mocking 1000 sats here or need 'bolt11' lib
    const amount = 1000; 

    if (side === 'HEADS' || side === 'TAILS') {
      console.log(`🎰 Bet Logged: ${amount} sats on ${side} (${new Date(event.created_at * 1000).toISOString()})`);
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
  // block.timestamp is in seconds
  console.log(`🧱 Processing Block ${block.height}...`);
  
  // 1. Filter bets meant for THIS block
  // Logic: Bets placed BEFORE this block was mined, but AFTER the previous block
  // Simply: Take all pending bets timestamped BEFORE block.timestamp
  const eligibleBets = state.pendingBets.filter(b => b.timestamp < block.timestamp);
  
  if (eligibleBets.length === 0) {
    state.lastProcessedBlock = block.height;
    db.save(state);
    return;
  }

  // 2. Determine Outcome
  const lastChar = block.id.slice(-1);
  const isEven = parseInt(lastChar, 16) % 2 === 0;
  const winnerSide = isEven ? 'TAILS' : 'HEADS';
  console.log(`   Outcome: ${winnerSide} (Hash: ...${lastChar})`);

  // 3. Payout Logic
  const totalPot = eligibleBets.reduce((sum, b) => sum + b.amount, 0);
  const winners = eligibleBets.filter(b => b.side === winnerSide);
  const totalWinningBet = winners.reduce((sum, b) => sum + b.amount, 0);
  
  const houseFee = Math.floor(totalPot * FEE_PERCENT);
  const payoutPool = totalPot - houseFee;

  console.log(`   💰 Pot: ${totalPot} | Winners: ${winners.length} | Payout Pool: ${payoutPool}`);

  if (winners.length > 0 && lnd) {
    for (const winner of winners) {
      const share = (winner.amount / totalWinningBet) * payoutPool;
      const payout = Math.floor(share);
      console.log(`      -> Sending ${payout} sats to ${winner.pubkey.slice(0,8)}`);
      await payWinner(winner.pubkey, payout);
    }
  } else if (winners.length > 0) {
    console.log("      ⚠️ LND not connected. Payouts skipped (Simulated).");
  } else {
    console.log("      😈 House Wins Everything.");
  }

  // 4. Cleanup
  // Remove processed bets from pending
  state.pendingBets = state.pendingBets.filter(b => b.timestamp >= block.timestamp);
  state.lastProcessedBlock = block.height;
  db.save(state);
}

// --- HELPERS ---
async function payWinner(pubkey, amount) {
  try {
    const event = await pool.get(RELAYS, { kinds: [0], authors: [pubkey] });
    if (!event) return;
    const profile = JSON.parse(event.content);
    if (profile.lud16) {
      const [name, domain] = profile.lud16.split('@');
      const res = await axios.get(`https://${domain}/.well-known/lnurlp/${name}`);
      const invRes = await axios.get(`${res.data.callback}?amount=${amount * 1000}`);
      await pay({ lnd, request: invRes.data.pr });
      console.log("      ✅ Payment Sent!");
    }
  } catch (e) { console.error(`      ❌ Pay Error: ${e.message}`); }
}

async function publishMetadata() {
  const event = finalizeEvent({
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify({
      name: "Bitcoin Block Bet House",
      about: "Zap me HEADS or TAILS. P2P Betting Protocol.",
      lud16: LIGHTNING_ADDRESS
    })
  }, AGENT_SK);
  await Promise.any(pool.publish(RELAYS, event));
}

start();
