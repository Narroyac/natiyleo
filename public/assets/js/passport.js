// Pasaporte de Boda — Nati & Leo — lógica de la página del pasaporte.
//
// Fase 3 (rediseño UI): el motor de flip usa StPageFlip (vendorizado en
// assets/js/vendor/page-flip.module.js) en vez del rotateY hecho a mano —
// dibuja la curva real de la hoja (clip-path + rotación, no física ni
// canvas), que es justo lo que Nati pidió al ver
// github.com/eschao/android-PageFlip (esa librería es nativa de Android,
// no aplica a un sitio web; StPageFlip es su equivalente en JS, y ya
// estaba pre-aprobada en el brief de esta fase). Ningún dato, ninguna
// llamada a Supabase, ninguna regla de negocio cambia — RSVP, menú, subida
// de fotos/video, y el enrutamiento de retos por sort_order siguen
// exactamente igual que antes de este rediseño.

import { supabase, storageUrl, getSavedCode, saveCode } from "./supabase-client.js";
import { PageFlip } from "./vendor/page-flip.module.js";

const SHORT_LABEL = {
  1: "RSVP",
  2: "MENÚ",
  3: "AMIGX NUEVX",
  4: "BRINDIS CAPITÁN",
  5: "DECORACIÓN",
  6: "BRINDIS NOVIOS",
  7: "DESEO",
  8: "LOOK DE LA NOCHE",
  9: "HORA LOCA",
  10: "FOTO LIBRE",
};

const MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=Club+el+Prado+La+Ceja+Antioquia";
const WAZE_URL =
  "https://ul.waze.com/ul?venue_id=186515516.1865089627.37667875&overview=yes&utm_campaign=default&utm_source=waze_website&utm_medium=lm_share_location";

// Imagen de recuerdo de la última página ("finale"): una sola, igual para
// todos los invitados — Nati la diseña una vez y la sube a Storage con este
// nombre; acá solo se muestra y se ofrece para descargar. Prueba .jpg y si
// no existe cae a .png (ver el onerror donde se arma la página "finale"),
// así no importa en qué formato la suba.
const FINALE_IMAGE_JPG = storageUrl("stamps/recuerdo-final.jpg");
const FINALE_IMAGE_PNG = storageUrl("stamps/recuerdo-final.png");
// Contorno de estampilla de la tarjeta de mesa — un solo SVG decorativo
// (sin texto incrustado, a diferencia de las demás estampillas, porque el
// número de mesa varía por invitado), Nati lo reemplaza subiendo un archivo
// con este mismo nombre.
const MESA_FRAME_URL = storageUrl("stamps/mesa.svg");

// Debe coincidir con 2 * minWidth de initFlipbook(): por debajo de este ancho
// StPageFlip cambia a modo portrait (una sola página a la vez, igual que en
// mobile); a partir de acá usa modo landscape (doble página, desktop).
const DESKTOP_SPREAD_MIN_WIDTH = 560;

const els = {
  app: document.getElementById("app"),
  loading: document.getElementById("loading-screen"),
  greetingName: document.getElementById("greeting-name"),
  progressFill: document.getElementById("progress-fill"),
  progressCounter: document.getElementById("progress-counter"),
  passportBook: document.getElementById("passport-book"),
  prevBtn: document.getElementById("prev-page"),
  nextBtn: document.getElementById("next-page"),
  dots: document.getElementById("page-dots"),
  modal: document.getElementById("claim-modal"),
  modalTitle: document.getElementById("modal-title"),
  modalInstructions: document.getElementById("modal-instructions"),
  modalBody: document.getElementById("modal-body"),
  modalClose: document.getElementById("modal-close"),
  celebration: document.getElementById("celebration-modal"),
  celebrationMedal: document.getElementById("celebration-medal"),
  celebrationTitle: document.getElementById("celebration-title"),
  celebrationBody: document.getElementById("celebration-body"),
  celebrationClose: document.getElementById("celebration-close"),
  toast: document.getElementById("toast"),
  galleryLink: document.getElementById("gallery-link"),
};

let state = {
  code: null,
  guest: null,
  challenges: [],
  submissionsByChallengeId: new Map(),
  roleBadges: [],
  pages: [],
  currentPage: 0,
};

let pageFlip = null;

