# Move Forward

An offline-first **Store & Forward** React application built with Vite, TypeScript, Dexie.js (IndexedDB), and Oxlint.

## Features

- 📶 **Offline-First Architecture**: Stores actions locally in IndexedDB when network connectivity is unavailable.
- 🔄 **Auto-Sync Engine**: Flushes pending queue actions to the server as soon as connection is restored.
- ⚡ **Vite + React 19 + TypeScript**: Fast HMR and build performance.
- 🚀 **Oxlint**: High-performance linter powered by Rust.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Local Database**: [Dexie.js](https://dexie.org/) (IndexedDB wrapper)
- **Linter**: Oxlint
- **Mock Backend**: `json-server` (for local development testing)

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
