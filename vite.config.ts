import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// สตักเดียวกับ ssbgroup-platform (React 19 + Vite + Tailwind v4)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // เครื่องนี้มี dev server ของอีกโปรเจกต์อยู่ที่ 5173 แล้ว — รับพอร์ตจาก PORT ได้ ไม่งั้นใช้ค่าเริ่มต้นของ vite
  server: { port: Number(process.env.PORT) || undefined },
  test: {
    // worktree ชั่วคราวใต้ .claude มีสำเนา tests/ ทั้งชุด — ถ้าไม่ตัดออก vitest จะนับซ้ำและรายงานจำนวนเทสเกินจริง
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
})
