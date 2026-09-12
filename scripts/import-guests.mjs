#!/usr/bin/env node
// Pasaporte de Boda — Nati & Leo
// Importador de invitados desde el Google Sheet (columnas: Invitado, Cantidad).
//
// Uso:
//   node scripts/import-guests.mjs                 → vista previa (no toca Supabase)
//   node scripts/import-guests.mjs --commit         → además inserta en Supabase
//
// Para --commit necesitas estas variables de entorno (ver .env.example):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Re-correrlo es seguro: los invitados que ya existen (mismo código) no se
// duplican ni se pisan. Los que se hayan borrado del Sheet NO se eliminan
// solos de la base de datos — solo se listan como advertencia, para que los
// desactives manualmente desde el admin si aplica.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(__dirname, 'output');

const COMMIT = process.argv.includes('--commit');

// ---------------------------------------------------------------------------
// 1. Cargar overrides
// ---------------------------------------------------------------------------
async function loadOverrides() {
  const raw = await readFile(path.join(__dirname, 'import-overrides.json'), 'utf8');
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// 2. Traer el Sheet como CSV y parsearlo (parser simple, suficiente para este caso)
// ---------------------------------------------------------------------------
async function fetchSheetCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No pude leer el Google Sheet (${res.status}). ¿Sigue compartido como "cualquiera con el link"?`);
  return res.text();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* ignore */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ---------------------------------------------------------------------------
// 3. Limpieza de texto
// ---------------------------------------------------------------------------
const INVISIBLE_CHARS = /[​‌‍⁠﻿]/g;

function cleanRaw(str) {
  return str
    .replace(INVISIBLE_CHARS, '')
    .replace(/^\s*[-–—]\s*/, '') // bullet inicial tipo "- "
    .replace(/\s+/g, ' ')
    .trim();
}

function toTitleCase(str) {
  return str
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length <= 1 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

function slugifyForCode(str) {
  const noAccents = str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // quita tildes/diéresis
  const upper = noAccents.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (upper || 'INVITADO').slice(0, 14);
}

// ---------------------------------------------------------------------------
// 4. Parseo de cada fila del Sheet a invitado(s)
// ---------------------------------------------------------------------------
function parseGuestRow(rawInvitado, cantidad, overrides) {
  const cleaned = cleanRaw(rawInvitado);
  const parts = cleaned.split('+').map((p) => p.trim()).filter(Boolean);
  const primaryRaw = parts[0] || cleaned;
  const companionRaw = parts[1] || null;

  const primaryName = toTitleCase(primaryRaw);

  let companionName = null;
  let companionIsGeneric = false;
  if (cantidad >= 2 && companionRaw) {
    const isGeneric = overrides.genericCompanionWords
      .map((w) => w.toLowerCase())
      .includes(companionRaw.toLowerCase());
    if (isGeneric) {
      companionIsGeneric = true;
      companionName = null;
    } else {
      companionName = toTitleCase(companionRaw);
    }
  } else if (cantidad >= 2 && !companionRaw) {
    companionIsGeneric = true;
    companionName = null;
  }

  return { cleaned, primaryName, companionName, companionIsGeneric, hasCompanion: cantidad >= 2 };
}

// ---------------------------------------------------------------------------
// 5. Construir la lista de invitados a partir de todas las filas
// ---------------------------------------------------------------------------
function buildGuestList(sheetRows, overrides) {
  const excludeSet = new Set(overrides.exclude.map((s) => cleanRaw(s).toLowerCase()));
  const usedCodes = new Set();
  const guests = [];
  const skipped = [];

  for (const [rawInvitado, rawCantidad] of sheetRows) {
    const cleaned = cleanRaw(rawInvitado);
    if (!cleaned) continue;
    if (excludeSet.has(cleaned.toLowerCase())) {
      skipped.push({ invitado: rawInvitado, motivo: 'excluido por import-overrides.json' });
      continue;
    }

    const cantidad = parseInt(rawCantidad, 10) || 1;
    const parsed = parseGuestRow(rawInvitado, cantidad, overrides);

    const primaryCode = (() => {
      const base = slugifyForCode(parsed.primaryName);
      let n = 1;
      let code;
      do {
        code = `${base}${String(n).padStart(2, '0')}`;
        n++;
      } while (usedCodes.has(code));
      usedCodes.add(code);
      return code;
    })();

    guests.push({
      first_name: parsed.primaryName,
      invitation_label: parsed.primaryName,
      code: primaryCode,
      is_companion: false,
      companion_of_code: null,
      source_row: rawInvitado,
    });

    if (parsed.hasCompanion) {
      const companionCode = `${primaryCode}-ACOMP`;
      const companionLabel = parsed.companionName || `Acompañante de ${parsed.primaryName}`;
      guests.push({
        first_name: companionLabel,
        invitation_label: companionLabel,
        code: companionCode,
        is_companion: true,
        companion_of_code: primaryCode,
        source_row: rawInvitado,
      });
    }
  }

  return { guests, skipped };
}

// ---------------------------------------------------------------------------
// 6. Supabase REST (sin dependencias) — solo se usa con --commit
// ---------------------------------------------------------------------------
async function commitToSupabase(guests) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno. Revisa .env.example.');
  }

  // Paso 1: insertar primarios y acompañantes SIN companion_of (evita el orden de FK),
  // ignorando los que ya existan (mismo code).
  const rows = guests.map((g) => ({
    first_name: g.first_name,
    invitation_label: g.invitation_label,
    code: g.code,
    is_companion: g.is_companion,
  }));

  const insertRes = await fetch(`${url}/rest/v1/guests?on_conflict=code`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  });
  if (!insertRes.ok) {
    throw new Error(`Error insertando invitados: ${insertRes.status} ${await insertRes.text()}`);
  }

  // Paso 2: resolver companion_of ahora que todos tienen id.
  const allRes = await fetch(`${url}/rest/v1/guests?select=id,code`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const all = await allRes.json();
  const codeToId = new Map(all.map((g) => [g.code, g.id]));

  for (const g of guests) {
    if (!g.companion_of_code) continue;
    const companionId = codeToId.get(g.code);
    const primaryId = codeToId.get(g.companion_of_code);
    if (!companionId || !primaryId) continue;
    await fetch(`${url}/rest/v1/guests?id=eq.${companionId}`, {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ companion_of: primaryId }),
    });
  }

  return { inserted: rows.length };
}

async function fetchExistingCodes() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const res = await fetch(`${url}/rest/v1/guests?select=code,invitation_label`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const overrides = await loadOverrides();
  const csv = await fetchSheetCsv(overrides.sheetCsvUrl);
  const rows = parseCsv(csv);
  const [header, ...dataRows] = rows;
  console.log(`Leídas ${dataRows.length} filas del Sheet (encabezado: ${header.join(', ')})`);

  const { guests, skipped } = buildGuestList(dataRows, overrides);

  const totalPersonas = guests.length;
  const totalPrincipales = guests.filter((g) => !g.is_companion).length;
  const totalAcompanantes = guests.filter((g) => g.is_companion).length;

  console.log('');
  console.log('Vista previa de códigos generados:');
  console.log('-----------------------------------------------------------');
  for (const g of guests) {
    const tag = g.is_companion ? `  ↳ acompañante de ${g.companion_of_code}` : '';
    console.log(`${g.code.padEnd(20)} ${g.first_name}${tag}`);
  }
  console.log('-----------------------------------------------------------');
  console.log(`Total: ${totalPersonas} personas (${totalPrincipales} principales + ${totalAcompanantes} acompañantes)`);

  if (skipped.length) {
    console.log('');
    console.log('Filas excluidas (ver scripts/import-overrides.json):');
    for (const s of skipped) console.log(`  - ${s.invitado} (${s.motivo})`);
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, 'import-preview.json'), JSON.stringify(guests, null, 2));
  const csvLines = ['first_name,code,is_companion,companion_of_code,source_row'];
  for (const g of guests) {
    csvLines.push([g.first_name, g.code, g.is_companion, g.companion_of_code ?? '', g.source_row]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  }
  await writeFile(path.join(OUT_DIR, 'import-preview.csv'), csvLines.join('\n'));
  console.log('');
  console.log('Vista previa guardada en scripts/output/import-preview.json y .csv');

  if (!COMMIT) {
    console.log('');
    console.log('(Modo vista previa. Nada se escribió en Supabase. Corre con --commit para insertar de verdad.)');
    return;
  }

  console.log('');
  console.log('Escribiendo en Supabase...');
  const existing = await fetchExistingCodes();
  if (existing) {
    const existingCodes = new Set(existing.map((g) => g.code));
    const nuevos = guests.filter((g) => !existingCodes.has(g.code));
    const yaExistian = guests.length - nuevos.length;
    console.log(`  ${nuevos.length} códigos nuevos, ${yaExistian} ya existían (no se tocan).`);

    const currentSheetCodes = new Set(guests.map((g) => g.code));
    const huerfanos = existing.filter((g) => !currentSheetCodes.has(g.code));
    if (huerfanos.length) {
      console.log('');
      console.log('  Aviso: estos invitados están en Supabase pero ya no aparecen en el Sheet.');
      console.log('  No se eliminan automáticamente (por seguridad, podrían tener RSVP/fotos). Revísalos en el admin:');
      for (const h of huerfanos) console.log(`    - ${h.code} (${h.invitation_label})`);
    }
  }

  const result = await commitToSupabase(guests);
  console.log(`  Listo. ${result.inserted} filas procesadas (los duplicados por código se ignoraron).`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
