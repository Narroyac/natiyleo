// Pasaporte de Boda — Nati & Leo — Panel de administración

import { supabase, storageUrl } from "./supabase-client.js";

const ADMIN_EMAIL = "narroyac@gmail.com";

const els = {
  loginScreen: document.getElementById("login-screen"),
  loginForm: document.getElementById("login-form"),
  loginPassword: document.getElementById("login-password"),
  loginError: document.getElementById("login-error"),
  shell: document.getElementById("admin-shell"),
  logoutBtn: document.getElementById("logout-btn"),
  toast: document.getElementById("toast"),
  guestModal: document.getElementById("guest-modal"),
  guestModalTitle: document.getElementById("guest-modal-title"),
  guestModalBody: document.getElementById("guest-modal-body"),
  guestModalClose: document.getElementById("guest-modal-close"),
  exportZipBtn: document.getElementById("export-zip-btn"),
};

let db = {
  guests: [],
  challenges: [],
  submissions: [],
  badges: [],
  comments: [],
  reactions: [],
  appConfig: null,
};

function toast(msg, isError = false) {
  els.toast.textContent = msg;
  els.toast.classList.toggle("error", isError);
  els.toast.classList.add("show");
  setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

els.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.loginError.classList.remove("show");
  const { error } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: els.loginPassword.value,
  });
  if (error) {
    els.loginError.classList.add("show");
    return;
  }
  await boot();
});

els.logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.reload();
});

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

document.querySelectorAll(".admin-tab-btn[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab-btn[data-tab]").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".admin-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
  });
});

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadAll() {
  const [{ data: guests }, { data: challenges }, { data: submissions }, { data: badges }, { data: comments }, { data: reactions }, { data: config }] =
    await Promise.all([
      supabase.from("guests").select("*").order("invitation_label"),
      supabase.from("challenges").select("*").order("sort_order"),
      supabase.from("submissions").select("*"),
      supabase.from("special_badges").select("*").order("sort_order"),
      supabase.from("comments").select("*").order("created_at", { ascending: false }),
      supabase.from("reactions").select("*"),
      supabase.from("app_config").select("*").single(),
    ]);
  db.guests = guests || [];
  db.challenges = challenges || [];
  db.submissions = submissions || [];
  db.badges = badges || [];
  db.comments = comments || [];
  db.reactions = reactions || [];
  db.appConfig = config;
}

function submissionsFor(guestId) {
  return db.submissions.filter((s) => s.guest_id === guestId);
}

// ---------------------------------------------------------------------------
// Invitados
// ---------------------------------------------------------------------------

function rsvpBadge(status) {
  if (status === "confirmed") return `<span class="badge badge-confirmed">Confirmado</span>`;
  if (status === "declined") return `<span class="badge badge-declined">No asiste</span>`;
  return `<span class="badge badge-pending">Pendiente</span>`;
}

function menuLabel(m) {
  if (m === "lomo") return "Lomo";
  if (m === "pechuga") return "Pechuga";
  return "—";
}

function renderInvitadosStats() {
  const total = db.guests.length;
  const confirmed = db.guests.filter((g) => g.rsvp_status === "confirmed").length;
  const declined = db.guests.filter((g) => g.rsvp_status === "declined").length;
  const lomo = db.guests.filter((g) => g.menu_choice === "lomo").length;
  const pechuga = db.guests.filter((g) => g.menu_choice === "pechuga").length;
  const completed = db.guests.filter((g) => g.completed_at).length;

  document.getElementById("invitados-stats").innerHTML = `
    <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Invitados</div></div>
    <div class="stat-card"><div class="stat-value">${confirmed}</div><div class="stat-label">Confirmados</div></div>
    <div class="stat-card"><div class="stat-value">${declined}</div><div class="stat-label">No asisten</div></div>
    <div class="stat-card"><div class="stat-value">${lomo} / ${pechuga}</div><div class="stat-label">Lomo / Pechuga</div></div>
    <div class="stat-card"><div class="stat-value">${completed}</div><div class="stat-label">Pasaportes completos</div></div>
  `;
}

