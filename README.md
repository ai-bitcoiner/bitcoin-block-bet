# Bitcoin Block Hash Betting (BBPB)

A "Provably Fair" betting application where users wager on whether the next Bitcoin block hash will be ODD or EVEN.

## 🚀 How to Run Locally

### Prerequisites
- Node.js (v18+)
- NPM

### 1. Install Dependencies
```bash
npm install
cd frontend && npm install && cd ..
```

### 2. Start the App
You need two terminals:

**Terminal 1 (Backend Oracle):**
```bash
node server.js
```

**Terminal 2 (Frontend UI):**
```bash
cd frontend
npm run dev
```

Open http://localhost:5173 to play!

## 📦 How to Push to GitHub

1. Create a new repository on GitHub named `bitcoin-block-bet`.
2. Run these commands in your terminal:

```bash
git remote add origin https://github.com/YOUR_USERNAME/bitcoin-block-bet.git
git branch -M main
git push -u origin main
```

## 🛠 Architecture
- **Backend:** Node.js + Socket.io (Connects to Mempool.space WebSocket)
- **Frontend:** React + Vite (Visualizes the Coin Flip)
- **Transparency:** The app uses the *last character* of the Bitcoin block hash to determine the winner (Odd=Heads, Even=Tails).

## License
MIT
