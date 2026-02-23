import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { CircleDollarSign, History, ArrowRight, Wallet, Activity, Globe, Zap, XCircle, Bot, HelpCircle, Info } from 'lucide-react';
import { SimplePool, generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { QRCodeSVG } from 'qrcode.react';
import './App.css';

// Decentralized Architecture
const MEMPOOL_WS = 'wss://mempool.space/api/v1/ws';
const RELAYS = ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://nos.lol'];
const APP_TAG = 'bitcoin-block-bet-v1';
const HOUSE_LUD16 = 'waterheartwarming611802@getalby.com'; 
const sk = generateSecretKey(); 
const pk = getPublicKey(sk);
const pool = new SimplePool();

function App() {
  const [lastBlock, setLastBlock] = useState(null);
  const [history, setHistory] = useState([]);
  const [flipping, setFlipping] = useState(false);
  const [betSide, setBetSide] = useState(null); 
  const [betAmount, setBetAmount] = useState(1000); 
  const [status, setStatus] = useState('Waiting for next block...');
  const [globalBets, setGlobalBets] = useState([]);
  const [activeInvoice, setActiveInvoice] = useState(null); 
  const [showHelp, setShowHelp] = useState(false);
  const wsRef = useRef(null);

  // 1. Connect to Mempool.space WebSocket
  useEffect(() => {
    // Initial fetch
    axios.get('https://mempool.space/api/v1/blocks/tip/height').then(async (res) => {
      const height = res.data;
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
      ws.onopen = () => ws.send(JSON.stringify({ action: 'want', data: ['blocks'] }));
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.block) handleNewBlock(message.block);
        } catch (e) {}
      };
      ws.onclose = () => setTimeout(connectWS, 5000);
    };
    connectWS();
    return () => wsRef.current?.close();
  }, []);

  const getParity = (block) => {
    const lastChar = block.id.slice(-1);
    const decimalValue = parseInt(lastChar, 16);
    const isEven = decimalValue % 2 === 0;
    return {
      height: block.height,
      hash: block.id,
      lastChar,
      decimalValue, // For transparency
      winner: isEven ? 'TAILS' : 'HEADS',
      parity: isEven ? 'EVEN' : 'ODD',
      timestamp: block.timestamp
    };
  };

  const handleNewBlock = (rawBlock) => {
    const block = getParity(rawBlock);
    setFlipping(true);
    setStatus(`BLOCK ${block.height} MINED!`);
    
    setTimeout(() => {
      setFlipping(false);
      setLastBlock(block);
      setHistory(prev => [block, ...prev].slice(0, 10));
      if (betSide && block.winner === betSide) {
        setStatus('YOU WON! 🎉 (Payout via Lightning)');
      } else if (betSide) {
        setStatus('YOU LOST. 😢');
      } else {
        setStatus('Round Complete.');
      }
      setBetSide(null);
    }, 3000);
  };

  // 2. Connect to Nostr Relays
  useEffect(() => {
    const sub = pool.subscribeMany(RELAYS, [
      {
        kinds: [1, 9735], // Text notes and Zaps
        '#t': [APP_TAG],
        since: Math.floor(Date.now() / 1000) - 300 
      }
    ], {
      onevent(event) {
        try {
          // Handle Zaps (Real Bets)
          if (event.kind === 9735) {
             const descTag = event.tags.find(t => t[0] === 'description')?.[1];
             if (descTag) {
                const req = JSON.parse(descTag);
                const side = req.content; // "HEADS" or "TAILS"
                if (side === 'HEADS' || side === 'TAILS') {
                   addFeedItem({
                     type: 'zap',
                     side,
                     amount: '???', // Real amount requires decoding bolt11
                     pubkey: req.pubkey,
                     id: event.id
                   });
                }
             }
          }
          // Handle Text Bets/Requests
          else {
            const data = JSON.parse(event.content);
            if (data.type === 'bet_request' || data.type === 'bet_placed') {
               addFeedItem({ ...data, id: event.id, pubkey: event.pubkey });
            }
            if (data.type === 'invoice_offer' && data.target_pubkey === pk) {
               setActiveInvoice(data.invoice);
               setStatus(`AI Agent accepted! Scan to pay.`);
            }
          }
        } catch (e) { }
      }
    });
    return () => sub.close();
  }, []);

  const addFeedItem = (item) => {
    setGlobalBets(prev => {
      if (prev.find(b => b.id === item.id)) return prev;
      return [item, ...prev].slice(0, 20);
    });
  };

  const placeBet = async (side) => {
    setBetSide(side);
    setStatus(`Broadcasting bet request...`);
    
    // Broadcast intent to Nostr (AI Agents listen to this)
    const eventTemplate = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['t', APP_TAG]],
      content: JSON.stringify({
        type: 'bet_request',
        side,
        amount: betAmount,
        pubkey: pk,
        timestamp: Date.now()
      }),
    };
    try {
      const signedEvent = finalizeEvent(eventTemplate, sk);
      await Promise.any(pool.publish(RELAYS, signedEvent));
      addFeedItem({
        type: 'bet_request',
        side,
        amount: betAmount,
        pubkey: pk,
        id: signedEvent.id
      });
    } catch (e) { console.error(e); }
  };

  return (
    <div className="app-container">
      {/* Help Modal */}
      <AnimatePresence>
        {showHelp && (
          <motion.div className="invoice-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
            <div className="invoice-modal help-modal">
              <div className="modal-header">
                <h3>How to Play ⚡</h3>
                <button onClick={() => setShowHelp(false)}><XCircle /></button>
              </div>
              <div className="help-content">
                <p><strong>1. Decentralized:</strong> No accounts. No servers.</p>
                <p><strong>2. The Oracle:</strong> The <strong>last character</strong> of the next Bitcoin Block Hash determines the winner.</p>
                <ul className="rules-list">
                  <li><span className="heads">ODD (1,3,5,7,9,b,d,f)</span> = <strong>HEADS</strong></li>
                  <li><span className="tails">EVEN (0,2,4,6,8,a,c,e)</span> = <strong>TAILS</strong></li>
                </ul>
                <p><strong>3. How to Bet:</strong></p>
                <div className="zap-instruction">
                  Zap <span className="highlight">{HOUSE_LUD16}</span>
                  <br/>with comment <strong>HEADS</strong> or <strong>TAILS</strong>
                </div>
                <p className="small">Or use an AI Agent to play for you!</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invoice Modal */}
      <AnimatePresence>
      {activeInvoice && (
        <motion.div className="invoice-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
          <div className="invoice-modal">
            <div className="modal-header">
              <h3>Pay to Lock Bet ⚡</h3>
              <button onClick={() => setActiveInvoice(null)}><XCircle /></button>
            </div>
            <div className="qr-container">
              <QRCodeSVG value={activeInvoice} size={256} level={"L"} includeMargin={true} />
            </div>
            <div className="invoice-text">
              <p>Scan with Alby / Zeus / WoS</p>
              <textarea readOnly value={activeInvoice} onClick={(e) => e.target.select()} />
            </div>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      <header className="header">
        <h1><CircleDollarSign size={32} /> BlockHash Bet <span className="beta-tag">P2P</span></h1>
        <div className="header-controls">
          <div className="status-badge"><Activity size={14} /> Live</div>
          <button className="help-btn" onClick={() => setShowHelp(true)}><HelpCircle size={20} /></button>
        </div>
      </header>

      <main className="main-content">
        {/* Coin Flip */}
        <section className="coin-section">
          <div className={`coin-container ${flipping ? 'flipping' : ''}`}>
            <div className={`coin ${lastBlock?.winner === 'HEADS' ? 'heads' : 'tails'}`}>
              <div className="side front">HEADS</div>
              <div className="side back">TAILS</div>
            </div>
          </div>
          <div className="result-display">
            {flipping ? "MINING..." : lastBlock ? `${lastBlock.winner}` : "WAITING..."}
          </div>
          <div className="hash-display">
            Block <a href={`https://mempool.space/block/${lastBlock?.hash}`} target="_blank" className="block-link">#{lastBlock?.height}</a>
            <br/>
            Hash ends in: <span className="highlight-char">{lastBlock?.lastChar}</span>
            <span className="parity-badge">{lastBlock?.parity}</span>
          </div>
          <div className="status-message">{status}</div>
        </section>

        {/* Betting Controls */}
        <section className="betting-controls">
          <div className="amount-input">
            <label>Wager (Sats)</label>
            <input type="number" value={betAmount} onChange={(e) => setBetAmount(Number(e.target.value))} />
          </div>
          <div className="bet-buttons">
            <button className="bet-btn heads" onClick={() => placeBet('HEADS')} disabled={flipping || betSide}>
              BET HEADS (ODD)
            </button>
            <button className="bet-btn tails" onClick={() => placeBet('TAILS')} disabled={flipping || betSide}>
              BET TAILS (EVEN)
            </button>
          </div>
          <div className="p2p-note">
            <Globe size={12} /> Broadcasts to Nostr. <span className="link" onClick={() => setShowHelp(true)}>How it works?</span>
          </div>
        </section>

        {/* Feeds Grid */}
        <div className="feeds-grid">
          {/* Live Bets */}
          <section className="feed-section">
            <h3><Zap size={18} /> Live Bets</h3>
            <div className="feed-list">
              {globalBets.length === 0 && <div className="empty-feed">Waiting for bets...</div>}
              {globalBets.map((bet) => (
                <div key={bet.id} className="feed-item">
                  <div className={`feed-avatar ${bet.type === 'zap' ? 'zap-glow' : ''}`}>
                    {bet.type === 'zap' ? '⚡' : '👤'}
                  </div>
                  <div className="feed-content">
                    <span className="feed-user">{bet.pubkey.slice(0, 6)}</span>
                    {bet.type === 'zap' ? ' zapped ' : ' wants '}
                    <span className="feed-amount">{bet.amount}</span> on 
                    <span className={`feed-side ${bet.side?.toLowerCase() || 'heads'}`}> {bet.side}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* History */}
          <section className="history-section">
            <h3><History size={18} /> History</h3>
            <div className="history-list">
              {history.map((block) => (
                <div key={block.height} className={`history-item ${block.winner.toLowerCase()}`}>
                  <span className="block-height">#{block.height}</span>
                  <div className="block-meta">
                    <span className="hash-char">{block.lastChar}</span>
                    <span className="parity-label">{block.parity}</span>
                  </div>
                  <span className="block-winner">{block.winner}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
