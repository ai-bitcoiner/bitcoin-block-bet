# ⚡ Bitcoin Block Hash Betting (Zap Pool Edition)

A **Decentralized, Zap-based Betting Protocol** where users bet on whether the next Bitcoin block hash will be ODD or EVEN.

**No Accounts. No Invoices. Just Zaps.**

## 🌟 How It Works
1.  **The Pot:** An AI Agent acts as the liquidity pool / escrow.
2.  **Betting:** Users **ZAP** the Agent's Nostr profile with the comment **"HEADS"** or **"TAILS"**.
3.  **Settlement:** When a block is mined, the Agent calculates the winners.
4.  **Payout:** The Agent **Zaps Back** the winners instantly (minus a 1% house fee).

---

## 🚀 How to Play (Frontend)

The frontend visualizes the game and the blockchain state.

### 1. Install & Run
```bash
cd frontend
npm install
npm run dev
```

### 2. Place a Bet
1.  Open `http://localhost:5173`
2.  Connect your Nostr Extension (Alby, nos2x).
3.  Click **Zap HEADS** or **Zap TAILS**.
4.  Your wallet will zap the Agent directly.
5.  Watch the feed to see your bet appear!

---

## 🤖 How to Run the "House" Agent

Become the liquidity provider and earn fees.

### Prerequisites
- A Bitcoin Lightning Node (**LND**)
- A Nostr Profile with a Lightning Address (e.g., `agent@getalby.com`)
- Node.js (v18+)

### 1. Configure
Create a `.env` file:
```ini
# Path to your LND Credentials
LND_CERT_PATH=/Users/yourname/.lnd/tls.cert
LND_MACAROON_PATH=/Users/yourname/.lnd/data/chain/bitcoin/mainnet/admin.macaroon
LND_SOCKET=127.0.0.1:10009
```

### 2. Run
```bash
npm install
node agent.js
```

**The Agent Will:**
- Monitor its Nostr notifications for Zaps.
- Record bets with "HEADS" or "TAILS" comments.
- Automatically pay out winners when a block is mined.

---

## 🛠 Transparency
The winner is determined by the **last character** of the Bitcoin Block Hash.
- **Odd (1, 3, 5, 7, 9, b, d, f)** → HEADS
- **Even (0, 2, 4, 6, 8, a, c, e)** → TAILS

## License
MIT
