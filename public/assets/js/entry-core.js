// Pasaporte de Boda — Nati & Leo
// Lógica reutilizable de "entrada por código", sin tocar el DOM. La usan
// tanto la puerta de invitación (invitacion/index.html vía entry.js) como el
// widget de código en la nueva Home (public/index.html vía home.js).
//
// Nota de diseño: esta función NO decide la URL de redirección — devuelve el
// código validado y deja que cada caller arme su propia ruta relativa, porque
// la ruta correcta depende de dónde vive el caller (misma carpeta que
// pasaporte.html vs. un nivel arriba en invitacion/). Así se evita un
// parámetro `basePath` innecesario y cada página queda dueña de su propio
// routing relativo.

import { supabase, getSavedCode, saveCode } from "./supabase-client.js";

/** Normaliza un código crudo de invitado: recorta espacios y pasa a mayúsculas. */
export function normalizeCode(rawCode) {
  return (rawCode || "").trim().toUpperCase();
}

/**
 * Valida un código de invitado contra la RPC `get_guest_by_code`.
 * Devuelve `{ ok: true, code, guest }` si el código existe, o
 * `{ ok: false, code }` si está vacío, no existe, o hubo un error de red.
 */
export async function lookupGuestByCode(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, code };

  const { data, error } = await supabase.rpc("get_guest_by_code", { p_code: code });
  if (error || !data || data.length === 0) {
    return { ok: false, code };
  }
  return { ok: true, code, guest: data[0] };
}

/** Lee el parámetro `?c=` de la URL actual (para auto-entrada por link directo). */
export function getUrlCode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("c");
}

// Re-exportamos los helpers de "código recordado" de supabase-client.js tal
// cual, para que entry.js y home.js solo tengan que importar de un lugar.
export { getSavedCode, saveCode };
