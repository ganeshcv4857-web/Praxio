import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Keep paths as given: on some Windows setups realpath maps the project into a
  // virtualised AppData location the dev server can't read.
  resolve: { preserveSymlinks: true },
});
