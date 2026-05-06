"use client";

export function LogoutButton() {
  async function logout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }
  return (
    <button
      type="button"
      onClick={logout}
      className="rounded-full border border-line bg-bone-soft px-3 py-1 text-[11px] hover:border-accent"
    >
      Salir
    </button>
  );
}
