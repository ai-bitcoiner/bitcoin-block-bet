import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { CircleDollarSign, History, ArrowRight, Wallet, Activity } from 'lucide-react';
import './App.css';

const socket = io();

function App() {
  const [lastBlock, setLastBlock] = useState(null);
  const [history, setHistory] = useState([]);
  const [flipping, setFlipping] = useState(false);
  const [betSide, setBetSide] = useState(null); // 'HEADS' or 'TAILS'
  const [betAmount, setBetAmount] = useState(1000); // Sats
  const [status, setStatus] = useState('Wait for Block...');
  const [paymentMethod, setPaymentMethod] = useState('lightning'); // 'lightning' | 'onchain'

  useEffect(() => {
    // Initial fetch
    axios.get('/api/history').then(res => {
      setHistory(res.data);
      if (res.data.length > 0) setLastBlock(res.data[0]);
    });

    // Real-time updates
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

    return () => socket.off('new-block');
  }, [betSide]);

  const placeBet = async (side) => {
    setBetSide(side);
    setStatus(`Bet Placed: ${amount} Sats on ${side} (${paymentMethod})`);
    
    // Simulate API call to setup DLC
    try {
      await axios.post('/api/bet', {
        amount: betAmount,
        side,
        paymentMethod
      });
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