function toast(msg, isError = false) {
  els.toast.textContent = msg;
  els.toast.classList.toggle("error", isError);
  els.toast.classList.add("show");
  setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function getCodeFromUrlOrStorage() {
  const params = new URLSearchParams(window.location.search);
  return params.get("c") || getSavedCode();
}

async function loadData() {
  const code = state.code;
  const [{ data: guestRows, error: guestErr }, { data: challenges }, { data: submissions }, { data: badges }] =
    await Promise.all([
      supabase.rpc("get_guest_by_code", { p_code: code }),
      supabase.from("challenges").select("*").order("sort_order"),
      supabase.rpc("get_guest_submissions", { p_code: code }),
      supabase.from("special_badges").select("*").eq("is_active", true).order("sort_order"),
    ]);

  if (guestErr || !guestRows || guestRows.length === 0) {
    window.location.href = "./index.html";
    return false;
  }

  state.guest = guestRows[0];
  state.challenges = challenges || [];
  state.submissionsByChallengeId = new Map((submissions || []).map((s) => [s.challenge_id, s]));
  const myBadgeIds = new Set(state.guest.badge_ids || []);
  state.roleBadges = (badges || []).filter((b) => myBadgeIds.has(b.id));
  return true;
}

// Mapeo de retos por página: SIN CAMBIOS respecto a la versión anterior
// para los retos 3-11 (siguen agrupados 3/4/5, 6/7/8, 9/10/11 — eso se
// mantiene hasta que se defina y apruebe una nueva agrupación, fase 3 paso
// 4). Lo único que cambia acá es que RSVP y Menú (antes compartían una
// página "stamps" genérica) ahora tienen su propia página "info", tal como
// la describe el mockup 2 — esa estructura de página 2 sí viene definida
// en el spec, no depende de la aprobación pendiente.
function buildPages() {
  const c = state.challenges;
  const byOrder = (n) => c.find((x) => x.sort_order === n);
  const pages = [];

  pages.push({ type: "cover" });
  // Página en blanco: solo tiene sentido en desktop, donde ocupa la hoja
  // izquierda del primer spread doble (junto a "info"). En mobile el libro
  // siempre pasa una hoja a la vez (modo portrait), así que insertarla ahí
  // haría que el invitado tuviera que pasarla como una página vacía más —
  // por eso ni se agrega cuando el ancho no alcanza para doble página.
  if (window.innerWidth >= DESKTOP_SPREAD_MIN_WIDTH) {
    pages.push({ type: "blank" });
  }
  // Estampillas especiales: justo después de la portada, y SOLO si este
  // invitado tiene alguna — si no, la página ni existe (a pedido de Nati).
  if (state.roleBadges.length > 0) {
    pages.push({ type: "roles" });
  }
  pages.push({ type: "info", rsvp: byOrder(1), menu: byOrder(2) });
  pages.push({ type: "stamps", key: "34", ids: [3, 4].map(byOrder).filter(Boolean) });
  pages.push({ type: "stamps", key: "5678", ids: [5, 6, 7, 8].map(byOrder).filter(Boolean) });
  pages.push({ type: "stamps", key: "910", ids: [9, 10].map(byOrder).filter(Boolean) });
  pages.push({ type: "finale" });

  state.pages = pages;
}

function isDone(challenge) {
  return state.submissionsByChallengeId.has(challenge.id);
}

function progressCount() {
  const activity = state.challenges;
  const done = activity.filter(isDone).length;
  return { done, total: activity.length };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderFrame() {
  els.greetingName.textContent = `${state.guest.first_name},`;
  els.galleryLink.href = `/galeria.html?c=${encodeURIComponent(state.code)}`;

  const { done, total } = progressCount();
  const pct = total ? Math.round((done / total) * 100) : 0;
  els.progressFill.style.width = `${pct}%`;
  els.progressCounter.textContent = `${done}/${total}`;

  els.dots.innerHTML = "";
  state.pages.forEach((_, i) => {
    const d = document.createElement("span");
    d.className = "dot" + (i === state.currentPage ? " active" : "");
    els.dots.appendChild(d);
  });

  els.prevBtn.disabled = state.currentPage === 0;
  els.nextBtn.disabled = state.currentPage === state.pages.length - 1;
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

/** Etiqueta pequeña "Reto N" que va arriba de cada estampilla de la grilla
 * (spec del mockup: cada estampilla trae su número de reto). */
function stampIndexLabel(challenge) {
  return challenge.sort_order === 10 ? "Reto 10 - Final" : `Reto ${challenge.sort_order}`;
}

/** Estampilla de cualquier reto (confirmar, menú, o la grilla "scatter"
 * 3-10) — todas se manejan igual: icon_url cuando está lleno, icon_empty_url
 * cuando está vacío, ambos subidos por Nati a Supabase Storage con el texto
 * ya incrustado en el propio SVG. Si el reto todavía no tiene arte vacío
 * subido, cae de vuelta al recuadro genérico con label + "+" para no dejar
 * la estampilla en blanco. `variant` es opcional y solo aplica el tamaño
 * especial de confirmar/menú (passport-stamp--confirm/--menu); `caption`
 * por defecto es "Reto N", pero confirmar/menú pasan su propio texto. */
function stampCellHtml(challenge, { variant, caption } = {}) {
  const done = isDone(challenge);
  const label = SHORT_LABEL[challenge.sort_order] || challenge.title;
  const src = done ? challenge.icon_url : challenge.icon_empty_url;
  const variantClass = src ? ` passport-stamp${variant ? ` passport-stamp--${variant}` : ""}` : "";
  const inner = src
    ? `
      <button class="stamp-slot${variantClass}${done ? " is-done" : ""}" data-challenge-id="${challenge.id}" aria-label="${escapeHtml(challenge.title)}">
        <img class="stamp-slot-img" src="${storageUrl(src)}" alt="${escapeHtml(label)}" />
      </button>
    `
    : `
      <button class="stamp-slot" data-challenge-id="${challenge.id}" aria-label="${escapeHtml(challenge.title)}">
        <span class="stamp-slot-label">${escapeHtml(label)}</span>
        <span class="stamp-slot-btn">＋</span>
      </button>
    `;
  return `
    <div class="stamp-cell">
      <span class="stamp-index-label">${escapeHtml(caption ?? stampIndexLabel(challenge))}</span>
      ${inner}
    </div>
  `;
}

function bindStampSlotHandlers(container) {
  container.querySelectorAll(".stamp-slot").forEach((btn) => {
    btn.addEventListener("click", () => {
      const challengeId = btn.dataset.challengeId;
      const challenge = state.challenges.find((c) => c.id === challengeId);
      if (challenge) openChallengeModal(challenge);
    });
  });
}

/** Descarga la imagen de recuerdo directo (sin pasar por una pestaña
 * nueva). En mobile usa el share sheet nativo (navigator.share con un
 * File), que en iOS/Android trae "Guardar en Fotos" a un toque — ahí no
 * hace falta que el usuario sepa que debe mantener presionada la imagen.
 * En navegadores sin soporte de share con archivos (la mayoría de
 * escritorio) cae a un <a download> con blob URL, que si funciona porque
 * ya es same-origin (a diferencia del <a> original, que apuntaba directo
 * a Supabase y por eso el navegador ignoraba "download" y solo abría la
 * imagen). Si ambos fallan (ej. fetch bloqueado), se abre en pestaña
 * nueva como último recurso. */
async function downloadFinaleImage(url) {
  const filename = "recuerdo-nati-y-leo" + (url.endsWith(".png") ? ".png" : ".jpg");
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    if (err?.name === "AbortError") return; // el usuario cerró el share sheet
    window.open(url, "_blank", "noopener");
  }
}

/** Construye el <div> de una página como elemento DOM independiente — ya
 * no se escribe dentro de un contenedor compartido, porque StPageFlip
 * necesita los N elementos de todas las páginas de una vez (loadFromHTML).
 * Todas las páginas quedan "soft" (default, sin data-density) — la
 * portada había quedado "hard" (se dobla rígida, sin la curva de papel)
 * y eso hacía que ahí no se viera el efecto; Nati pidió el mismo doblez
 * en todas las páginas, portada incluida. */
function buildPageElement(page) {
  const el = document.createElement("div");
  el.className = "book-page";

  if (page.type === "cover") {
    // Sin fondo de cuadrícula: la portada trae su propia ilustración de
    // tapa a página completa (ver .book-page:not(.book-page--cover) en
    // passport.css).
    el.classList.add("book-page--cover");
    // Ilustración de Nati tal cual, sin reconstruir en HTML (spec sección 3).
    el.innerHTML = `
      <div class="cover-page">
        <img class="cover-page-img" src="../assets/img/cover-pasaporte.png" alt="Pasaporte de Fotos — Nati &amp; Leo" />
      </div>
    `;
    return el;
  }

  if (page.type === "blank") {
    // Sin contenido por ahora — solo el fondo de cuadrícula de .book-page.
    return el;
  }

  if (page.type === "info") {
    const mesaAssigned = Boolean(state.guest.table_number);
    const mesa = mesaAssigned ? `#${state.guest.table_number}` : "por confirmar";
    el.innerHTML = `
      <div class="info-page-body">
        <div class="info-banner">
          <p>Nos encontraremos en el Club el Prado. Aquí compartiremos tanto la ceremonia como la recepción.</p>
          <div class="info-banner-links">
            <a href="${MAPS_URL}" target="_blank" rel="noopener">Ir con Maps ↗</a>
            <a href="${WAZE_URL}" target="_blank" rel="noopener">Ir con Waze ↗</a>
          </div>
        </div>
        <div class="info-grid">
          <div class="info-grid-mesa">
            <span class="stamp-index-label">Mesa</span>
            <div class="mesa-card">
              <img class="mesa-card-frame" src="${MESA_FRAME_URL}" alt="" />
              <div class="mesa-card-content">
                <p>Tu mesa es la:</p>
                <span class="mesa-badge mesa-badge--lg${mesaAssigned ? "" : " mesa-badge--pending"}">${escapeHtml(mesa)}</span>
              </div>
            </div>
          </div>
          <div class="info-grid-stamps">
            ${page.rsvp ? stampCellHtml(page.rsvp, { variant: "confirm", caption: "Reto 1 - Confirmación" }) : ""}
            ${page.menu ? stampCellHtml(page.menu, { variant: "menu", caption: "Reto 2 - Elegir proteína" }) : ""}
          </div>
        </div>
      </div>
    `;
    bindStampSlotHandlers(el);
    return el;
  }

  if (page.type === "stamps") {
    el.innerHTML = `
      <div class="page-header">
        <div class="page-title">Estampillas</div>
        <div class="page-sub">Toca una para reclamarla</div>
      </div>
      <div class="scatter" data-key="${page.key}">
        ${page.ids.map((c) => stampCellHtml(c)).join("")}
      </div>
    `;
    bindStampSlotHandlers(el);
    return el;
  }

  if (page.type === "finale") {
    el.innerHTML = `
      <div class="finale-page-body">
        <p>¡Gracias por completar todos los retos! Aquí puedes descargar tu recuerdo de esta experiencia:</p>
        <img class="finale-image" src="${FINALE_IMAGE_JPG}" alt="Recuerdo del pasaporte — Nati &amp; Leo" />
        <a class="btn-secondary" href="${FINALE_IMAGE_JPG}" target="_blank" rel="noopener">Descargar recuerdo</a>
      </div>
    `;
    const img = el.querySelector(".finale-image");
    const downloadLink = el.querySelector(".btn-secondary");
    img.addEventListener(
      "error",
      () => {
        img.src = FINALE_IMAGE_PNG;
        downloadLink.href = FINALE_IMAGE_PNG;
      },
      { once: true }
    );
    downloadLink.addEventListener("click", (e) => {
      e.preventDefault();
      downloadFinaleImage(downloadLink.href);
    });
    return el;
  }

  if (page.type === "roles") {
    if (state.roleBadges.length === 0) {
      el.innerHTML = `
        <div class="page-header">
          <div class="page-title">Estampillas especiales</div>
        </div>
        <div class="roles-empty">Estas se otorgan a padrinos, madrinas y otros roles especiales. Si te asignan uno, aparecerá aquí. ✦</div>
      `;
      return el;
    }
    el.innerHTML = `
      <div class="page-header">
        <div class="page-title">Estampillas especiales</div>
        <div class="page-sub">Otorgadas, no se reclaman</div>
      </div>
      <div class="roles-wrap">
        ${state.roleBadges
          .map(
            (b) => `
          <div class="role-badge">
            <img src="${storageUrl(b.icon_url)}" alt="${escapeHtml(b.label)}" />
            <div class="stamp-label">${escapeHtml(b.label)}</div>
          </div>`
          )
          .join("")}
      </div>
    `;
    return el;
  }

  return el;
}

// ---------------------------------------------------------------------------
// Page-flip: motor real de StPageFlip (assets/js/vendor/page-flip.module.js)
// — dibuja la curva de la hoja con clip-path + rotación (no física, no
// canvas, no video), respondiendo a swipe, tap en la esquina, y a las
// flechas. flippingTime casi 0 (sin animación de curva) porque esa curva
// generaba un glitch visual en mobile que no se pudo resolver a nivel de
// configuración/parche de la librería — el cambio de página queda
// instantáneo hasta que se investigue más a fondo.
// ---------------------------------------------------------------------------

function buildFlipPages() {
  return state.pages.map(buildPageElement);
}

/** Mientras se muestra la portada (page 0), fuerza el ancho del libro al de
 * una sola hoja para que en desktop también se vea "cerrado" (igual que en
 * mobile) en vez del hueco de una hoja izquierda vacía; al pasar la página,
 * lo libera para que StPageFlip use su doble página normal en desktop. El
 * ancho lo controla la clase .is-cover en passport.css (!important, porque
 * StPageFlip le pone su propio max-width inline); acá solo se dispara un
 * "resize" sintético para que StPageFlip vuelva a medir el contenedor —
 * es el mismo evento que ya escucha para un resize real de ventana. */
function syncCoverWidth() {
  const isCover = state.currentPage === 0;
  if (els.passportBook.classList.contains("is-cover") === isCover) return;
  els.passportBook.classList.toggle("is-cover", isCover);
  window.dispatchEvent(new Event("resize"));
}

function initFlipbook() {
  els.passportBook.classList.add("is-cover");

  pageFlip = new PageFlip(els.passportBook, {
    width: 420,
    height: 602,
    size: "stretch",
    minWidth: 280,
    maxWidth: 420,
    minHeight: 401,
    maxHeight: 602,
    autoSize: true,
    usePortrait: true,
    showCover: true,
    drawShadow: false,
    maxShadowOpacity: 0.5,
    flippingTime: 1,
    mobileScrollSupport: true,
    swipeDistance: 30,
    // clickEventForward ya evita que un tap en un <a>/<button> real (Waze,
    // Maps, las estampillas) dispare un flip — mira target exacto, ver
    // checkTarget() en el vendor y el pointer-events:none de .stamp-slot >
    // * en passport.css. disableFlipByClick quedó DESACTIVADO (default) a
    // propósito: además de no hacer falta para eso, flipPrev() en el vendor
    // arma su punto de click sin sumarle el offset izquierdo del libro
    // (a diferencia de flipNext()), así que con disableFlipByClick activo
    // isPointOnCorners() lo descartaba como fuera de la esquina y el botón
    // "‹" (prev-page) dejaba de funcionar.
    useMouseEvents: true,
  });

  pageFlip.on("flip", (e) => {
    state.currentPage = e.data;
    syncCoverWidth();
    renderFrame();
  });

  pageFlip.loadFromHTML(buildFlipPages());
}

els.prevBtn.addEventListener("click", () => pageFlip?.flipPrev());
els.nextBtn.addEventListener("click", () => pageFlip?.flipNext());

// ---------------------------------------------------------------------------
// Modal: reclamar un reto
// ---------------------------------------------------------------------------

function openModal() {
  els.modal.classList.add("show");
}
function closeModal() {
  els.modal.classList.remove("show");
  els.modalBody.innerHTML = "";
}
els.modalClose.addEventListener("click", closeModal);
els.modal.addEventListener("click", (e) => {
  if (e.target === els.modal) closeModal();
});

function openChallengeModal(challenge) {
  const done = isDone(challenge);
  const sub = state.submissionsByChallengeId.get(challenge.id);

  if (challenge.sort_order === 1) return openRsvpModal(challenge, done, sub);
  if (challenge.sort_order === 2) return openMenuModal(challenge, done, sub);
  if (challenge.requires_text) return openTextModal(challenge, done, sub);
  return openPhotoModal(challenge, done, sub);
}

function openRsvpModal(challenge, done) {
  els.modalTitle.textContent = challenge.title;
  els.modalInstructions.textContent = done
    ? `Ya confirmaste: ${state.guest.rsvp_status === "confirmed" ? "vas a asistir 🎉" : "no podrás asistir"}.`
    : "Confírmanos si nos acompañas en nuestro día.";
  els.modalBody.innerHTML = done
    ? ""
    : `
    <div style="display:flex; gap:12px;">
      <button class="btn" style="flex:1" id="rsvp-yes">Sí, ahí estaré</button>
      <button class="btn btn-outline" style="flex:1" id="rsvp-no">No podré ir</button>
    </div>
  `;
  openModal();
  if (done) return;
  document.getElementById("rsvp-yes").addEventListener("click", () => submitRsvp("confirmed"));
  document.getElementById("rsvp-no").addEventListener("click", () => submitRsvp("declined"));
}

async function submitRsvp(status) {
  const { error } = await supabase.rpc("submit_rsvp", { p_code: state.code, p_status: status });
  if (error) return toast("No se pudo guardar. Intenta de nuevo.", true);
  toast(status === "confirmed" ? "¡Gracias por confirmar! 🎉" : "Quedó registrado, gracias por avisar.");
  closeModal();
  await refreshAndRerender();
}

function openMenuModal(challenge, done, sub) {
  els.modalTitle.textContent = challenge.title;
  els.modalInstructions.textContent = done
    ? `Ya elegiste tu menú: ${state.guest.menu_choice === "lomo" ? "Lomo en salsa de caramelo" : "Pechuga de pollo en salsa de caramelo"}.`
    : "Escoge tu opción para el día de la boda.";
  if (done) {
    els.modalBody.innerHTML = "";
    return openModal();
  }
  els.modalBody.innerHTML = `
    <div class="menu-options">
      <label class="menu-option"><input type="radio" name="menu" value="lomo" /> Lomo en salsa de caramelo</label>
      <label class="menu-option"><input type="radio" name="menu" value="pechuga" /> Pechuga de pollo en salsa de caramelo</label>
    </div>
    <div class="field">
      <label for="menu-notes">Restricciones o alergias (opcional)</label>
      <textarea id="menu-notes" placeholder="Ej. alergia a los mariscos"></textarea>
    </div>
    <button class="btn" id="menu-submit" style="width:100%" disabled>Confirmar menú</button>
  `;
  openModal();
  const radios = els.modalBody.querySelectorAll('input[name="menu"]');
  const submitBtn = document.getElementById("menu-submit");
  radios.forEach((r) =>
    r.addEventListener("change", () => {
      els.modalBody.querySelectorAll(".menu-option").forEach((o) => o.classList.remove("selected"));
      r.closest(".menu-option").classList.add("selected");
      submitBtn.disabled = false;
    })
  );
  submitBtn.addEventListener("click", async () => {
    const choice = els.modalBody.querySelector('input[name="menu"]:checked')?.value;
    if (!choice) return;
    const notes = document.getElementById("menu-notes").value.trim();
    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando…";
    const { error } = await supabase.rpc("submit_menu", { p_code: state.code, p_menu: choice, p_notes: notes || null });
    if (error) {
      toast("No se pudo guardar. Intenta de nuevo.", true);
      submitBtn.disabled = false;
      submitBtn.textContent = "Confirmar menú";
      return;
    }
    toast("¡Menú guardado!");
    closeModal();
    await refreshAndRerender();
  });
}

function openTextModal(challenge, done, sub) {
  els.modalTitle.textContent = challenge.title;
  els.modalInstructions.textContent = done
    ? "Ya enviaste tu deseo. Solo los novios pueden leerlo — no aparece en la galería."
    : "Este mensaje solo lo van a leer Nati y Leo, no aparece en la galería pública.";
  if (done) {
    els.modalBody.innerHTML = `<p style="font-style:italic;">${escapeHtml(sub?.text_content || "")}</p>`;
    return openModal();
  }
  els.modalBody.innerHTML = `
    <div class="field">
      <label for="wish-text">Tu deseo</label>
      <textarea id="wish-text" rows="5" placeholder="Escribe aquí…"></textarea>
    </div>
    <button class="btn" id="wish-submit" style="width:100%">Enviar deseo</button>
  `;
  openModal();
  document.getElementById("wish-submit").addEventListener("click", async () => {
    const text = document.getElementById("wish-text").value.trim();
    if (!text) return toast("Escribe algo antes de enviar.", true);
    const btn = document.getElementById("wish-submit");
    btn.disabled = true;
    btn.textContent = "Enviando…";
    await submitChallengeAndCelebrate(challenge, { text_content: text });
  });
}

/** Redimensiona y comprime una foto en el navegador antes de subirla (fotos de
 * celular suelen pesar 2-8MB; esto las deja livianas para que la galería y las
 * subidas sean rápidas, incluso con la señal del venue). Devuelve un Blob JPEG. */
function compressImage(file, { maxDim = 1400, quality = 0.76 } = {}) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (Math.max(width, height) > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => resolve(blob || file), // si algo falla, sube el original
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // si no se puede leer como imagen, sube el original tal cual
    };
    img.src = url;
  });
}

