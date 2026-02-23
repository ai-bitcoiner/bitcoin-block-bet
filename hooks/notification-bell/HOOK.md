---
name: notification-bell
description: "Plays sounds for message receipt and send"
metadata:
  openclaw:
    emoji: "🔔"
    events: ["message:received", "message:sent"]
    requires:
      bins: ["afplay"]
      os: ["darwin"]
---

# Notification Bell

Plays system sounds for agent activity:
- `Ping.aiff` when a message is received (processing starts)
- `Glass.aiff` when a message is sent (processing completes)

## Configuration

No configuration needed.