function renderGuestsTable() {
  const tbody = document.getElementById("guests-tbody");
  tbody.innerHTML = db.guests
    .map((g) => {
      const done = submissionsFor(g.id).length;
      const total = db.challenges.length;
      const myBadges = db.badges.filter((b) => (g.badge_ids || []).includes(b.id));
      return `
      <tr data-id="${g.id}">
        <td><input class="inline-input name-input" data-field="first_name" value="${escapeHtml(g.first_name)}" /></td>
        <td style="font-variant-numeric: tabular-nums;">${escapeHtml(g.code)}</td>
        <td>${rsvpBadge(g.rsvp_status)}</td>
        <td>${menuLabel(g.menu_choice)}</td>
        <td><input class="inline-input table-input" data-field="table_number" type="number" min="1" style="width:64px" value="${g.table_number ?? ""}" placeholder="—" /></td>
        <td><span class="badge badge-count">${done}/${total}</span></td>
        <td>${myBadges.map((b) => `<span class="role-chip">${escapeHtml(b.label)}</span>`).join("") || "—"}</td>
        <td><button class="icon-btn manage-btn">Gestionar</button></td>
      </tr>
    `;
    })
    .join("");

  tbody.querySelectorAll(".name-input").forEach((input) => {
    input.addEventListener("blur", () => saveField(input));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
  });
  tbody.querySelectorAll(".table-input").forEach((input) => {
    input.addEventListener("blur", () => saveField(input));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
  });
  tbody.querySelectorAll(".manage-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest("tr").dataset.id;
      openGuestModal(db.guests.find((g) => g.id === id));
    });
  });
}

async function saveField(input) {
  const tr = input.closest("tr");
  const id = tr.dataset.id;
  const field = input.dataset.field;
  let value = input.value;
  if (field === "table_number") value = value === "" ? null : parseInt(value, 10);
  if (field === "first_name" && !value.trim()) {
    toast("El nombre no puede quedar vacío.", true);
    input.value = db.guests.find((g) => g.id === id)[field];
    return;
  }
  const { error } = await supabase.from("guests").update({ [field]: value }).eq("id", id);
  if (error) return toast("No se pudo guardar.", true);
  const g = db.guests.find((x) => x.id === id);
  g[field] = value;
  toast("Guardado.");
}