/** Formatea segundos como "0:22" para el distintivo de duración de video. */
function formatDuration(totalSeconds) {
  const s = Math.round(totalSeconds || 0);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** Lee la duración de un video sin subirlo, usando un <video> oculto. Algunos
 * archivos (según cómo los generó la app de cámara) reportan duration =
 * Infinity hasta que el navegador termina de calcularla — se fuerza con un
 * pequeño truco de "seek" que ya es un workaround conocido en Chrome. */
function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const url = URL.createObjectURL(file);

    function finish(duration) {
      URL.revokeObjectURL(url);
      resolve(duration);
    }

    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) return finish(video.duration);
      // duration = Infinity: forzar el cálculo real con un seek grande.
      video.currentTime = 1e10;
      video.ontimeupdate = () => {
        video.ontimeupdate = null;
        video.currentTime = 0;
        finish(Number.isFinite(video.duration) ? video.duration : 0);
      };
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("no se pudo leer el video"));
    };
    video.src = url;
  });
}

function supportsVideoCompression() {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function"
  );
}

function pickVideoMimeType() {
  // OJO: no incluir "video/mp4" a secas (sin codecs=). Algunos navegadores
  // reportan que lo soportan y hasta crean el MediaRecorder sin quejarse,
  // pero graban el video con un códec distinto (ej. VP9) por dentro del
  // contenedor mp4 — un archivo mal etiquetado que puede fallar al reproducir
  // en clientes estrictos como Safari/iOS. Solo confiamos en mp4 si el propio
  // navegador confirma soporte para un códec específico (h264/avc1+aac).
  const candidates = [
    "video/mp4;codecs=h264,aac",
    "video/mp4;codecs=avc1,mp4a",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const type of candidates) {
    if (window.MediaRecorder?.isTypeSupported?.(type)) return type;
  }
  return null;
}

