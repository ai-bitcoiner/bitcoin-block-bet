# Bitcoin Block Hash Betting Architecture

## Overview
This application allows users to bet on the parity (Odd/Even) of the *next* mined Bitcoin block's hash. The system is designed to be "Provably Fair" by using the Bitcoin blockchain itself as the source of randomness.

## Core Logic: The "Coin Flip"
The outcome is determined by the **last character** of the block hash (Hexadecimal).

### Hexadecimal to Parity Mapping
Bitcoin block hashes are base-16 (0-9, a-f). We convert the last hex digit to decimal to determine parity.

| Hex Digit | Decimal | Parity | Outcome |
| :--- | :--- | :--- | :--- |
| `0, 2, 4, 6, 8` | Even | **Even** | **TAILS** |
| `a` (10) | 10 | **Even** | **TAILS** |
| `c` (12) | 12 | **Even** | **TAILS** |
| `e` (14) | 14 | **Even** | **TAILS** |
| `1, 3, 5, 7, 9` | Odd | **Odd** | **HEADS** |
| `b` (11) | 11 | **Odd** | **HEADS** |
| `d` (13) | 13 | **Odd** | **HEADS** |
| `f` (15) | 15 | **Odd** | **HEADS** |

*Note: In cryptographic hashing, the distribution of the last digit is uniform, making this a true 50/50 probability event.*

## System Architecture

### 1. Backend (Node.js)
- **Block Monitor:** Connects to a public Bitcoin node (or API like Mempool.space) via WebSocket to listen for new blocks in real-time.
- **Betting Engine:**
  - Manages the "Current Block Pool".
  - Locks bets once a block is propagated (or potentially X seconds before expected time, though block times are stochastic).
  - Calculates winners immediately upon block arrival.
- **Wallet Manager (Custodial for MVP):**
  - Generates Lightning invoices for incoming bets.
  - Monitors on-chain addresses for larger bets.
  - Holds funds in a secure hot wallet (for immediate payouts).

### 2. Frontend (React)
- **Visualizer:**
  - A 3D Coin that flips when a block is mined.
  - "Live Feed" of incoming bets (anonymized, showing amount + side).
  - Historical tape of past blocks and winners.
- **User Interface:**
  - "Bet Heads" / "Bet Tails" buttons.
  - Lightning Invoice QR code generator.
  - On-chain deposit address display.

## User Flow
1. **Connect:** User lands on the site. No account required (Lightning) or simple auth.
2. **Bet:** User selects "Heads" (Odd) and enters amount (e.g., 1000 sats).
3. **Pay:**
   - **Lightning:** User scans a generated invoice. Payment is instant.
   - **On-Chain:** User sends to a specific address (requires 1 conf usually, so might apply to *future* blocks).
4. **Wait:** The bet is added to the "Next Block" pool.
5. **Event:** New Bitcoin Block mined! Hash: `0000...a1b2`. Last char: `2` (Even/Tails).
6. **Result:** TAILS wins.
7. **Payout:** The backend calculates the total pool, takes a small fee (optional), and distributes the rest to the "Tails" winners proportional to their bet.

## Transparency Verification
Every game round is verifiable by anyone running a Bitcoin node.
- **Input:** The block hash of Block Height X.
- **Logic:** `parseInt(hash.slice(-1), 16) % 2`.
- **Proof:** The app links directly to a block explorer for the deciding block.

## Security Considerations
- **Hot Wallet Risk:** Since this is a custodial MVP, the server holds funds. To mitigate risk, we implement a "Sweep to Cold Storage" policy for excess funds.
- **Flash Crashes/Reorgs:** The system waits for 1-2 confirmations for large on-chain payouts, but Lightning is settled instantly.