function openGuestModal(guest) {
  els.guestModalTitle.textContent = `Editar a ${guest.first_name}`;
  const badgeChecks = db.badges
    .map((b) => {
      const checked = (guest.badge_ids || []).includes(b.id) ? "checked" : "";
      return `<label class="checkbox-row"><input type="checkbox" class="role-check" data-badge="${b.id}" ${checked} /> ${escapeHtml(b.label)}</label>`;
    })
    .join("");

  els.guestModalBody.innerHTML = `
    <div class="field">
      <label>Confirmación de asistencia</label>
      <div style="display:flex; gap:10px;">
        <button class="btn ${guest.rsvp_status === "confirmed" ? "" : "btn-outline"}" id="gm-confirm">Confirmar</button>
        <button class="btn ${guest.rsvp_status === "declined" ? "" : "btn-outline"}" id="gm-decline">No asiste</button>
      </div>
    </div>
    <div class="field">
      <label for="gm-menu">Menú</label>
      <select id="gm-menu" class="inline-input" style="border:1.5px solid var(--navy-soft); padding:10px;">
        <option value="">Sin elegir</option>
        <option value="lomo" ${guest.menu_choice === "lomo" ? "selected" : ""}>Lomo en salsa de caramelo</option>
        <option value="pechuga" ${guest.menu_choice === "pechuga" ? "selected" : ""}>Pechuga de pollo en salsa de caramelo</option>
      </select>
    </div>
    <div class="field">
      <label for="gm-notes">Restricciones / alergias</label>
      <textarea id="gm-notes" class="inline-input" style="border:1.5px solid var(--navy-soft); padding:10px;">${escapeHtml(guest.dietary_notes || "")}</textarea>
    </div>
    <div class="field">
      <label>Roles especiales</label>
      ${badgeChecks || '<p class="panel-sub">No hay roles en el catálogo. Créalos en la pestaña Roles.</p>'}
    </div>
    <button class="btn" id="gm-save" style="width:100%">Guardar cambios</button>
  `;

  els.guestModal.classList.add("show");

  document.getElementById("gm-confirm").addEventListener("click", async () => {
    await supabase.rpc("submit_rsvp", { p_code: guest.code, p_status: "confirmed" });
    toast("Asistencia confirmada.");
    await refreshAndRerenderInvitados();
    closeGuestModal();
  });
  document.getElementById("gm-decline").addEventListener("click", async () => {
    await supabase.rpc("submit_rsvp", { p_code: guest.code, p_status: "declined" });
    toast("Registrado como 'no asiste'.");
    await refreshAndRerenderInvitados();
    closeGuestModal();
  });

  document.getElementById("gm-save").addEventListener("click", async () => {
    const menu = document.getElementById("gm-menu").value;
    const notes = document.getElementById("gm-notes").value.trim();
    if (menu) {
      await supabase.rpc("submit_menu", { p_code: guest.code, p_menu: menu, p_notes: notes || null });
    } else if (notes) {
      await supabase.from("guests").update({ dietary_notes: notes }).eq("id", guest.id);
    }
    const selectedBadgeIds = Array.from(els.guestModalBody.querySelectorAll(".role-check:checked")).map(
      (c) => c.dataset.badge
    );
    await supabase.from("guests").update({ badge_ids: selectedBadgeIds }).eq("id", guest.id);
    toast("Cambios guardados.");
    await refreshAndRerenderInvitados();
    closeGuestModal();
  });
}

function closeGuestModal() {
  els.guestModal.classList.remove("show");
  els.guestModalBody.innerHTML = "";
}
els.guestModalClose.addEventListener("click", closeGuestModal);
els.guestModal.addEventListener("click", (e) => {
  if (e.target === els.guestModal) closeGuestModal();
});

async function refreshAndRerenderInvitados() {
  await loadAll();
  renderInvitadosStats();
  renderGuestsTable();
  renderRanking();
  renderLinks();
}

// ---------------------------------------------------------------------------
// Galería
// ---------------------------------------------------------------------------

function renderGallery() {
  const grid = document.getElementById("gallery-grid");
  const photos = db.submissions.filter((s) => s.photo_url);
  if (photos.length === 0) {
    grid.innerHTML = `<p class="panel-sub">Todavía no hay fotos subidas.</p>`;
    return;
  }
  grid.innerHTML = photos
    .map((s) => {
      const guest = db.guests.find((g) => g.id === s.guest_id);
      const challenge = db.challenges.find((c) => c.id === s.challenge_id);
      const media =
        s.media_type === "video"
          ? `<video src="${s.photo_url}" muted playsinline preload="metadata" controls></video>`
          : `<img src="${s.photo_url}" alt="" loading="lazy" />`;
      return `
      <div class="gallery-item ${s.is_hidden ? "hidden-item" : ""}" data-id="${s.id}">
        ${media}
        <div class="gallery-meta">
          <div class="gallery-guest">${escapeHtml(guest?.first_name || "—")}</div>
          <div class="gallery-challenge">${escapeHtml(challenge?.title || "")}</div>
          <button class="icon-btn toggle-hide-btn" style="width:100%">${s.is_hidden ? "Mostrar" : "Ocultar"}</button>
        </div>
      </div>
    `;
    })
    .join("");

  grid.querySelectorAll(".toggle-hide-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const item = btn.closest(".gallery-item");
      const id = item.dataset.id;
      const sub = db.submissions.find((s) => s.id === id);
      const { error } = await supabase.from("submissions").update({ is_hidden: !sub.is_hidden }).eq("id", id);
      if (error) return toast("No se pudo actualizar.", true);
      sub.is_hidden = !sub.is_hidden;
      renderGallery();
    });
  });

  renderComments();
}

