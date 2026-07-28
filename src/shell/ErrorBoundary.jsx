import { Component } from "react";

/* กันจอขาวทั้งแอป — โมดูลไหน crash หรือโหลด chunk ไม่ได้ ให้พังแค่พื้นที่เนื้อหา
   (shell/sidebar อยู่ต่อ) พร้อมข้อความ + ปุ่มโหลดใหม่. AppShell ใส่ key=pathname
   ให้ boundary รีเซ็ตเองเมื่อเปลี่ยนหน้า — หน้าอื่นที่ไม่พังยังใช้ได้ปกติ. */

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // ให้เห็นใน console เสมอ (จอไม่ขาวแล้ว แต่ยังต้อง debug ได้)
    console.error("[module error]", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const msg = String(this.state.error?.message || this.state.error);
    const isChunk = /dynamically imported module|Importing a module script failed|Loading chunk|error loading/i.test(msg);
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center">
        <div className="mb-1.5 text-sm font-medium text-zinc-100">
          {isChunk ? "ระบบมีเวอร์ชันใหม่" : "หน้านี้มีปัญหา"}
        </div>
        <p className="mb-4 break-words text-sm leading-relaxed text-zinc-400">
          {isChunk ? "กดโหลดใหม่เพื่อใช้เวอร์ชันล่าสุด" : msg}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          โหลดใหม่
        </button>
      </div>
    );
  }
}
