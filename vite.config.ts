import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// สตักเดียวกับ ssbgroup-platform (React 19 + Vite + Tailwind v4)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // worktree ชั่วคราวใต้ .claude มีสำเนา tests/ ทั้งชุด — ถ้าไม่ตัดออก vitest จะนับซ้ำและรายงานจำนวนเทสเกินจริง
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
})