function renderComments() {
  const tbody = document.getElementById("comments-tbody");
  if (!tbody) return;
  if (db.comments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="panel-sub">Todavía no hay comentarios.</td></tr>`;
    return;
  }
  tbody.innerHTML = db.comments
    .map((c) => {
      const commenter = db.guests.find((g) => g.id === c.guest_id);
      const sub = db.submissions.find((s) => s.id === c.submission_id);
      const photoOwner = sub ? db.guests.find((g) => g.id === sub.guest_id) : null;
      const challenge = sub ? db.challenges.find((ch) => ch.id === sub.challenge_id) : null;
      const photoLabel = photoOwner
        ? `${escapeHtml(photoOwner.first_name)}${challenge ? ` · ${escapeHtml(challenge.title)}` : ""}`
        : "—";
      return `
      <tr class="${c.is_hidden ? "hidden-item" : ""}" data-id="${c.id}">
        <td>${escapeHtml(commenter?.first_name || "—")}</td>
        <td>${photoLabel}</td>
        <td>${escapeHtml(c.text)}</td>
        <td><button class="icon-btn toggle-hide-comment-btn">${c.is_hidden ? "Mostrar" : "Ocultar"}</button></td>
      </tr>
    `;
    })
    .join("");

  tbody.querySelectorAll(".toggle-hide-comment-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      const id = row.dataset.id;
      const comment = db.comments.find((c) => c.id === id);
      const { error } = await supabase.from("comments").update({ is_hidden: !comment.is_hidden }).eq("id", id);
      if (error) return toast("No se pudo actualizar.", true);
      comment.is_hidden = !comment.is_hidden;
      renderComments();
    });
  });
}

// ---------------------------------------------------------------------------
// Finalización — ranking + cronómetro
// ---------------------------------------------------------------------------

function renderRanking() {
  const winners = db.appConfig?.prize_winners_count ?? 3;
  const finished = db.guests
    .filter((g) => g.completed_at)
    .sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));

  const tbody = document.getElementById("ranking-tbody");
  if (finished.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="panel-sub">Nadie ha completado su pasaporte todavía.</td></tr>`;
    return;
  }
  tbody.innerHTML = finished
    .map((g, i) => {
      const rank = i + 1;
      const rankBadge =
        rank <= winners
          ? `<span class="badge badge-rank${rank}">🏅 #${rank}</span>`
          : `<span class="badge badge-count">#${rank}</span>`;
      const time = new Date(g.completed_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "medium" });
      return `<tr><td>${rankBadge}</td><td>${escapeHtml(g.first_name)}</td><td>${escapeHtml(g.code)}</td><td>${time}</td></tr>`;
    })
    .join("");
}

let timerInterval = null;

function computeDeadline() {
  const c = db.appConfig;
  if (!c?.challenge_started_at) return null;
  const start = new Date(c.challenge_started_at).getTime();
  const durationMs = (c.challenge_duration_minutes || 0) * 60000;
  const extraMs = (c.challenge_extra_seconds || 0) * 1000;
  return start + durationMs + extraMs;
}

function renderTimer() {
  const c = db.appConfig;
  document.getElementById("timer-duration").value = c?.challenge_duration_minutes ?? 15;

  const statusEl = document.getElementById("timer-status");
  const display = document.getElementById("timer-display");

  if (timerInterval) clearInterval(timerInterval);

  if (!c?.challenge_started_at) {
    statusEl.textContent = "Sin iniciar.";
    display.textContent = "--:--:--";
    return;
  }
  if (c.challenge_paused_at) {
    statusEl.textContent = "Pausado.";
  } else {
    statusEl.textContent = "En curso.";
  }

  function tick() {
    const deadline = computeDeadline();
    const now = c.challenge_paused_at ? new Date(c.challenge_paused_at).getTime() : Date.now();
    let remaining = Math.max(0, deadline - now);
    const h = String(Math.floor(remaining / 3600000)).padStart(2, "0");
    const m = String(Math.floor((remaining % 3600000) / 60000)).padStart(2, "0");
    const s = String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");
    display.textContent = `${h}:${m}:${s}`;
    if (remaining <= 0 && !c.challenge_paused_at) {
      statusEl.textContent = "Tiempo terminado.";
      clearInterval(timerInterval);
    }
  }
  tick();
  if (!c.challenge_paused_at) timerInterval = setInterval(tick, 1000);
}

