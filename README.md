# Move Forward

An offline-first **Store & Forward** React application built with Vite, TypeScript, Dexie.js (IndexedDB), and Oxlint.

## Features

- 📶 **Offline-First Architecture**: Stores actions locally in IndexedDB when network connectivity is unavailable.
- 🔄 **Auto-Sync Engine**: Flushes pending queue actions to the server as soon as connection is restored.
- ⚡ **Vite + React 19 + TypeScript**: Fast HMR, strong typing, and modern frontend tooling.
- 🚀 **Oxlint**: High-performance Rust-powered linter for rapid code analysis.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Local Database**: [Dexie.js](https://dexie.org/) (IndexedDB wrapper)
- **Linter**: [Oxlint](https://oxc.rs/docs/guide/usage/linter.html)
- **Mock Backend**: `json-server` (for local development and offline testing)

---

## Getting Started

### Prerequisites

Ensure you have **Node.js** (v18 or higher) and `npm` installed.

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Mock Server

Run `json-server` using `npx` to serve your local `db.json` on port 3000 to simulate the backend API for store-and-forward flushing:

```bash
npx json-server db.json --port 3000
```

*(Note: Ensure your application API service is configured to target `http://localhost:3000`).*

### 3. Start the Development Server

In a separate terminal window, start the Vite development server:

```bash
npm run dev
```

Open your browser at `http://localhost:5173`.

---

## Available Scripts

| Command / Script | Description |
| :--- | :--- |
| `npm run dev` | Starts the Vite development server |
| `npx json-server db.json --port 3000` | Launches `json-server` on port 3000 using `db.json` |
| `npm run build` | Builds the application for production |
| `npm run preview` | Previews the production build locally |
| `npm run lint` | Runs **Oxlint** to inspect code for errors |

---

## Architecture Overview

```
[ User Action ] ───> [ Dexie.js IndexedDB ] (Store)
                                │
                      (Network Status Check)
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
           [ Online ]                     [ Offline ]
                 │                             │
    (Auto-Sync Queue Worker)             (Persist Queue)
                 │                             │
                 ▼                             ▼
       [ Send to Server ]            (Wait for Reconnect)
```

1. **Store Phase**: Every state modification or API request is intercepted and saved to a persistent IndexedDB queue via Dexie.js.
2. **Forward Phase**: A dedicated network listener monitors `navigator.onLine` and window online events.
3. **Reconciliation**: When an online state is detected, pending actions are processed sequentially (FIFO) and flushed to the backend.

---

## Project Structure

```text
├── src/
│   ├── components/    # React UI components
│   ├── db/            # Dexie.js schema definition & queue helpers
│   ├── hooks/         # Custom React hooks (useOffline, useSync, etc.)
│   ├── services/      # API layer & network sync engine
│   ├── App.tsx        # Main application component
│   └── main.tsx       # Application entry point
├── db.json            # Mock database for json-server
├── index.html
├── oxlint.json        # Oxlint configuration
├── package.json
├── tsconfig.json      # TypeScript root configuration
├── tsconfig.app.json  # Application TypeScript settings
├── tsconfig.node.json # Node/Vite TypeScript settings
└── vite.config.ts     # Vite configuration
```

---

## License

[MIT](LICENSE)