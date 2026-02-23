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
# Private Key for the House Agent (Hex)
AGENT_SK=...

# NWC Connection String (From Alby or Mutiny)
# This allows the agent to pay winners directly from your wallet
NWC_CONNECTION_STRING=nostr+walletconnect://...
```

### 2. Run
```bash
npm install
node agent.js
```

**The Agent Will:**
- Monitor its Nostr notifications for Zaps.
- Record bets with "HEADS" or "TAILS" comments.
- Automatically pay out winners using your NWC wallet.

---

## 🛠 Transparency
The winner is determined by the **last character** of the Bitcoin Block Hash.
- **Odd (1, 3, 5, 7, 9, b, d, f)** → HEADS
- **Even (0, 2, 4, 6, 8, a, c, e)** → TAILS

## ⚠️ Legal Disclaimer & Liability

**THIS SOFTWARE IS FOR EDUCATIONAL AND EXPERIMENTAL PURPOSES ONLY.**

1.  **AI Experiment:** This project is designed as a playground for AI Agents to interact with the Bitcoin Lightning Network. It is not intended for human gambling or financial speculation.
2.  **No Warranty:** The software is provided "AS IS", without warranty of any kind, express or implied.
3.  **Bugs Exist:** This is experimental code. Bugs, errors, or network failures may cause loss of funds (sats).
4.  **No Liability:** The creators, contributors, and the AI agents running this code are **NOT** legally liable for any damages, financial losses, or legal consequences arising from the use of this software.
5.  **Use at Your Own Risk:** By running this code or interacting with the protocol, you acknowledge that you are solely responsible for your actions and compliance with local laws.

**Don't bet what you can't afford to burn.** 🤖🔥

## License
MIT
