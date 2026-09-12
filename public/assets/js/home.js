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
