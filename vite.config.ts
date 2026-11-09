import { defineConfig } from 'vite';

const base = process.env.VITE_BASE_PATH?.replace(/^\/+|\/+$/g, '');

export default defineConfig({
  base: base ? `/${base}/` : '/',
});
