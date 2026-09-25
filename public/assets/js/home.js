// Nati & Leo — Home
// Widget de código al final de la página: valida el código igual que la
// puerta de invitacion/index.html (misma lógica, vía entry-core.js), pero
// con un estado inline simple (idle → loading → error) en vez de la UI de
// pantalla completa. Al validar, redirige a invitacion/pasaporte.html (con
// el prefijo invitacion/, porque este archivo vive en la raíz del sitio).

import { lookupGuestByCode, getUrlCode, getSavedCode, saveCode } from "./entry-core.js";

// El hero usa "calc(var(--vh, 1vh) * 100)" en vez de 100dvh directamente
// (ver .hero en home.css): algunos navegadores integrados (el de WhatsApp
// en iOS, por ejemplo) calculan mal dvh/vh — reportan una altura mayor a
// la que realmente se ve, así que el contenido anclado al fondo del hero
// (el botón "¡Allá estaré!") termina flotando sobre la sección de abajo.
// window.innerHeight sí lo reportan bien esos navegadores, así que lo
// medimos por JS y lo exponemos como variable CSS.
(function fixViewportHeight() {
  function setVh() {
    document.documentElement.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
  }
  setVh();
  window.addEventListener("resize", setVh);
  window.addEventListener("orientationchange", setVh);
})();

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

// Fotos con click para abrir a tamaño real: galería y miniaturas del FAQ.
// Cada grupo (galería, fotos de vestimenta) navega entre sí con flechas,
// sin necesidad de cerrar el popup.
(function initLightbox() {
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const closeBtn = document.getElementById("lightbox-close");
  const prevBtn = document.getElementById("lightbox-prev");
  const nextBtn = document.getElementById("lightbox-next");
  const groups = [
    document.querySelectorAll(".gallery-strip__item"),
    document.querySelectorAll(".faq__photo"),
  ].filter((group) => group.length);
  if (!lightbox || !lightboxImg || !closeBtn || !groups.length) return;

  let currentGroup = null;
  let currentIndex = 0;

  function show(index) {
    currentIndex = (index + currentGroup.length) % currentGroup.length;
    const img = currentGroup[currentIndex].querySelector("img");
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt || "";
    const hasMultiple = currentGroup.length > 1;
    prevBtn.hidden = !hasMultiple;
    nextBtn.hidden = !hasMultiple;
  }

  function open(group, index) {
    currentGroup = group;
    show(index);
    lightbox.hidden = false;
  }

  function close() {
    lightbox.hidden = true;
    lightboxImg.src = "";
    currentGroup = null;
  }

  groups.forEach((group) => {
    group.forEach((item, index) => {
      item.addEventListener("click", () => open(group, index));
    });
  });

  prevBtn.addEventListener("click", () => show(currentIndex - 1));
  nextBtn.addEventListener("click", () => show(currentIndex + 1));
  closeBtn.addEventListener("click", close);
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) close();
  });
  document.addEventListener("keydown", (e) => {
    if (lightbox.hidden) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") show(currentIndex - 1);
    if (e.key === "ArrowRight") show(currentIndex + 1);
  });

  // Deslizar con el dedo en mobile para pasar de foto sin cerrar el popup.
  let touchStartX = null;
  lightbox.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
  });
  lightbox.addEventListener("touchend", (e) => {
    if (touchStartX === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(delta) < 40) return;
    if (delta < 0) show(currentIndex + 1);
    else show(currentIndex - 1);
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

// Carrusel del hero: cambia entre las 3 fotos con un fundido suave, en
// loop infinito, sin flechas ni controles.
(function initHeroCarousel() {
  const carousel = document.getElementById("hero-carousel");
  if (!carousel) return;
  const slides = carousel.querySelectorAll(".hero__carousel-img");
  if (slides.length < 2) return;

  let current = 0;
  setInterval(() => {
    slides[current].classList.remove("is-active");
    current = (current + 1) % slides.length;
    slides[current].classList.add("is-active");
  }, 5000);
})();
