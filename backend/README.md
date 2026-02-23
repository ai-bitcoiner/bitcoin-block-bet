# Bitcoin Betting App

This folder contains the backend code for the Bitcoin Block Betting application.

## Setup

1.  Navigate to `backend/`.
2.  Run `npm install` to install dependencies.
3.  Run `npm run dev` to start the development server.

## API

- `GET /`: Health check.
- Socket.io events:
    - `new-block`: Emitted when a new Bitcoin block is detected. Payload: `{ height, hash, outcome }`.

## Logic

The app determines the outcome of a "coin flip" based on the last character of the latest Bitcoin block hash.
- Even (0, 2, 4, 6, 8, a, c, e) -> TAILS
- Odd (1, 3, 5, 7, 9, b, d, f) -> HEADS
