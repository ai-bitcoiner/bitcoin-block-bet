import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { CircleDollarSign, History, ArrowRight, Wallet, Activity, Globe, Zap } from 'lucide-react';
import { SimplePool, generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import './App.css';

const socket = io();

// Nostr Setup
const pool = new SimplePool();
const RELAYS = ['wss://relay.damus.io', 'wss://relay.primal.net'];
const APP_TAG = 'bitcoin-block-bet-v1';
const sk = generateSecretKey(); // Ephemeral private key for this session
const pk = getPublicKey(sk);

function App() {
  const [lastBlock, setLastBlock] = useState(null);
  const [history, setHistory] = useState([]);
  const [flipping, setFlipping] = useState(false);
  const [betSide, setBetSide] = useState(null); // 'HEADS' or 'TAILS'
  const [betAmount, setBetAmount] = useState(1000); // Sats
  const [status, setStatus] = useState('Wait for Block...');
  const [paymentMethod, setPaymentMethod] = useState('lightning'); // 'lightning' | 'onchain'
  const [globalBets, setGlobalBets] = useState([]);

  useEffect(() => {
    // Initial fetch
    axios.get('/api/history').then(res => {
      setHistory(res.data);
      if (res.data.length > 0) setLastBlock(res.data[0]);
    });

    // Real-time block updates
    socket.on('new-block', (block) => {
      console.log('New Block:', block);
      setFlipping(true);
      setStatus(`BLOCK ${block.height} MINED!`);
      
      // Simulate flip duration
      setTimeout(() => {
        setFlipping(false);
        setLastBlock(block);
        setHistory(prev => [block, ...prev].slice(0, 10));
        
        // Determine win/loss
        if (betSide && block.winner === betSide) {
          setStatus('YOU WON! 🎉 (Payout sent via DLC)');
        } else if (betSide) {
          setStatus('YOU LOST. 😢 (Better luck next block)');
        } else {
          setStatus('Round Complete.');
        }
        setBetSide(null); // Reset bet
      }, 3000);
    });

    // Nostr Subscription
    const sub = pool.subscribeMany(RELAYS, [
      {
        kinds: [1],
        '#t': [APP_TAG],
        since: Math.floor(Date.now() / 1000) - 300 // Last 5 mins
      }
    ], {
      onevent(event) {
        try {
          const betData = JSON.parse(event.content);
          setGlobalBets(prev => {
            // deduplicate by event ID
            if (prev.find(b => b.id === event.id)) return prev;
            return [{...betData, id: event.id, pubkey: event.pubkey}, ...prev].slice(0, 20);
          });
        } catch (e) {
          // ignore malformed events
        }
      }
    });

    return () => {
      socket.off('new-block');
      sub.close();
    };
  }, [betSide]);

  const placeBet = async (side) => {
    setBetSide(side);
    setStatus(`Bet Placed: ${betAmount} Sats on ${side} (${paymentMethod})`);
    
    // Simulate API call to setup DLC
    try {
      await axios.post('/api/bet', {
        amount: betAmount,
        side,
        paymentMethod
      });

      // Broadcast to Nostr Network
      const eventTemplate = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['t', APP_TAG]],
        content: JSON.stringify({
          side,
          amount: betAmount,
          method: paymentMethod,
          timestamp: Date.now()
        }),
      };
      
      const signedEvent = finalizeEvent(eventTemplate, sk);
      await Promise.any(pool.publish(RELAYS, signedEvent));
      console.log("Published bet to Nostr relays");
      
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1><CircleDollarSign size={32} /> BlockHash Bet</h1>
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
          <h2>Place Your Bet (Next Block)</h2>
          
          <div className="payment-toggle">
            <button 
              className={paymentMethod === 'lightning' ? 'active' : ''}
              onClick={() => setPaymentMethod('lightning')}
            >⚡ Lightning</button>
            <button 
              className={paymentMethod === 'onchain' ? 'active' : ''}
              onClick={() => setPaymentMethod('onchain')}
            >🔗 On-Chain</button>
          </div>

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
                  bet <span className="feed-amount">{bet.amount} sats</span> on 
                  <span className={`feed-side ${bet.side?.toLowerCase() || 'heads'}`}> {bet.side}</span>
                </div>
                {bet.method === 'lightning' && <Zap size={12} className="feed-icon" />}
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