document.getElementById("timer-start").addEventListener("click", async () => {
  const duration = parseInt(document.getElementById("timer-duration").value, 10) || 15;
  const { error } = await supabase
    .from("app_config")
    .update({
      challenge_duration_minutes: duration,
      challenge_started_at: new Date().toISOString(),
      challenge_paused_at: null,
      challenge_extra_seconds: 0,
    })
    .eq("id", true);
  if (error) return toast("No se pudo iniciar.", true);
  toast("Cronómetro iniciado.");
  await loadAll();
  renderTimer();
});

document.getElementById("timer-pause").addEventListener("click", async () => {
  if (!db.appConfig?.challenge_started_at || db.appConfig.challenge_paused_at) return;
  const { error } = await supabase
    .from("app_config")
    .update({ challenge_paused_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return toast("No se pudo pausar.", true);
  await loadAll();
  renderTimer();
});

document.getElementById("timer-resume").addEventListener("click", async () => {
  const c = db.appConfig;
  if (!c?.challenge_paused_at) return;
  const pausedMs = Date.now() - new Date(c.challenge_paused_at).getTime();
  const addedSeconds = Math.round(pausedMs / 1000);
  const { error } = await supabase
    .from("app_config")
    .update({
      challenge_paused_at: null,
      challenge_extra_seconds: (c.challenge_extra_seconds || 0) + addedSeconds,
    })
    .eq("id", true);
  if (error) return toast("No se pudo reanudar.", true);
  toast("Cronómetro reanudado.");
  await loadAll();
  renderTimer();
});

document.getElementById("timer-extend-btn").addEventListener("click", async () => {
  const mins = parseInt(document.getElementById("timer-extend").value, 10) || 0;
  if (!mins) return;
  const c = db.appConfig;
  const { error } = await supabase
    .from("app_config")
    .update({ challenge_extra_seconds: (c.challenge_extra_seconds || 0) + mins * 60 })
    .eq("id", true);
  if (error) return toast("No se pudo extender.", true);
  toast(`+${mins} min agregados.`);
  await loadAll();
  renderTimer();
});

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

function slugify(label) {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function renderRoles() {
  const tbody = document.getElementById("roles-tbody");
  tbody.innerHTML = db.badges
    .map((b) => {
      const file = b.icon_url ? b.icon_url.split("/").pop() : `role-${slugify(b.label)}.svg`;
      return `
      <tr data-id="${b.id}">
        <td><img src="${storageUrl(b.icon_url)}" alt="" style="width:32px;height:32px;object-fit:contain;" onerror="this.style.visibility='hidden'" /></td>
        <td>${escapeHtml(b.label)}</td>
        <td><code>${escapeHtml(file)}</code></td>
        <td>
          <label class="checkbox-row" style="padding:0;">
            <input type="checkbox" class="active-check" ${b.is_active ? "checked" : ""} />
          </label>
        </td>
        <td><button class="icon-btn danger delete-role-btn">Eliminar</button></td>
      </tr>
    `;
    })
    .join("");

  tbody.querySelectorAll(".active-check").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const id = cb.closest("tr").dataset.id;
      await supabase.from("special_badges").update({ is_active: cb.checked }).eq("id", id);
      toast("Actualizado.");
      await loadAll();
    });
  });
  tbody.querySelectorAll(".delete-role-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest("tr").dataset.id;
      const badge = db.badges.find((b) => b.id === id);
      if (!confirm(`¿Eliminar el rol "${badge.label}"? Se quitará de todos los invitados que lo tengan.`)) return;
      await supabase.from("special_badges").delete().eq("id", id);
      for (const g of db.guests) {
        if ((g.badge_ids || []).includes(id)) {
          await supabase
            .from("guests")
            .update({ badge_ids: g.badge_ids.filter((x) => x !== id) })
            .eq("id", g.id);
        }
      }
      toast("Rol eliminado.");
      await refreshAndRerenderInvitados();
      renderRoles();
    });
  });
}

