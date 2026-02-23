const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for dev
    methods: ["GET", "POST"]
  }
});

// Store history in memory (in a real app, use a DB)
let blockHistory = [];
let currentHeight = 0;

// Helper: Determine Parity (Odd/Even) from Hash
function getParity(hash) {
  const lastChar = hash.slice(-1);
  const decimalValue = parseInt(lastChar, 16);
  const isEven = decimalValue % 2 === 0;
  
  // 0, 2, 4, 6, 8, a(10), c(12), e(14) -> Even (Tails)
  // 1, 3, 5, 7, 9, b(11), d(13), f(15) -> Odd (Heads)
  
  return {
    hash: hash,
    lastChar: lastChar,
    decimal: decimalValue,
    parity: isEven ? 'EVEN' : 'ODD',
    winner: isEven ? 'TAILS' : 'HEADS'
  };
}

// Import Secure Lightning Service
const lightning = require('./services/lightning');

// Connect to Mempool.space WebSocket for Live Blocks
function connectToMempool() {
  const ws = new WebSocket('wss://mempool.space/api/v1/ws');

  ws.on('open', () => {
    console.log('Connected to Mempool.space WebSocket');
    ws.send(JSON.stringify({ action: 'want', data: ['blocks'] }));
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      if (message.block) {
        const block = message.block;
        
        // Avoid duplicate processing
        if (block.height <= currentHeight) return;
        currentHeight = block.height;

        const outcome = getParity(block.id);
        
        const eventData = {
          height: block.height,
          timestamp: block.timestamp,
          ...outcome
        };

        console.log(`NEW BLOCK MINED! Height: ${block.height}, Hash: ...${outcome.lastChar}, Winner: ${outcome.winner}`);

        // Add to history
        blockHistory.unshift(eventData);
        if (blockHistory.length > 50) blockHistory.pop();

        // Broadcast to frontend
        io.emit('new-block', eventData);
      }
    } catch (e) {
      console.error('Error parsing WebSocket message:', e);
    }
  });

  ws.on('close', () => {
    console.log('Mempool.space WebSocket disconnected. Reconnecting in 5s...');
    setTimeout(connectToMempool, 5000);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    ws.close();
  });
}

// API Endpoints
app.get('/api/history', (req, res) => {
  res.json(blockHistory);
});

// Process Bet (Real or Mock)
app.post('/api/bet', async (req, res) => {
  const { amount, side, paymentMethod } = req.body;
  
  // Real Lightning Payment
  if (paymentMethod === 'lightning' && lightning.isReady) {
    try {
      const invoice = await lightning.createBetInvoice(amount, `Bet on ${side} (Block Parity)`);
      
      // Monitor this invoice for payment
      lightning.monitorInvoice(invoice.id, (paidInvoice) => {
        console.log(`✅ Paid: ${paidInvoice.tokens} sats for ${side}`);
        io.emit('bet-paid', { id: invoice.id, side, amount: paidInvoice.tokens });
      });

      return res.json({
        success: true,
        message: `Invoice generated for ${amount} sats`,
        invoice: invoice.request, // Real BOLT11 Invoice
        id: invoice.id,
        status: 'pending_payment'
      });
    } catch (e) {
      console.error("Lightning Error:", e);
      return res.status(500).json({ error: "Lightning Node Error" });
    }
  }

  // Mock Fallback (for testing/demo)
  const mockInvoice = paymentMethod === 'lightning' 
    ? `lnbc${amount}n1...MOCK_INVOICE_FOR_TESTING` 
    : `bc1q...MOCK_ADDRESS`;

  res.json({
    success: true,
    message: `(MOCK) Bet placed on ${side} for ${amount} sats`,
    invoice: mockInvoice,
    status: 'pending_confirmation'
  });
});

// Start Server
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Backend Server running on port ${PORT}`);
  connectToMempool();
});
