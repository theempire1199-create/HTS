import { defineConfig } from 'vite'

const rootUrl = new URL('.', import.meta.url)

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: new URL('./index.html', rootUrl).pathname,
        admin: new URL('./admin-panel/index.html', rootUrl).pathname,
      },
    },
  },
})
