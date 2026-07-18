import { resolve } from 'path'
import { config as loadEnv } from 'dotenv'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

loadEnv()

// Credenciales que no deben vivir como texto en el código versionado (ver docs/google-oauth-setup.md):
// se toman de variables de entorno en el momento del build (.env local, o secrets de CI en release.yml)
// y quedan reemplazadas como literales en el bundle final del proceso main.
const BUILD_TIME_ENV = {
  'process.env.GOOGLE_CLIENT_ID': JSON.stringify(process.env.GOOGLE_CLIENT_ID ?? ''),
  'process.env.GOOGLE_CLIENT_SECRET': JSON.stringify(process.env.GOOGLE_CLIENT_SECRET ?? '')
}

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    define: BUILD_TIME_ENV,
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
