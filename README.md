# 🎲 Bitcoin Block Hash Betting (P2P Edition)

A **Serverless, Unstoppable Betting Protocol** where users bet on whether the next Bitcoin block hash will be ODD or EVEN.

**Zero Backend. Zero Database. Pure Peer-to-Peer.**

## 🌟 Architecture
This application runs entirely in the browser and connects directly to decentralized networks:
1.  **Oracle:** Connects to **Mempool.space WebSocket** to verify block hashes in real-time.
2.  **Communication:** Uses **Nostr Relays** (`wss://relay.damus.io`, etc.) to broadcast bets and offers.
3.  **Settlement:** Uses **Bitcoin Lightning Network** for instant, trust-minimized payments.

There is no "House Server." Instead, anyone can run the **AI Agent Script** (`agent.js`) to become a Bookmaker and accept bets from the network.

---

## 🚀 How to Play (Frontend)

The frontend is a static React app. You can run it locally or host it on IPFS/Vercel.

### 1. Install & Run
```bash
cd frontend
npm install
npm run dev
```

### 2. Place a Bet
1.  Open `http://localhost:5173`
2.  Wait for a Bitcoin Block to be mined (watch the 3D Coin Flip!).
3.  Click **BET HEADS** or **BET TAILS**.
4.  Your browser signs a **Nostr Event** (`kind: 1`) requesting a bet.
5.  If an **AI Agent** is online, it will reply with a Lightning Invoice.
6.  Scan the QR code to lock your bet!

---

## 🤖 How to Be "The House" (AI Agent)

Want to earn fees by accepting bets? Run the **AI Agent** on your own machine.

### Prerequisites
- A Bitcoin Lightning Node (**LND**)
- Node.js (v18+)

### 1. Configure Your Node
Create a `.env` file in the root directory (do NOT commit this!):
```ini
# Path to your LND Credentials
LND_CERT_PATH=/Users/yourname/.lnd/tls.cert
LND_MACAROON_PATH=/Users/yourname/.lnd/data/chain/bitcoin/mainnet/admin.macaroon
LND_SOCKET=127.0.0.1:10009
```

### 2. Run the Agent
```bash
npm install
node agent.js
```

**What happens:**
- The Agent connects to Nostr relays and listens for `bet_request`.
- When a user bets, the Agent generates a **Hold Invoice** and replies on Nostr.
- If the user pays, the Agent locks the funds.
- *Coming Soon: Auto-payouts via Lightning.*

---

## 🛠 Transparency (Provably Fair)
The winner is determined by the **last character** of the Bitcoin Block Hash.
- **Odd (1, 3, 5, 7, 9, b, d, f)** → HEADS
- **Even (0, 2, 4, 6, 8, a, c, e)** → TAILS

Anyone can verify the result on any Block Explorer.

## License
MIT - Fork it, clone it, run it.