document.getElementById("new-role-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("new-role-label");
  const label = input.value.trim();
  if (!label) return;
  const iconUrl = `stamps/role-${slugify(label)}.svg`;
  const sortOrder = db.badges.length + 1;
  const { error } = await supabase.from("special_badges").insert({ label, icon_url: iconUrl, sort_order: sortOrder });
  if (error) return toast("No se pudo crear (¿ya existe ese nombre?).", true);
  input.value = "";
  toast("Rol creado. Recuerda subir su ícono a Storage.");
  await loadAll();
  renderRoles();
});

// ---------------------------------------------------------------------------
// Enlaces
// ---------------------------------------------------------------------------

function guestUrl(code) {
  // Resolved against the current page (served from /admin/) rather than
  // window.location.origin, so this keeps working under a GitHub Pages
  // project subpath (e.g. /natiyleo/admin/), not just at a domain root.
  return new URL(`../invitacion/pasaporte.html?c=${encodeURIComponent(code)}`, window.location.href).href;
}

function whatsappMessage(guest) {
  const url = guestUrl(guest.code);
  return `¡Hola ${guest.first_name}! 💌 Este es tu Pasaporte para nuestra boda. Entra aquí para confirmar tu asistencia, elegir tu menú y completar retos el día del evento: ${url}\n\nTu código por si lo necesitas: ${guest.code}`;
}

function renderLinks() {
  const tbody = document.getElementById("links-tbody");
  tbody.innerHTML = db.guests
    .map(
      (g) => `
      <tr data-id="${g.id}">
        <td>${escapeHtml(g.first_name)}</td>
        <td>${escapeHtml(g.code)}</td>
        <td style="max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${guestUrl(g.code)}</td>
        <td><button class="icon-btn copy-link-btn">Copiar mensaje</button></td>
      </tr>
    `
    )
    .join("");

  tbody.querySelectorAll(".copy-link-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest("tr").dataset.id;
      const guest = db.guests.find((g) => g.id === id);
      await navigator.clipboard.writeText(whatsappMessage(guest));
      toast("Mensaje copiado.");
    });
  });
}

