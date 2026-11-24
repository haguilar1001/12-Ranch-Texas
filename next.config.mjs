/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El lector de PDF (pdf.js) se usa tal cual desde node_modules, sin empaquetarlo.
  serverExternalPackages: ["unpdf"],
  experimental: {
    // Server Actions se usan para la escritura transaccional (ventas, caja).
    serverActions: {
      bodySizeLimit: "10mb", // firmas, soportes y archivos de Configuración → Carga de archivos
    },
  },
};

export default nextConfig;
