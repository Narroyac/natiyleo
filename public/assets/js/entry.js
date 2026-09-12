// Pasaporte de Boda — Nati & Leo
// Lógica de invitacion/index.html: entra por ?c=CODIGO en la URL, por código
// guardado de una visita anterior, o por el formulario manual.
// La validación real vive en entry-core.js (compartida con home.js).

import { lookupGuestByCode, getUrlCode, getSavedCode, saveCode } from "./entry-core.js";

const landingState = document.getElementById("landing-state");
const loadingState = document.getElementById("loading-state");
const errorState = document.getElementById("error-state");
const codeForm = document.getElementById("code-form");
const codeInput = document.getElementById("code-input");
const showCodeFormBtn = document.getElementById("show-code-form");
const retryBtn = document.getElementById("retry-btn");

function showOnly(el) {
  for (const s of [landingState, loadingState, errorState, codeForm]) {
    s.style.display = "none";
    s.classList.remove("show");
  }
  if (el === codeForm) el.classList.add("show");
  else el.style.display = "block";
}

async function tryCode(rawCode) {
  if (!(rawCode || "").trim()) return;
  showOnly(loadingState);
  const result = await lookupGuestByCode(rawCode);
  if (!result.ok) {
    showOnly(errorState);
    return;
  }
  saveCode(result.code);
  // Mismo directorio que pasaporte.html (ambas viven en invitacion/).
  window.location.href = `pasaporte.html?c=${encodeURIComponent(result.code)}`;
}

showCodeFormBtn.addEventListener("click", () => {
  showOnly(codeForm);
  codeInput.focus();
});

retryBtn.addEventListener("click", () => showOnly(codeForm));

codeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  tryCode(codeInput.value);
});

(function init() {
  const urlCode = getUrlCode();
  const saved = getSavedCode();
  const code = urlCode || saved;
  if (code) {
    tryCode(code);
  } else {
    showOnly(landingState);
  }
})();
