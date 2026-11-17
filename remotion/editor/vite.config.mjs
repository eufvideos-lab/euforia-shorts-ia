import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
// Editor da Euforia: build estático (dist/) que roda em qualquer hospedagem; o projeto e as mídias vêm por URL.
export default defineConfig({
  root: aqui,
  base: './',
  plugins: [react()],
  build: { outDir: path.join(aqui, 'dist'), emptyOutDir: true, chunkSizeWarningLimit: 4000 },
});