/** Reproduce el video una vez a través de un <canvas> reducido (~720p) y
 * graba ese stream con MediaRecorder — sin librerías externas. El audio se
 * enruta por Web Audio a un MediaStreamDestination (nunca a los parlantes),
 * así que no suena en el celular del invitado mientras se procesa. Si el
 * navegador no soporta algo de esto, sube el video original tal cual: nunca
 * bloquea al invitado por un problema de compresión. */
function compressVideo(file, { maxDim = 1280, onProgress } = {}) {
  return new Promise((resolve) => {
    const bail = () => resolve({ blob: file, mimeType: file.type || "video/mp4" });
    if (!supportsVideoCompression()) return bail();
    const mimeType = pickVideoMimeType();
    if (!mimeType) return bail();

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;

    video.onloadedmetadata = () => {
      let { videoWidth: width, videoHeight: height } = video;
      if (!width || !height) {
        URL.revokeObjectURL(url);
        return bail();
      }
      if (Math.max(width, height) > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      let stream;
      try {
        stream = canvas.captureStream(30);
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          const source = audioCtx.createMediaElementSource(video);
          const dest = audioCtx.createMediaStreamDestination();
          source.connect(dest); // no se conecta a audioCtx.destination -> silencioso
          dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
        }
      } catch {
        URL.revokeObjectURL(url);
        return bail();
      }

      let recorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_500_000 });
      } catch {
        URL.revokeObjectURL(url);
        return bail();
      }

      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        URL.revokeObjectURL(url);
        if (chunks.length === 0) return bail();
        // Usamos el mimeType que el propio MediaRecorder reporta como usado
        // (recorder.mimeType), no el que le pedimos: algunos navegadores dicen
        // soportar un formato vía isTypeSupported() pero graban con otro códec
        // por dentro. Si confiáramos en el string pedido, podríamos etiquetar
        // (y subir con extensión) "video/mp4" un archivo que en realidad es VP9,
        // lo que rompe la reproducción en clientes estrictos como Safari/iOS.
        const actualMimeType = recorder.mimeType || mimeType;
        resolve({ blob: new Blob(chunks, { type: actualMimeType }), mimeType: actualMimeType });
      };
      recorder.onerror = () => {
        URL.revokeObjectURL(url);
        bail();
      };

      let raf;
      const drawFrame = () => {
        if (video.paused || video.ended) return;
        ctx.drawImage(video, 0, 0, width, height);
        if (onProgress) onProgress(video.currentTime);
        raf = requestAnimationFrame(drawFrame);
      };
      video.onended = () => {
        cancelAnimationFrame(raf);
        try {
          recorder.stop();
        } catch {}
      };
      video.onerror = () => {
        cancelAnimationFrame(raf);
        try {
          recorder.stop();
        } catch {}
      };

      recorder.start();
      video.play().then(drawFrame).catch(() => {
        try {
          recorder.stop();
        } catch {}
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      bail();
    };
  });
}