document.getElementById("export-csv").addEventListener("click", () => {
  const rows = [["Nombre", "Código", "Menú", "Restricciones"]];
  db.guests.forEach((g) => rows.push([g.first_name, g.code, menuLabel(g.menu_choice), g.dietary_notes || ""]));
  const escapeCell = (v) => `"${String(v).replace(/"/g, '""')}"`;
  // ";" en vez de "," — el hint "sep=," no lo respetan todas las versiones
  // de Excel/Sheets, mientras que ";" es el separador que Excel en
  // configuración regional en español reconoce de forma nativa (esa misma
  // configuración usa "," como separador decimal, por eso no usa la coma
  // para delimitar columnas). El BOM al inicio es para que tildes/ñ no
  // salgan corruptas en Excel.
  const csv = rows.map((r) => r.map(escapeCell).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "conteo-menu.csv";
  link.click();
});

// ---------------------------------------------------------------------------
// Exportar recuerdo
// ---------------------------------------------------------------------------

const COMBINING_MARKS_RE = new RegExp("[̀-ͯ]", "g");

function sanitizeFilename(s) {
  const clean = (s || "")
    .normalize("NFKD")
    .replace(COMBINING_MARKS_RE, "") // quita tildes, máxima compatibilidad al descomprimir
    .replace(/[\\/:*?"<>|]/g, "")
    .trim();
  return clean.slice(0, 80) || "sin-nombre";
}

function extensionFromUrl(url, mediaType) {
  const match = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(url || "");
  if (match) return match[1].toLowerCase();
  return mediaType === "video" ? "mp4" : "jpg";
}

els.exportZipBtn?.addEventListener("click", async () => {
  const btn = els.exportZipBtn;
  const originalText = btn.textContent;
  const items = db.submissions.filter((s) => s.photo_url && !s.is_hidden);

  if (items.length === 0) {
    toast("Todavía no hay fotos ni videos para exportar.", true);
    return;
  }

  btn.disabled = true;
  try {
    const { zipSync, strToU8 } = await import("https://esm.sh/fflate@0.8.2");

    const files = {};
    const usedNames = new Set();
    const summaryLines = [
      "Pasaporte de Boda — Nati & Leo",
      `Recuerdo exportado el ${new Date().toLocaleString("es-CO")}`,
      "",
    ];

    const challengesInUse = db.challenges.filter((c) => items.some((s) => s.challenge_id === c.id));

    let done = 0;
    for (const challenge of challengesInUse) {
      const folder = sanitizeFilename(challenge.title);
      summaryLines.push(`=== ${challenge.title} ===`, "");

      const challengeItems = items.filter((s) => s.challenge_id === challenge.id);
      for (const sub of challengeItems) {
        const guest = db.guests.find((g) => g.id === sub.guest_id);
        const guestName = guest?.first_name || "Invitado";
        const ext = extensionFromUrl(sub.photo_url, sub.media_type);

        const base = sanitizeFilename(guestName);
        let fileName = `${base}.${ext}`;
        let n = 2;
        while (usedNames.has(`${folder}/${fileName}`)) {
          fileName = `${base}-${n}.${ext}`;
          n++;
        }
        usedNames.add(`${folder}/${fileName}`);

        btn.textContent = `Descargando ${done + 1}/${items.length}…`;
        const res = await fetch(sub.photo_url);
        if (!res.ok) throw new Error(`no se pudo descargar ${sub.photo_url}`);
        files[`${folder}/${fileName}`] = new Uint8Array(await res.arrayBuffer());
        done++;

        const reactionsHere = db.reactions.filter((r) => r.submission_id === sub.id);
        const reactionCounts = reactionsHere.reduce((acc, r) => {
          acc[r.emoji] = (acc[r.emoji] || 0) + 1;
          return acc;
        }, {});
        const reactionSummary = Object.entries(reactionCounts)
          .map(([emoji, count]) => `${emoji} ${count}`)
          .join("  ") || "sin reacciones";

        const commentsHere = db.comments.filter((c) => c.submission_id === sub.id && !c.is_hidden);

        summaryLines.push(
          `- ${fileName} — ${guestName}${sub.media_type === "video" ? ` (video, ${sub.duration_seconds || 0}s)` : ""}`,
          `  Reacciones: ${reactionSummary}`
        );
        if (commentsHere.length) {
          summaryLines.push("  Comentarios:");
          commentsHere.forEach((c) => {
            const commenter = db.guests.find((g) => g.id === c.guest_id);
            summaryLines.push(`    · ${commenter?.first_name || "Invitado"}: ${c.text}`);
          });
        } else {
          summaryLines.push("  Comentarios: ninguno");
        }
        summaryLines.push("");
      }
    }

    files["comentarios-y-reacciones.txt"] = strToU8(summaryLines.join("\n"));

    btn.textContent = "Comprimiendo…";
    const zipped = zipSync(files, { level: 6 });

    const blob = new Blob([zipped], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pasaporte-boda-recuerdo-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);

    toast("¡Listo! Se descargó el ZIP.");
  } catch (err) {
    console.error(err);
    toast("No se pudo generar el ZIP. Intenta de nuevo.", true);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

async function boot() {
  await loadAll();
  els.loginScreen.style.display = "none";
  els.shell.classList.add("show");
  renderInvitadosStats();
  renderGuestsTable();
  renderGallery();
  renderRanking();
  renderTimer();
  renderRoles();
  renderLinks();
}

(async function init() {
  const { data } = await supabase.auth.getSession();
  if (data?.session) {
    await boot();
  }
})();
