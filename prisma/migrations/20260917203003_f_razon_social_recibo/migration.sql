-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "nit" TEXT,
ADD COLUMN     "razon_social" TEXT;

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "comprador_nit" TEXT,
ADD COLUMN     "comprador_razon_social" TEXT;