function openPhotoModal(challenge, done, sub) {
  els.modalTitle.textContent = challenge.title;
  els.modalInstructions.textContent = done
    ? "Ya completaste este reto."
    : "Toma o elige una foto o un video (máx. 30 segundos).";
  if (done) {
    if (sub?.media_type === "video" && sub?.photo_url) {
      els.modalBody.innerHTML = `<video class="preview" src="${sub.photo_url}" controls playsinline style="max-height:260px;border-radius:8px;width:100%;"></video>`;
    } else {
      els.modalBody.innerHTML = sub?.photo_url
        ? `<img class="preview" src="${sub.photo_url}" alt="" style="max-height:260px;border-radius:8px;" />`
        : "";
    }
    return openModal();
  }
  els.modalBody.innerHTML = `
    <div class="upload-zone" id="upload-zone">
      <p class="lede" style="margin-bottom:12px;">📷 Toca para elegir una foto o video</p>
      <input type="file" accept="image/*,video/*" id="photo-input" />
    </div>
    <button class="btn" id="photo-submit" style="width:100%" disabled>Enviar</button>
  `;
  openModal();
  const zone = document.getElementById("upload-zone");
  const input = document.getElementById("photo-input");
  const submitBtn = document.getElementById("photo-submit");
  let selectedFile = null;
  let selectedKind = null; // "photo" | "video"
  let selectedDuration = null;

  function resetZone(message) {
    zone.innerHTML = `<p class="lede" style="margin-bottom:12px;">📷 Toca para elegir una foto o video</p>`;
    zone.appendChild(input);
    submitBtn.disabled = true;
    selectedFile = null;
    selectedKind = null;
    selectedDuration = null;
    if (message) toast(message, true);
  }

  zone.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "photo" : null;
    if (!kind) return resetZone("Elige una foto o un video.");

    if (kind === "video") {
      zone.innerHTML = `<p class="lede">Revisando el video…</p>`;
      let duration;
      try {
        duration = await getVideoDuration(file);
      } catch {
        return resetZone("No se pudo leer ese video. Intenta con otro.");
      }
      if (duration > 30.5) {
        return resetZone(`Ese video dura ${formatDuration(duration)} — elige uno de máximo 30 segundos.`);
      }
      selectedFile = file;
      selectedKind = "video";
      selectedDuration = Math.min(30, Math.round(duration));
      const previewUrl = URL.createObjectURL(file);
      zone.innerHTML = `<video class="preview" src="${previewUrl}" controls playsinline muted style="max-height:260px;border-radius:8px;width:100%;"></video><p class="lede">Toca para cambiar el video · ${formatDuration(duration)}</p>`;
      zone.appendChild(input);
      submitBtn.disabled = false;
    } else {
      selectedFile = file;
      selectedKind = "photo";
      selectedDuration = null;
      const reader = new FileReader();
      reader.onload = () => {
        zone.innerHTML = `<img class="preview" src="${reader.result}" alt="" /><p class="lede">Toca para cambiar la foto</p>`;
        zone.appendChild(input);
      };
      reader.readAsDataURL(file);
      submitBtn.disabled = false;
    }
  });

  submitBtn.addEventListener("click", async () => {
    if (!selectedFile) return;
    submitBtn.disabled = true;

    if (selectedKind === "video") {
      submitBtn.textContent = "Procesando video…";
      try {
        const { blob, mimeType } = await compressVideo(selectedFile, {
          onProgress: (t) => {
            submitBtn.textContent = `Procesando video… ${formatDuration(t)}`;
          },
        });
        submitBtn.textContent = "Subiendo…";
        const ext = mimeType.includes("mp4") ? "mp4" : "webm";
        const path = `${state.code}/${challenge.id}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("photos").upload(path, blob, {
          upsert: false,
          contentType: mimeType,
          cacheControl: "31536000",
        });
        if (uploadError) throw uploadError;
        const { data: pub } = supabase.storage.from("photos").getPublicUrl(path);
        await submitChallengeAndCelebrate(challenge, {
          photo_url: pub.publicUrl,
          media_type: "video",
          duration_seconds: selectedDuration,
        });
      } catch (err) {
        toast("No se pudo subir el video. Intenta de nuevo.", true);
        submitBtn.disabled = false;
        submitBtn.textContent = "Enviar";
      }
      return;
    }

    submitBtn.textContent = "Subiendo…";
    try {
      const compressed = await compressImage(selectedFile);
      const path = `${state.code}/${challenge.id}-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from("photos").upload(path, compressed, {
        upsert: false,
        contentType: "image/jpeg",
        cacheControl: "31536000",
      });
      if (uploadError) throw uploadError;
      const { data: pub } = supabase.storage.from("photos").getPublicUrl(path);
      await submitChallengeAndCelebrate(challenge, { photo_url: pub.publicUrl, media_type: "photo" });
    } catch (err) {
      toast("No se pudo subir la foto. Intenta de nuevo.", true);
      submitBtn.disabled = false;
      submitBtn.textContent = "Enviar";
    }
  });
}

