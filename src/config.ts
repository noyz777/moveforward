// Single source of truth for the backend location.
// Override with VITE_API_URL in a .env file (e.g. VITE_API_URL=http://192.168.1.10:3000).
export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
export const ITEMS_URL = `${API_URL}/syncData`;
