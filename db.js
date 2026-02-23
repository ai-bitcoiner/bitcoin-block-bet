const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'store.json');

const defaultData = {
  lastProcessedBlock: 0,
  lastZapTimestamp: Math.floor(Date.now() / 1000) - 86400, // Default 24h ago
  pendingBets: [] // { pubkey, amount, side, timestamp, id }
};

function load() {
  if (!fs.existsSync(DB_FILE)) return defaultData;
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return defaultData;
  }
}

function save(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

module.exports = { load, save };