async function submitChallengeAndCelebrate(
  challenge,
  { photo_url, text_content, media_type = "photo", duration_seconds = null } = {}
) {
  const wasCompleted = !!state.guest.completed_at;
  const { error } = await supabase.rpc("submit_challenge", {
    p_code: state.code,
    p_challenge_id: challenge.id,
    p_photo_url: photo_url || null,
    p_text_content: text_content || null,
    p_media_type: media_type,
    p_duration_seconds: duration_seconds,
  });
  if (error) {
    toast("No se pudo guardar. Intenta de nuevo.", true);
    return;
  }
  toast("¡Estampilla desbloqueada! ✦");
  closeModal();
  await refreshAndRerender();

  if (!wasCompleted && state.guest.completed_at) {
    await showCelebration();
  }
}

async function showCelebration() {
  const { data } = await supabase.rpc("get_guest_rank", { p_code: state.code });
  const info = data && data[0];
  if (info?.prize_eligible) {
    els.celebrationMedal.textContent = "🏆";
    els.celebrationTitle.textContent = "¡Ganaste el premio!";
    els.celebrationBody.textContent = `Completaste tu pasaporte en el puesto ${info.rank}. Reclama tu premio con Nati o Leo en el evento.`;
  } else {
    els.celebrationMedal.textContent = "🎉";
    els.celebrationTitle.textContent = "¡Pasaporte completo!";
    els.celebrationBody.textContent = "Completaste los 11 retos. ¡Gracias por celebrar con nosotros!";
  }
  els.celebration.classList.add("show");
}
els.celebrationClose.addEventListener("click", () => els.celebration.classList.remove("show"));

async function refreshAndRerender() {
  await loadData();
  buildPages();
  if (pageFlip) {
    // updateFromHtml conserva la página actual (lee getCurrentPageIndex()
    // antes de reconstruir), así que no hace falta volver a navegar.
    pageFlip.updateFromHtml(buildFlipPages());
  }
  renderFrame();
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

(async function init() {
  const code = getCodeFromUrlOrStorage();
  if (!code) {
    window.location.href = "./index.html";
    return;
  }
  state.code = code.trim().toUpperCase();
  saveCode(state.code);

  const ok = await loadData();
  if (!ok) return;

  buildPages();
  els.loading.style.display = "none";
  els.app.style.display = "flex";
  initFlipbook();
  renderFrame();
})();
