// Copia el WASM de ZXing (lector QR de respaldo para /escaneo) a public/vendor,
// para servirlo desde la propia app en vez del CDN de jsDelivr.
// Corre en postinstall y en build, así siempre coincide con la versión instalada de zxing-wasm.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const origen = require.resolve("zxing-wasm/reader/zxing_reader.wasm");
const destino = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "vendor", "zxing_reader.wasm");

mkdirSync(dirname(destino), { recursive: true });
copyFileSync(origen, destino);
console.log(`zxing_reader.wasm → public/vendor`);
