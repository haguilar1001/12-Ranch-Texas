import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/auth/sesion";
import AppShell from "@/components/AppShell";
import CambiarClaveForm from "./CambiarClaveForm";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");

  return (
    <AppShell>
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-2xl font-black text-ranch-marron">Mi cuenta</h1>
        <p className="text-sm text-ranch-marron/60">{s.nombre} · {s.rol}</p>
        <p className="text-sm text-ranch-marron/60">Usuario: {s.usuario}</p>
        <CambiarClaveForm />
      </main>
    </AppShell>
  );
}
