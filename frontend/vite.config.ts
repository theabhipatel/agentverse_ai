import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import path from "path"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    // The voice activity detector loads its model, audio worklet and ONNX runtime
    // at run time by URL, so they are served as plain files under /vad/.
    viteStaticCopy({
      targets: [
        'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js',
        'node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx',
        'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
        'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
      ].map((src) => ({ src, dest: 'vad', rename: { stripBase: true } })),
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Keeps the frontend and API on one origin in dev, so the httpOnly
      // refresh cookie and CORS are never a problem whatever port Vite picks.
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
})
