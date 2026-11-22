(() => {
  "use strict";

  // Clés de stockage conservées pour rester compatible avec les données existantes
  const STORAGE_KEY = "vdi_pressing_deposits";
  const FEEDBACK_KEY = "vdi_pressing_feedback_prompted";
  const COUNTER_KEY = "vdi_pressing_ticket_counter";
  const SETTINGS_KEY = "dekrou_settings";
  const DEVICE_KEY = "dekrou_device_id";
  const LICENCE_KEY = "dekrou_licence";
  const CREATED_KEY = "dekrou_created_count";
  const BACKUP_DATE_KEY = "dekrou_last_backup";
  const BACKUP_CHANGES_KEY = "dekrou_changes_since_backup";
  // Rappel de sauvegarde : après ce nombre de jours ou de modifications
  const BACKUP_EVERY_DAYS = 7;
  const BACKUP_EVERY_CHANGES = 15;
  const FEEDBACK_AFTER = 3;
  const PHONE_PREFIX = "225";
  const APP_NAME = "DEKROU PRESSING";

  // Nombre de dépôts gratuits avant de demander une licence PRO
  const FREE_DEPOSITS = 30;

  // Clé PUBLIQUE de vérification des licences (ECDSA P-256).
  // Elle ne permet PAS de fabriquer des clés : seule la clé privée,
  // gardée hors-ligne dans le générateur, le peut.
  const LICENCE_PUBLIC_KEY = {"kty":"EC","crv":"P-256","x":"OAeK5MPyvWiCSujyWAJojirhR4C8Fa1P8ElWBFv3D-k","y":"KHtUZZTWA3MwFx1k3xM1Dz_kZFAfFkJKqQSFgWabmSQ"};
  const LICENCE_PREFIX = "DEKROU-PRO|";

  const $ = (id) => document.getElementById(id);
  const el = {
    form: $("depositForm"),
    name: $("clientName"),
    phone: $("clientPhone"),
    items: $("itemsDescription"),
    total: $("totalAmount"),
    advance: $("advanceAmount"),
    pickup: $("pickupDate"),
    balance: $("balanceDisplay"),
    ticket: $("ticketNumberDisplay"),
    list: $("depositsContainer"),
    count: $("depositCount"),
    search: $("searchInput"),
    stats: $("statsBar"),
    statBalance: $("statBalance"),
    statLate: $("statLate"),
    modal: $("feedbackModal"),
    settingsModal: $("settingsModal"),
    settingsForm: $("settingsForm"),
    setName: $("setName"),
    setPhone: $("setPhone"),
    setAddress: $("setAddress"),
    settingsLicenceStatus: $("settingsLicenceStatus"),
    importFile: $("importFile"),
    headerName: $("headerPressingName"),
    licenceModal: $("licenceModal"),
    licenceStatus: $("licenceStatus"),
    licenceForm: $("licenceForm"),
    licenceInput: $("licenceKeyInput"),
    deviceIdDisplay: $("deviceIdDisplay"),
    trialBanner: $("trialBanner"),
    trialText: $("trialText"),
    backupBanner: $("backupBanner"),
    backupText: $("backupText"),
    banner: $("pwaBanner"),
    toast: $("toastNotification"),
    toastIcon: $("toastIcon"),
    toastMsg: $("toastMessage"),
  };

  const fcfa = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  const fmtMoney = (n) => fcfa.format(n) + " FCFA";

  let deposits = [];
  let currentTicket = "";
  let deferredPrompt = null;
  let toastTimer = null;
  let settings = {};
  let isPro = false;

  // ---------- Utilitaires ----------
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

  // Date locale au format AAAA-MM-JJ (évite le décalage UTC de toISOString)
  const toISODate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // "2026-11-24" -> "24/11/2026" sans passer par new Date() (qui interprète en UTC)
  const fmtDate = (iso) => {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  const amount = (input) => Math.max(0, Math.round(parseFloat(input.value) || 0));
  const digitsOnly = (s) => String(s).replace(/\D/g, "");

  // Numéros ivoiriens : 10 chiffres. Accepte aussi une saisie avec 225 / +225 / 00225.
  function normalizePhone(raw) {
    let d = digitsOnly(raw);
    if (d.startsWith("00" + PHONE_PREFIX)) d = d.slice(5);
    else if (d.length > 10 && d.startsWith(PHONE_PREFIX)) d = d.slice(3);
    return d.length === 10 ? PHONE_PREFIX + d : null;
  }

  const prettyPhone = (full) => {
    const local = String(full || "").replace(new RegExp("^" + PHONE_PREFIX), "");
    return local ? "+225 " + local.replace(/(\d{2})(?=\d)/g, "$1 ") : "";
  };

  function showToast(message, icon = "✨") {
    el.toastMsg.textContent = message;
    el.toastIcon.textContent = icon;
    el.toast.classList.remove("opacity-0", "pointer-events-none", "translate-y-4");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.add("opacity-0", "pointer-events-none", "translate-y-4");
    }, 3500);
  }

  // ---------- Stockage ----------
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deposits));
      localStorage.setItem(BACKUP_CHANGES_KEY, String((parseInt(localStorage.getItem(BACKUP_CHANGES_KEY), 10) || 0) + 1));
      refreshBackupBanner();
      return true;
    } catch (e) {
      showToast("Stockage plein ou indisponible : données non sauvegardées.", "⚠️");
      return false;
    }
  }

  function loadDeposits() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      deposits = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      deposits = [];
    }
  }

  // ---------- Réglages du pressing ----------
  function loadSettings() {
    try {
      const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      settings = v && typeof v === "object" ? v : {};
    } catch (e) {
      settings = {};
    }
    el.headerName.textContent = settings.name || "Gestion des dépôts & Reçus WhatsApp";
  }

  function openSettings() {
    el.setName.value = settings.name || "";
    el.setPhone.value = settings.phone || "";
    el.setAddress.value = settings.address || "";
    openModal(el.settingsModal);
  }

  function saveSettings(e) {
    e.preventDefault();
    const name = el.setName.value.trim();
    if (!name) {
      showToast("Indiquez le nom de votre pressing.", "⚠️");
      el.setName.focus();
      return;
    }
    settings = { name, phone: el.setPhone.value.trim(), address: el.setAddress.value.trim() };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    loadSettings();
    closeModals();
    showToast("Réglages enregistrés.", "✅");
  }

  // ---------- Licence PRO ----------
  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!/^DKX-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(id || "")) {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O/1/I ambigus
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      const c = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
      id = `DKX-${c.slice(0, 4)}-${c.slice(4)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function b64urlToBytes(s) {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  }

  async function verifyLicence(deviceId, key) {
    const m = /^PRO-([A-Za-z0-9_-]{86})$/.exec(String(key || "").replace(/\s+/g, ""));
    if (!m || !window.crypto || !crypto.subtle) return false;
    try {
      const pub = await crypto.subtle.importKey(
        "jwk", LICENCE_PUBLIC_KEY, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]
      );
      return await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" }, pub, b64urlToBytes(m[1]),
        new TextEncoder().encode(LICENCE_PREFIX + deviceId)
      );
    } catch (e) {
      return false;
    }
  }

  const createdCount = () => parseInt(localStorage.getItem(CREATED_KEY), 10) || 0;
  const remainingFree = () => Math.max(0, FREE_DEPOSITS - createdCount());

  function refreshLicenceUI() {
    const left = remainingFree();
    el.trialBanner.classList.toggle("hidden", isPro);
    el.trialText.textContent = left > 0
      ? `Version d'essai : ${left} dépôt${left > 1 ? "s" : ""} gratuit${left > 1 ? "s" : ""} restant${left > 1 ? "s" : ""}`
      : "Essai terminé";
    el.settingsLicenceStatus.textContent = isPro ? "PRO activée ✅" : `Essai (${left} restants)`;
    el.licenceStatus.textContent = isPro
      ? "✅ Licence PRO activée sur cet appareil. Dépôts illimités."
      : `Version d'essai : ${left} dépôt(s) gratuit(s) restant(s). Envoyez l'ID ci-dessous pour recevoir votre clé PRO.`;
    el.licenceForm.classList.toggle("hidden", isPro);
  }

  function openLicence() {
    el.deviceIdDisplay.textContent = getDeviceId();
    el.licenceInput.value = "";
    refreshLicenceUI();
    openModal(el.licenceModal);
  }

  function requestLicence() {
    const msg =
      `🔑 *Demande de licence PRO — ${APP_NAME}*\n\n` +
      `🏪 *Pressing :* ${settings.name || "(non renseigné)"}\n` +
      (settings.phone ? `📞 *Téléphone :* ${settings.phone}\n` : "") +
      (settings.address ? `📍 *Adresse :* ${settings.address}\n` : "") +
      `📲 *ID Appareil :* ${getDeviceId()}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  }

  async function activateLicence() {
    const key = el.licenceInput.value.replace(/\s+/g, "");
    if (await verifyLicence(getDeviceId(), key)) {
      localStorage.setItem(LICENCE_KEY, key);
      isPro = true;
      refreshLicenceUI();
      showToast("Licence PRO activée. Merci !", "🎉");
      setTimeout(closeModals, 1200);
    } else {
      showToast("Clé invalide pour cet appareil.", "❌");
    }
  }

  async function checkLicence() {
    isPro = await verifyLicence(getDeviceId(), localStorage.getItem(LICENCE_KEY));
    refreshLicenceUI();
  }

  // ---------- Sauvegarde / restauration ----------
  function buildBackup() {
    return {
      app: "dekrou-pressing",
      version: 1,
      exportedAt: new Date().toISOString(),
      deposits,
      settings,
      deviceId: getDeviceId(),
      licence: localStorage.getItem(LICENCE_KEY) || "",
      ticketCounter: localStorage.getItem(COUNTER_KEY) || "",
      createdCount: createdCount(),
    };
  }

  function markBackedUp() {
    localStorage.setItem(BACKUP_DATE_KEY, new Date().toISOString());
    localStorage.setItem(BACKUP_CHANGES_KEY, "0");
    refreshBackupBanner();
  }

  // Sauvegarde en un geste : sur téléphone, ouvre le menu de partage
  // (WhatsApp « Moi », Google Drive, Gmail…) ; sinon télécharge le fichier.
  async function exportData() {
    const json = JSON.stringify(buildBackup(), null, 2);
    const base = `sauvegarde-${(settings.name || "pressing").replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}-${toISODate(new Date())}`;

    if (navigator.canShare) {
      // Certains téléphones refusent le type JSON : on essaie aussi en .txt
      const candidates = [
        new File([json], base + ".json", { type: "application/json" }),
        new File([json], base + ".txt", { type: "text/plain" }),
      ];
      const file = candidates.find((f) => navigator.canShare({ files: [f] }));
      if (file) {
        try {
          await navigator.share({
            files: [file],
            title: "Sauvegarde pressing",
            text: "Sauvegarde de mes fiches (à garder, ne pas supprimer).",
          });
          markBackedUp();
          showToast("Sauvegarde envoyée. Gardez-la précieusement.", "💾");
          return;
        } catch (e) {
          if (e && e.name === "AbortError") return; // partage annulé
        }
      }
    }

    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a.download = base + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    markBackedUp();
    showToast("Sauvegarde téléchargée.", "💾");
  }

  function refreshBackupBanner() {
    if (!el.backupBanner) return;
    const last = localStorage.getItem(BACKUP_DATE_KEY);
    const changes = parseInt(localStorage.getItem(BACKUP_CHANGES_KEY), 10) || 0;
    const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
    const due = deposits.length > 0 && (
      changes >= BACKUP_EVERY_CHANGES ||
      (days === null ? changes >= 3 : days >= BACKUP_EVERY_DAYS && changes > 0)
    );
    el.backupBanner.classList.toggle("hidden", !due);
    if (due) {
      el.backupText.textContent = days === null
        ? "Aucune sauvegarde : si vous perdez ce téléphone, vous perdez vos fiches."
        : `Dernière sauvegarde il y a ${days} jour${days > 1 ? "s" : ""} (${changes} modification${changes > 1 ? "s" : ""} depuis).`;
    }
  }

  const isValidDeposit = (d) =>
    d && typeof d === "object" && typeof d.id === "string" && typeof d.name === "string" &&
    typeof d.items === "string" && Number.isFinite(d.total) && Number.isFinite(d.balance);

  function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let data;
      try { data = JSON.parse(reader.result); } catch (e) { data = null; }
      if (!data || data.app !== "dekrou-pressing" || !Array.isArray(data.deposits)) {
        showToast("Fichier de sauvegarde invalide.", "❌");
        return;
      }
      const clean = data.deposits.filter(isValidDeposit).map((d) => ({
        id: d.id, ticket: String(d.ticket || ""), name: d.name, phone: String(d.phone || "").replace(/\D/g, ""),
        items: d.items, total: Math.max(0, d.total), advance: Math.max(0, Number(d.advance) || 0),
        balance: Math.max(0, d.balance), pickupDate: String(d.pickupDate || ""), createdAt: String(d.createdAt || ""),
        ...(/^\d{4}-\d{2}-\d{2}$/.test(d.readyAt || "") ? { readyAt: d.readyAt } : {}),
      }));
      if (!confirm(`Restaurer ${clean.length} fiche(s) ? Les fiches actuelles de ce téléphone seront remplacées.`)) return;

      deposits = clean;
      persist();
      if (data.settings && typeof data.settings === "object") {
        const st = data.settings;
        settings = { name: String(st.name || ""), phone: String(st.phone || ""), address: String(st.address || "") };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      }
      // L'ID appareil et la licence suivent la sauvegarde (changement de téléphone)
      if (/^DKX-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(data.deviceId || "")) localStorage.setItem(DEVICE_KEY, data.deviceId);
      if (data.licence) localStorage.setItem(LICENCE_KEY, String(data.licence));
      if (/^\d+$/.test(data.ticketCounter || "")) localStorage.setItem(COUNTER_KEY, data.ticketCounter);
      const restoredCount = Math.max(createdCount(), parseInt(data.createdCount, 10) || 0, clean.length);
      localStorage.setItem(CREATED_KEY, String(restoredCount));

      markBackedUp();
      loadSettings();
      await checkLicence();
      refreshTicket();
      renderDeposits();
      closeModals();
      showToast(`${clean.length} fiche(s) restaurée(s).`, "✅");
    };
    reader.readAsText(file);
    el.importFile.value = "";
  }

  // ---------- Ticket séquentiel (plus de collisions aléatoires) ----------
  function peekNextTicket() {
    let n = parseInt(localStorage.getItem(COUNTER_KEY), 10);
    if (!Number.isFinite(n)) {
      // Reprend après le plus grand numéro existant
      n = deposits.reduce((max, d) => {
        const v = parseInt(String(d.ticket || "").replace(/\D/g, ""), 10);
        return Number.isFinite(v) && v > max ? v : max;
      }, 1000);
    }
    return n + 1;
  }

  function refreshTicket() {
    currentTicket = `TICK-${peekNextTicket()}`;
    el.ticket.textContent = currentTicket;
  }

  function commitTicket() {
    localStorage.setItem(COUNTER_KEY, currentTicket.replace(/\D/g, ""));
  }

  // ---------- Formulaire ----------
  function setDefaultPickupDate() {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    el.pickup.value = toISODate(d);
    el.pickup.min = toISODate(new Date());
  }

  function calculateBalance() {
    const total = amount(el.total);
    const advance = amount(el.advance);
    el.balance.textContent = fmtMoney(Math.max(0, total - advance));
    el.advance.classList.toggle("border-rose-500", advance > total && total > 0);
  }

  function resetForm() {
    el.form.reset();
    el.balance.textContent = fmtMoney(0);
    el.advance.classList.remove("border-rose-500");
    setDefaultPickupDate();
    refreshTicket();
    el.name.focus();
  }

  function handleSubmit(e) {
    e.preventDefault();

    if (!settings.name) {
      showToast("Indiquez d'abord le nom de votre pressing.", "⚙️");
      openSettings();
      return;
    }
    if (!isPro && remainingFree() <= 0) {
      openLicence();
      return;
    }

    const name = el.name.value.trim();
    const items = el.items.value.trim();
    const total = amount(el.total);
    const advance = amount(el.advance);
    const pickupDate = el.pickup.value;
    const phone = normalizePhone(el.phone.value);

    if (!name || !items || total <= 0) {
      showToast("Veuillez remplir le nom, les articles et le montant.", "⚠️");
      (!name ? el.name : !items ? el.items : el.total).focus();
      return;
    }
    if (!phone) {
      showToast("Numéro WhatsApp invalide (10 chiffres attendus).", "⚠️");
      el.phone.focus();
      return;
    }
    if (advance > total) {
      showToast("L'avance ne peut pas dépasser le montant total.", "⚠️");
      el.advance.focus();
      return;
    }

    const deposit = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ticket: currentTicket,
      name,
      phone,
      items,
      total,
      advance,
      balance: total - advance,
      pickupDate,
      createdAt: new Date().toLocaleDateString("fr-FR"),
    };

    deposits.unshift(deposit);
    if (!persist()) {
      deposits.shift();
      return;
    }
    commitTicket();
    localStorage.setItem(CREATED_KEY, String(createdCount() + 1));
    refreshLicenceUI();

    // Ouvert de façon synchrone dans le geste utilisateur (évite le blocage des pop-ups)
    sendWhatsAppReceipt(deposit);
    renderDeposits();
    resetForm();
    showToast("Dépôt enregistré avec succès !", "✅");

    // Demande d'avis APRÈS l'enregistrement (avant, le dépôt était perdu)
    if (deposits.length >= FEEDBACK_AFTER && !localStorage.getItem(FEEDBACK_KEY)) {
      localStorage.setItem(FEEDBACK_KEY, "true");
      setTimeout(() => openModal(el.modal), 800);
    }
  }

  // ---------- WhatsApp ----------
  function sendWhatsAppReceipt(dep) {
    const msg =
      `🧺 *REÇU DE DÉPÔT — ${(settings.name || APP_NAME).toUpperCase()}*\n` +
      `-----------------------------------\n` +
      `🎫 *Ticket N° :* ${dep.ticket}\n` +
      `👤 *Client :* ${dep.name}\n` +
      `📦 *Articles :* ${dep.items}\n\n` +
      `💰 *Montant Total :* ${fmtMoney(dep.total)}\n` +
      `💵 *Avance Payée :* ${fmtMoney(dep.advance)}\n` +
      `🔴 *Reste à Payer :* *${fmtMoney(dep.balance)}*\n\n` +
      `📅 *Date de Retrait Prévue :* *${fmtDate(dep.pickupDate)}*\n` +
      `-----------------------------------\n` +
      (settings.address ? `📍 ${settings.address}\n` : "") +
      (settings.phone ? `📞 ${settings.phone}\n` : "") +
      `Merci pour votre confiance ! Merci de présenter ce message lors du retrait.\n` +
      `_Conformément à la loi n° 2013-450, vos coordonnées sont uniquement conservées pour la gestion de votre reçu._\n` +
      `_Reçu généré avec ${APP_NAME}_`;

    const phone = digitsOnly(dep.phone);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  }

  // Prévient le client que son linge est prêt (et rappelle le reste à payer)
  function sendReadyMessage(id) {
    const dep = findDeposit(id);
    if (!dep) return;
    const first = !dep.readyAt;
    const shop = settings.name || APP_NAME;
    const msg =
      `👋 Bonjour ${dep.name},\n\n` +
      (first
        ? `✅ *Votre linge est prêt* chez *${shop}* !\n\n`
        : `🔔 *Rappel* : votre linge vous attend chez *${shop}* depuis le ${fmtDate(dep.readyAt)}.\n\n`) +
      `🎫 *Ticket N° :* ${dep.ticket}\n` +
      `📦 *Articles :* ${dep.items}\n` +
      (dep.balance > 0
        ? `🔴 *Reste à payer au retrait :* *${fmtMoney(dep.balance)}*\n`
        : `🟢 *Déjà réglé* — rien à payer.\n`) +
      (settings.address ? `\n📍 ${settings.address}\n` : "") +
      (settings.phone ? `📞 ${settings.phone}\n` : "") +
      `\nMerci de présenter votre ticket lors du retrait. À bientôt !\n` +
      `_Message envoyé avec ${APP_NAME}_`;

    window.open(`https://wa.me/${digitsOnly(dep.phone)}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
    if (first) {
      dep.readyAt = toISODate(new Date());
      persist();
      renderDeposits();
    }
    showToast(first ? "Client prévenu : linge prêt." : "Rappel envoyé.", "🔔");
  }

  // ---------- Liste ----------
  function depositCard(dep, today) {
    const paid = dep.balance === 0;
    const late = dep.pickupDate && dep.pickupDate < today;
    const id = escapeHtml(dep.id);
    return `
      <article class="bg-slate-900 border ${late ? "border-rose-500/40" : "border-slate-800"} rounded-2xl p-4 space-y-3 shadow-lg">
        <div class="flex justify-between items-start gap-2 border-b border-slate-800 pb-2">
          <div class="min-w-0">
            <span class="font-mono font-bold text-sky-400 text-xs">${escapeHtml(dep.ticket)}</span>
            ${dep.readyAt ? `<span class="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/30">PRÊT le ${fmtDate(dep.readyAt).slice(0, 5)}</span>` : ""}
            <h4 class="font-bold text-sm text-white break-words">${escapeHtml(dep.name)}</h4>
            ${dep.phone ? `<span class="font-mono text-[11px] text-slate-500">${escapeHtml(prettyPhone(dep.phone))}</span>` : ""}
          </div>
          <span class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${paid
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
            : "bg-amber-500/10 text-amber-400 border-amber-500/30"}">
            ${paid ? "SOLDÉ" : "RESTE : " + fmtMoney(dep.balance)}
          </span>
        </div>

        <p class="text-xs text-slate-300 bg-slate-950 p-2 rounded-xl border border-slate-800/80 whitespace-pre-line break-words">${escapeHtml(dep.items)}</p>

        <div class="flex flex-wrap justify-between items-center gap-2 text-[11px] text-slate-400 pt-1">
          <span>Retrait : <strong class="${late ? "text-rose-400" : "text-slate-200"}">${fmtDate(dep.pickupDate)}${late ? " ⏰" : ""}</strong></span>
          <div class="flex flex-wrap justify-end gap-2">
            <button type="button" data-action="ready" data-id="${id}" class="${dep.readyAt
              ? "bg-slate-800 hover:bg-slate-700 text-sky-300 border-slate-700"
              : "bg-sky-600 hover:bg-sky-500 text-white border-sky-500"} border px-2.5 py-1 rounded-lg text-[10px] font-bold">${dep.readyAt ? "🔔 Relancer" : "🔔 Prêt"}</button>
            ${paid ? "" : `<button type="button" data-action="settle" data-id="${id}" class="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold">💵 Solder</button>`}
            <button type="button" data-action="resend" data-id="${id}" class="bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 px-2.5 py-1 rounded-lg text-[10px] font-bold">💬 Reçu</button>
            <button type="button" data-action="delete" data-id="${id}" aria-label="Supprimer la fiche" class="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold">🗑️</button>
          </div>
        </div>
      </article>`;
  }

  function renderDeposits() {
    const today = toISODate(new Date());
    const q = el.search.value.trim().toLowerCase();
    const qDigits = digitsOnly(q);

    const visible = !q ? deposits : deposits.filter((d) =>
      `${d.ticket} ${d.name} ${d.items}`.toLowerCase().includes(q) ||
      (qDigits.length >= 2 && String(d.phone || "").includes(qDigits))
    );

    const n = deposits.length;
    el.count.textContent = `${n} fiche${n > 1 ? "s" : ""}`;
    el.search.classList.toggle("hidden", n < 4);
    el.stats.classList.toggle("hidden", n === 0);
    el.statBalance.textContent = fmtMoney(deposits.reduce((s, d) => s + (d.balance || 0), 0));
    el.statLate.textContent = deposits.filter((d) => d.pickupDate && d.pickupDate < today).length;

    // Une seule écriture DOM (l'ancien `innerHTML +=` en boucle était en O(n²))
    el.list.innerHTML = visible.length
      ? visible.map((d) => depositCard(d, today)).join("")
      : `<div class="text-center py-8 text-slate-500 text-xs">${n ? "Aucun résultat." : "Aucun dépôt enregistré."}</div>`;
  }

  function findDeposit(id) {
    return deposits.find((d) => d.id === id);
  }

  function settleDeposit(id) {
    const dep = findDeposit(id);
    if (!dep || !confirm(`Confirmer l'encaissement de ${fmtMoney(dep.balance)} pour ${dep.name} ?`)) return;
    dep.advance = dep.total;
    dep.balance = 0;
    persist();
    renderDeposits();
    showToast("Paiement soldé.", "💵");
  }

  function deleteDeposit(id) {
    const dep = findDeposit(id);
    if (!dep || !confirm(`Supprimer la fiche ${dep.ticket} (${dep.name}) ?`)) return;
    deposits = deposits.filter((d) => d.id !== id);
    persist();
    renderDeposits();
    showToast("Fiche supprimée.", "🗑️");
  }

  // ---------- Modale retours ----------
  function openModal(m) {
    closeModals();
    m.classList.remove("hidden");
  }
  function closeModals() {
    document.querySelectorAll(".modal").forEach((m) => m.classList.add("hidden"));
  }

  function sendFeedbackWhatsApp() {
    const msg = `👋 Bonjour,\n\nVoici mes impressions et suggestions pour l'amélioration de l'application *DEKROU PRESSING* :\n\n- `;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
    closeModals();
  }

  // ---------- PWA ----------
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    el.banner.classList.remove("hidden");
  });

  window.addEventListener("appinstalled", () => el.banner.classList.add("hidden"));

  async function installPWA() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    el.banner.classList.add("hidden");
  }

  function registerServiceWorker() {
    // Un service worker doit être un vrai fichier servi en HTTPS (les URL blob: sont refusées)
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  // ---------- Événements (délégation, plus de onclick inline) ----------
  const actions = {
    "install": installPWA,
    "open-feedback": () => openModal(el.modal),
    "close-modal": closeModals,
    "open-settings": openSettings,
    "open-licence": openLicence,
    "request-licence": requestLicence,
    "activate-licence": activateLicence,
    "export": exportData,
    "import": () => el.importFile.click(),
    "send-feedback": sendFeedbackWhatsApp,
    "resend": (id) => { const d = findDeposit(id); if (d) sendWhatsAppReceipt(d); },
    "settle": settleDeposit,
    "ready": sendReadyMessage,
    "delete": deleteDeposit,
  };

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (btn && actions[btn.dataset.action]) actions[btn.dataset.action](btn.dataset.id);
    else if (e.target.classList.contains("modal")) closeModals();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModals();
  });

  el.form.addEventListener("submit", handleSubmit);
  el.settingsForm.addEventListener("submit", saveSettings);
  el.importFile.addEventListener("change", () => importData(el.importFile.files[0]));
  el.total.addEventListener("input", calculateBalance);
  el.advance.addEventListener("input", calculateBalance);
  el.search.addEventListener("input", renderDeposits);

  // Synchronise plusieurs onglets ouverts
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) { loadDeposits(); renderDeposits(); }
    if (e.key === COUNTER_KEY) refreshTicket();
    if (e.key === SETTINGS_KEY) loadSettings();
    if (e.key === LICENCE_KEY || e.key === CREATED_KEY) checkLicence();
  });

  // ---------- Démarrage ----------
  loadSettings();
  loadDeposits();
  // Les dépôts existants comptent dans la période d'essai
  if (localStorage.getItem(CREATED_KEY) === null) localStorage.setItem(CREATED_KEY, String(deposits.length));
  renderDeposits();
  checkLicence();
  refreshBackupBanner();
  // Demande au navigateur de ne pas effacer les données en cas de manque de place
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if (!settings.name) setTimeout(openSettings, 400);
  refreshTicket();
  setDefaultPickupDate();
  registerServiceWorker();
})();
