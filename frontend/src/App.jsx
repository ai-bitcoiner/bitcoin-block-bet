import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { CircleDollarSign, History, ArrowRight, Wallet, Activity, Globe, Zap, XCircle, Bot } from 'lucide-react';
import { SimplePool, generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { QRCodeSVG } from 'qrcode.react';
import './App.css';

// Decentralized Architecture
const MEMPOOL_WS = 'wss://mempool.space/api/v1/ws';
const RELAYS = ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://nos.lol'];
const APP_TAG = 'bitcoin-block-bet-v1';
const sk = generateSecretKey(); // Ephemeral private key for this session
const pk = getPublicKey(sk);
const pool = new SimplePool();

function App() {
  const [lastBlock, setLastBlock] = useState(null);
  const [history, setHistory] = useState([]);
  const [flipping, setFlipping] = useState(false);
  const [betSide, setBetSide] = useState(null); 
  const [betAmount, setBetAmount] = useState(1000); 
  const [status, setStatus] = useState('Wait for Block...');
  const [globalBets, setGlobalBets] = useState([]);
  const [activeInvoice, setActiveInvoice] = useState(null); 
  const wsRef = useRef(null);

  // 1. Connect to Mempool.space WebSocket (Directly)
  useEffect(() => {
    // Initial fetch (REST API)
    axios.get('https://mempool.space/api/v1/blocks/tip/height').then(async (res) => {
      const height = res.data;
      // Fetch last 10 blocks for history
      try {
        const blocksRes = await axios.get(`https://mempool.space/api/v1/blocks/${height}`);
        const formattedHistory = blocksRes.data.slice(0, 10).map(b => getParity(b));
        setHistory(formattedHistory);
        setLastBlock(formattedHistory[0]);
      } catch (e) { console.error(e); }
    });

    const connectWS = () => {
      const ws = new WebSocket(MEMPOOL_WS);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to Mempool.space');
        ws.send(JSON.stringify({ action: 'want', data: ['blocks'] }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.block) {
            handleNewBlock(message.block);
          }
        } catch (e) { console.error(e); }
      };

      ws.onclose = () => setTimeout(connectWS, 5000); // Reconnect
    };

    connectWS();
    return () => wsRef.current?.close();
  }, []);

  // Helper: Determine Parity
  const getParity = (block) => {
    const lastChar = block.id.slice(-1);
    const decimalValue = parseInt(lastChar, 16);
    const isEven = decimalValue % 2 === 0;
    return {
      height: block.height,
      hash: block.id,
      lastChar,
      winner: isEven ? 'TAILS' : 'HEADS',
      parity: isEven ? 'EVEN' : 'ODD'
    };
  };

  const handleNewBlock = (rawBlock) => {
    const block = getParity(rawBlock);
    console.log('New Block:', block);
    setFlipping(true);
    setStatus(`BLOCK ${block.height} MINED!`);
    
    setTimeout(() => {
      setFlipping(false);
      setLastBlock(block);
      setHistory(prev => [block, ...prev].slice(0, 10));
      
      if (betSide && block.winner === betSide) {
        setStatus('YOU WON! 🎉 (Waiting for AI Agent Payout...)');
      } else if (betSide) {
        setStatus('YOU LOST. 😢 (Better luck next block)');
      } else {
        setStatus('Round Complete.');
      }
      setBetSide(null);
    }, 3000);
  };

  // 2. Connect to Nostr Relays (P2P Betting Layer)
  useEffect(() => {
    const sub = pool.subscribeMany(RELAYS, [
      {
        kinds: [1],
        '#t': [APP_TAG],
        since: Math.floor(Date.now() / 1000) - 300 
      }
    ], {
      onevent(event) {
        try {
          const data = JSON.parse(event.content);
          
          // Handle Global Bets Feed
          if (data.type === 'bet_placed') {
            setGlobalBets(prev => {
              if (prev.find(b => b.id === event.id)) return prev;
              return [{...data, id: event.id, pubkey: event.pubkey}, ...prev].slice(0, 20);
            });
          }

          // Handle AI Agent Responses (targeted at me)
          if (data.type === 'invoice_offer' && data.target_pubkey === pk) {
             console.log("AI Agent offer received!", data);
             setActiveInvoice(data.invoice);
             setStatus(`AI Agent accepted! Scan to pay.`);
          }
          
          if (data.type === 'payment_confirmed' && data.target_pubkey === pk) {
             setActiveInvoice(null);
             setStatus(`PAID! 🎉 Bet locked: ${data.amount} sats on ${data.side}`);
          }

        } catch (e) { }
      }
    });

    return () => sub.close();
  }, []);

  const placeBet = async (side) => {
    setBetSide(side);
    setStatus(`Broadcasting bet request for ${betAmount} sats...`);
    
    // Publish "Bet Request" to Nostr
    // AI Agents listening will pick this up and reply with an invoice
    try {
      const eventTemplate = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['t', APP_TAG]],
        content: JSON.stringify({
          type: 'bet_request',
          side,
          amount: betAmount,
          pubkey: pk, // My pubkey so agent can reply
          timestamp: Date.now()
        }),
      };
      
      const signedEvent = finalizeEvent(eventTemplate, sk);
      await Promise.any(pool.publish(RELAYS, signedEvent));
      console.log("Published bet request to Nostr");

      // Optimistic update for UI (showing my own bet)
      setGlobalBets(prev => [{
        type: 'bet_placed',
        side,
        amount: betAmount,
        pubkey: pk,
        id: signedEvent.id
      }, ...prev]);
      
    } catch (e) {
      console.error("Nostr publish error", e);
      setStatus("Failed to broadcast bet.");
    }
  };

  return (
    <div className="app-container">
      <AnimatePresence>
      {activeInvoice && (
        <motion.div 
          className="invoice-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="invoice-modal">
            <div className="modal-header">
              <h3><Bot size={20} /> AI Agent Accepted! ⚡</h3>
              <button onClick={() => setActiveInvoice(null)}><XCircle size={24} /></button>
            </div>
            <div className="qr-container">
              <QRCodeSVG value={activeInvoice} size={256} level={"L"} includeMargin={true} />
            </div>
            <div className="invoice-text">
              <p>Pay {betAmount} sats to lock bet</p>
              <textarea readOnly value={activeInvoice} onClick={(e) => e.target.select()} />
            </div>
            <div className="status-spinner">Waiting for payment...</div>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      <header className="header">
        <h1><CircleDollarSign size={32} /> BlockHash Bet <span className="beta-tag">P2P</span></h1>
        <div className="status-badge">
          <Activity size={16} /> Live: Mempool.space
        </div>
      </header>

      <main className="main-content">
        {/* Coin Flip Area */}
        <section className="coin-section">
          <div className={`coin-container ${flipping ? 'flipping' : ''}`}>
            <div className={`coin ${lastBlock?.winner === 'HEADS' ? 'heads' : 'tails'}`}>
              <div className="side front">HEADS (Odd)</div>
              <div className="side back">TAILS (Even)</div>
            </div>
          </div>
          <div className="result-display">
            {flipping ? "MINING..." : lastBlock ? `${lastBlock.winner} (${lastBlock.parity})` : "WAITING..."}
          </div>
          <div className="hash-display">
            Block #{lastBlock?.height} Hash: ...<span className="highlight">{lastBlock?.lastChar}</span>
          </div>
          <div className="status-message">{status}</div>
        </section>

        {/* Betting Controls */}
        <section className="betting-controls">
          <h2>Request Bet (Vs. Network)</h2>
          
          <div className="amount-input">
            <label>Amount (Sats)</label>
            <input 
              type="number" 
              value={betAmount} 
              onChange={(e) => setBetAmount(Number(e.target.value))}
            />
          </div>

          <div className="bet-buttons">
            <button 
              className="bet-btn heads" 
              onClick={() => placeBet('HEADS')}
              disabled={flipping || betSide}
            >
              BET HEADS (ODD)
            </button>
            <button 
              className="bet-btn tails" 
              onClick={() => placeBet('TAILS')}
              disabled={flipping || betSide}
            >
              BET TAILS (EVEN)
            </button>
          </div>
          <div className="p2p-note">
            <Globe size={14} /> Bets are broadcast to Nostr. An AI Agent must be online to accept.
          </div>
        </section>

        {/* Live Nostr Feed */}
        <section className="feed-section">
          <h3><Globe size={20} /> Live Global Bets (Nostr)</h3>
          <div className="feed-list">
            {globalBets.length === 0 ? <div className="empty-feed">Listening for bets on Nostr relays...</div> : null}
            {globalBets.map((bet) => (
              <div key={bet.id} className="feed-item">
                <div className="feed-avatar">👤</div>
                <div className="feed-content">
                  <span className="feed-user">{bet.pubkey.slice(0, 8)}...</span>
                  {bet.type === 'bet_request' ? ' wants to bet ' : ' bet '}
                  <span className="feed-amount">{bet.amount} sats</span> on 
                  <span className={`feed-side ${bet.side?.toLowerCase() || 'heads'}`}> {bet.side}</span>
                </div>
                <Zap size={12} className="feed-icon" />
              </div>
            ))}
          </div>
        </section>

        {/* History Tape */}
        <section className="history-section">
          <h3><History size={20} /> Recent Blocks</h3>
          <div className="history-list">
            {history.map((block) => (
              <div key={block.height} className={`history-item ${block.winner.toLowerCase()}`}>
                <span className="block-height">#{block.height}</span>
                <span className="block-hash">...{block.lastChar}</span>
                <span className="block-winner">{block.winner}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
