// Nati & Leo — Home
// Widget de código al final de la página: valida el código igual que la
// puerta de invitacion/index.html (misma lógica, vía entry-core.js), pero
// con un estado inline simple (idle → loading → error) en vez de la UI de
// pantalla completa. Al validar, redirige a invitacion/pasaporte.html (con
// el prefijo invitacion/, porque este archivo vive en la raíz del sitio).

import { lookupGuestByCode, getUrlCode, getSavedCode, saveCode } from "./entry-core.js";

const form = document.getElementById("rsvp-form");
const input = document.getElementById("rsvp-code-input");
const submitBtn = document.getElementById("rsvp-submit");
const message = document.getElementById("rsvp-message");

function setState(state, text) {
  message.textContent = text || "";
  message.classList.toggle("error", state === "error");
  submitBtn.disabled = state === "loading";
}

async function tryCode(rawCode) {
  if (!(rawCode || "").trim()) return;
  setState("loading", "Buscando tu invitación…");
  const result = await lookupGuestByCode(rawCode);
  if (!result.ok) {
    setState("error", "No encontramos ese código. Revísalo e intenta de nuevo.");
    return;
  }
  saveCode(result.code);
  setState("idle", "");
  // Este archivo vive en la raíz del sitio, así que el pasaporte necesita el
  // prefijo invitacion/ (a diferencia de entry.js, que ya está adentro).
  window.location.href = `invitacion/pasaporte.html?c=${encodeURIComponent(result.code)}`;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  tryCode(input.value);
});

(function init() {
  const urlCode = getUrlCode();
  if (urlCode) {
    input.value = urlCode;
    tryCode(urlCode);
    return;
  }
  const saved = getSavedCode();
  if (saved) input.value = saved;
})();

// Menú hamburguesa del header (puramente visual, sin relación con el código).
(function initNav() {
  const header = document.querySelector(".site-header");
  const toggle = document.getElementById("nav-toggle");
  const menu = document.getElementById("nav-menu");
  if (!header || !toggle || !menu) return;

  function close() {
    header.classList.remove("nav-open");
    toggle.setAttribute("aria-expanded", "false");
  }

  toggle.addEventListener("click", () => {
    const open = header.classList.toggle("nav-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  menu.addEventListener("click", (e) => {
    if (e.target.tagName === "A") close();
  });
  document.addEventListener("click", (e) => {
    if (!header.contains(e.target)) close();
  });
})();

// Galería tipo Pinterest: click en una foto la abre a tamaño real.
(function initLightbox() {
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const closeBtn = document.getElementById("lightbox-close");
  const items = document.querySelectorAll(".gallery-masonry__item");
  if (!lightbox || !lightboxImg || !closeBtn || !items.length) return;

  function open(src, alt) {
    lightboxImg.src = src;
    lightboxImg.alt = alt || "";
    lightbox.hidden = false;
  }

  function close() {
    lightbox.hidden = true;
    lightboxImg.src = "";
  }

  items.forEach((item) => {
    item.addEventListener("click", () => {
      const img = item.querySelector("img");
      open(img.src, img.alt);
    });
  });

  closeBtn.addEventListener("click", close);
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !lightbox.hidden) close();
  });
})();

// Centra el punto de "· & Leo" respecto al centro de la "N" de "Nati" (no
// comparten el mismo borde izquierdo: el punto queda alineado con el medio
// de esa letra). Se recalcula en resize porque el ancho de la "N" cambia
// según el tamaño de fuente de cada breakpoint.
(function alignHeroDot() {
  const n = document.getElementById("hero-n");
  const dot2 = document.getElementById("hero-dot-2");
  const names = document.querySelector(".hero__names");
  if (!n || !dot2 || !names) return;

  function align() {
    dot2.style.marginLeft = "0px";
    const namesRect = names.getBoundingClientRect();
    const nRect = n.getBoundingClientRect();
    const dotRect = dot2.getBoundingClientRect();
    const nCenter = nRect.left + nRect.width / 2 - namesRect.left;
    const dotCenter = dotRect.left + dotRect.width / 2 - namesRect.left;
    dot2.style.marginLeft = `${nCenter - dotCenter}px`;
  }

  align();
  window.addEventListener("resize", align);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(align);
  }
})();
