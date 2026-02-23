const { exec } = require('child_process');

/**
 * @param {import('openclaw').HookEvent} event
 */
const handler = async (event) => {
  if (event.type !== 'message') {
    return;
  }

  let sound = '/System/Library/Sounds/Ping.aiff'; // default ping

  if (event.action === 'sent') {
    sound = '/System/Library/Sounds/Glass.aiff';
  } else if (event.action === 'received') {
    sound = '/System/Library/Sounds/Ping.aiff';
  } else {
    // Only handle sent/received
    return;
  }

  // Play sound in background
  exec(`afplay ${sound}`, (error) => {
    if (error) {
      console.error(`[notification-bell] Failed to play ${sound}:`, error);
    }
  });
};

module.exports = handler;
