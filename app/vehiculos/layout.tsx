import NavBar from "@/components/NavBar";

export default function VehiculosLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar />
      {children}
    </>
  );
}
