import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import axios from 'axios';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow frontend access
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// --- Game Logic ---

// Determine if a hash is odd or even based on the last character
// Hex characters: 0-9, a-f
// Even: 0, 2, 4, 6, 8, a(10), c(12), e(14)
// Odd:  1, 3, 5, 7, 9, b(11), d(13), f(15)
function getOutcome(hash: string): 'HEADS' | 'TAILS' {
  const lastChar = hash.slice(-1).toLowerCase();
  const value = parseInt(lastChar, 16);
  return value % 2 === 0 ? 'TAILS' : 'HEADS'; // Even = Tails, Odd = Heads
}

// Polling for new blocks (Simulated for now, replace with actual node connection)
let currentBlockHeight = 0;

async function checkLatestBlock() {
  try {
    const response = await axios.get('https://mempool.space/api/blocks/tip/height');
    const height = response.data;
    
    if (height > currentBlockHeight) {
      if (currentBlockHeight !== 0) { // Don't trigger on initial load
        // New block found!
        const hashResponse = await axios.get(`https://mempool.space/api/block-height/${height}`);
        const hash = hashResponse.data;
        const outcome = getOutcome(hash);
        
        console.log(`New Block: ${height} | Hash: ${hash} | Outcome: ${outcome}`);
        
        io.emit('new-block', {
          height,
          hash,
          outcome
        });
        
        // TODO: Settle bets here
      }
      currentBlockHeight = height;
    }
  } catch (error) {
    console.error("Error fetching block:", error);
  }
}

// Poll every 10 seconds
setInterval(checkLatestBlock, 10000);

// --- API ---

app.get('/', (req, res) => {
  res.send('Bitcoin Block Betting API Running');
});

io.on('connection', (socket) => {
  console.log('Client connected');
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
