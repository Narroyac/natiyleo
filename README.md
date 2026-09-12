# Nati & Leo — Boda 04.12.2026

Sitio de la boda de Nati &amp; Leo, publicado en GitHub Pages como 3 sub-sitios
dentro de un mismo repo: la Home pública, la invitación/PWA de invitados
(RSVP, menú, retos y estampillas tipo pasaporte), y el panel de administración
con podio en vivo.

Publicado en: **https://narroyac.github.io/natiyleo/**

## Sub-sitios

| Sub-sitio | URL | Descripción |
|---|---|---|
| Home | `/` | Página pública de la boda: la velada, ubicación, FAQ y un widget para ingresar con tu código de invitado. |
| Invitación | `/invitacion/` | PWA del invitado: pasaporte con retos, galería y álbum. Solo accesible con un código válido. |
| Admin | `/admin/` | Panel de administración de invitados, RSVP, menú y roles. |
| Podio | `/admin/podio.html` | Podio en vivo (Supabase Realtime) para el día del evento. |

## Estructura

```
public/                       carpeta publicada por GitHub Pages, sin build step
  index.html                   Home pública (nueva)
  invitacion/                   PWA del invitado (antes en la raíz del sitio)
    index.html, pasaporte.html, galeria.html, album.html
    manifest.json, sw.js
  admin/                        panel de administración y podio
  assets/css, assets/js         estilos y JS compartidos por los 3 sub-sitios
  icons/                        íconos de la PWA (compartidos)
supabase/
  migrations/                   historial de migraciones ya aplicadas — no se vuelven a correr
  seed/                         seed de retos y catálogo de roles
scripts/
  import-guests.mjs             importador de invitados desde el Google Sheet
  import-overrides.json         exclusiones/ajustes del importador, editable sin tocar el script
.github/workflows/deploy-pages.yml   despliegue automático a GitHub Pages
```

Todas las rutas dentro de `public/` son **relativas**, porque el sitio vive en
un subpath (`/natiyleo/`) y no en la raíz del dominio.

## Supabase

El proyecto de Supabase ya está aprovisionado y migrado (mismo proyecto que
usaba `pasaporte-natiyleo`). `supabase/migrations/` queda como registro
histórico — no hace falta volver a correr nada al clonar este repo.

## Deploy (GitHub Pages)

Cada `git push` a `main` que toque `public/**` dispara
`.github/workflows/deploy-pages.yml`, que publica el contenido de `public/`
tal cual (sin paso de build, es un sitio estático).

**Paso manual único** (la primera vez): en GitHub, ve a
*Settings → Pages → Source* y selecciona **GitHub Actions**.

Este repo ya no es el conectado a Netlify — ese despliegue (el de
`pasaporte-natiyleo`) queda descontinuado; este proyecto se publica solo por
GitHub Pages.

## Cómo reemplazar los íconos de estampilla (sin tocar código)

Los íconos viven en Supabase Storage, bucket `stamps`, con nombres predecibles:
`reto-1.svg` … `reto-11.svg` para los retos de actividad, y `role-madrina.svg`,
`role-padrino.svg`, etc. para los roles especiales.

Para poner tu ilustración final: entra al dashboard de Supabase → Storage →
bucket `stamps`, y sube tu archivo con el mismo nombre para reemplazar el
placeholder. No hay que tocar código ni volver a desplegar el sitio.

## Ícono de la app (PWA)

El ícono que se ve al "Agregar a inicio" vive en `public/icons/` (no en
Supabase), porque tiene que ser un archivo del propio sitio. Para
reemplazarlo con la ilustración final: genera los mismos 6 archivos (mismos
nombres y tamaños: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`
con más margen de seguridad alrededor, `apple-touch-icon.png` 180×180,
`favicon-32.png` y `favicon-16.png`), reemplázalos en esa carpeta, y haz
push a `main` (esto sí requiere un nuevo despliegue porque son archivos del
repo).

## Importador de invitados

Lee el Google Sheet (columnas `Invitado`, `Cantidad`), limpia los nombres,
genera un código por invitado principal (ej. `OSWALDO01`) y uno de acompañante
cuando aplica (`OSWALDO01-ACOMP`).

```bash
npm run import:preview   # solo genera la vista previa, no toca Supabase
npm run import:commit    # además inserta/actualiza en Supabase (requiere .env)
```

Es seguro correrlo varias veces: los invitados que ya existen (mismo código) no
se duplican. Si agregas gente al Sheet, vuelve a correrlo y solo se crean los
nuevos. Si quitas a alguien del Sheet, el script lo avisa pero no borra nada
automáticamente — se desactiva/edita desde el panel admin.

Ajustes sin tocar el script: `scripts/import-overrides.json` (filas a excluir,
palabras que indican acompañante sin nombre propio).

## Variables de entorno

Copia `.env.example` a `.env` y complétalo con los datos de tu proyecto de
Supabase.
