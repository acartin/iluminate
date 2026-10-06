import { DOMAINS, GROUPS, MODES, PRESETS, PROTECTED_SURFACES } from "./catalog.mjs";
import { createPrompt, summarizeSelection } from "./prompt-engine.mjs";

const STORAGE_KEY = "iluminate-change-contract-v1";
const state = {
  objective: "",
  mode: "diagnose_implement",
  allowedDomainIds: [],
  protectedSurfaceIds: PROTECTED_SURFACES.map((surface) => surface.id),
  extraLimits: "",
  extraValidation: ""
};

const elements = {
  objective: document.querySelector("#objective"),
  mode: document.querySelector("#mode"),
  presets: document.querySelector("#presets"),
  groups: document.querySelector("#domain-groups"),
  surfaces: document.querySelector("#surface-grid"),
  search: document.querySelector("#domain-search"),
  extraLimits: document.querySelector("#extra-limits"),
  extraValidation: document.querySelector("#extra-validation"),
  output: document.querySelector("#prompt-output"),
  stats: document.querySelector("#selection-stats"),
  saveStatus: document.querySelector("#save-status"),
  toast: document.querySelector("#toast")
};

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!stored || typeof stored !== "object") return;
    state.objective = String(stored.objective || "");
    state.mode = MODES.some((mode) => mode.id === stored.mode) ? stored.mode : state.mode;
    state.allowedDomainIds = Array.isArray(stored.allowedDomainIds)
      ? stored.allowedDomainIds.filter((id) => DOMAINS.some((domain) => domain.id === id))
      : [];
    state.protectedSurfaceIds = Array.isArray(stored.protectedSurfaceIds)
      ? stored.protectedSurfaceIds.filter((id) => PROTECTED_SURFACES.some((surface) => surface.id === id))
      : state.protectedSurfaceIds;
    state.extraLimits = String(stored.extraLimits || "");
    state.extraValidation = String(stored.extraValidation || "");
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  elements.saveStatus.textContent = "Guardado local";
}

function option(value, label) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}

function renderModes() {
  elements.mode.replaceChildren(...MODES.map((mode) => option(mode.id, mode.label)));
  elements.mode.value = state.mode;
}

function renderPresets() {
  const buttons = PRESETS.map((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset";
    const title = document.createElement("strong");
    title.textContent = preset.label;
    const description = document.createElement("span");
    description.textContent = preset.description;
    button.append(title, description);
    button.addEventListener("click", () => applyPreset(preset));
    return button;
  });
  elements.presets.replaceChildren(...buttons);
}

function domainCard(domain) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "domain-card";
  button.dataset.domainId = domain.id;
  button.dataset.search = normalize([domain.label, domain.summary, ...(domain.keywords || [])].join(" "));
  button.setAttribute("aria-pressed", "false");

  const title = document.createElement("h4");
  title.textContent = domain.label;
  const badge = document.createElement("span");
  badge.className = "domain-state";
  const description = document.createElement("p");
  description.textContent = domain.summary;
  button.append(title, badge, description);
  button.addEventListener("click", () => toggleDomain(domain.id));
  return button;
}

function renderDomains() {
  const sections = GROUPS.map((group) => {
    const section = document.createElement("section");
    section.className = "domain-group";
    section.dataset.groupId = group.id;
    const header = document.createElement("div");
    header.className = "group-head";
    const title = document.createElement("h3");
    title.textContent = group.label;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.dataset.groupToggle = group.id;
    toggle.addEventListener("click", () => toggleGroup(group.id));
    header.append(title, toggle);
    const list = document.createElement("div");
    list.className = "domain-list";
    DOMAINS.filter((domain) => domain.group === group.id).forEach((domain) => list.append(domainCard(domain)));
    section.append(header, list);
    return section;
  });
  elements.groups.replaceChildren(...sections);
  updateDomainViews();
}

function renderSurfaces() {
  const labels = PROTECTED_SURFACES.map((surface) => {
    const label = document.createElement("label");
    label.className = "surface";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = state.protectedSurfaceIds.includes(surface.id);
    input.dataset.surfaceId = surface.id;
    input.addEventListener("change", () => toggleSurface(surface.id, input.checked));
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = surface.label;
    const status = document.createElement("small");
    status.textContent = input.checked ? "Protegida" : "Abierta por esta tarea";
    copy.append(title, status);
    label.append(input, copy);
    return label;
  });
  elements.surfaces.replaceChildren(...labels);
}

function toggleDomain(id) {
  const selected = new Set(state.allowedDomainIds);
  selected.has(id) ? selected.delete(id) : selected.add(id);
  state.allowedDomainIds = [...selected];
  update();
}

function toggleGroup(groupId) {
  const groupIds = DOMAINS.filter((domain) => domain.group === groupId).map((domain) => domain.id);
  const selected = new Set(state.allowedDomainIds);
  const allAllowed = groupIds.every((id) => selected.has(id));
  groupIds.forEach((id) => allAllowed ? selected.delete(id) : selected.add(id));
  state.allowedDomainIds = [...selected];
  update();
}

function toggleSurface(id, isProtected) {
  const protectedSet = new Set(state.protectedSurfaceIds);
  isProtected ? protectedSet.add(id) : protectedSet.delete(id);
  state.protectedSurfaceIds = [...protectedSet];
  update();
}

function applyPreset(preset) {
  state.allowedDomainIds = [...preset.domains];
  state.protectedSurfaceIds = PROTECTED_SURFACES.map((surface) => surface.id).filter((id) => !preset.unprotect.includes(id));
  renderSurfaces();
  update();
  showToast("Preset aplicado: " + preset.label);
}

function updateDomainViews() {
  const selected = new Set(state.allowedDomainIds);
  document.querySelectorAll("[data-domain-id]").forEach((card) => {
    const allowed = selected.has(card.dataset.domainId);
    card.classList.toggle("allowed", allowed);
    card.setAttribute("aria-pressed", String(allowed));
    card.querySelector(".domain-state").textContent = allowed ? "Permitido" : "Protegido";
  });
  GROUPS.forEach((group) => {
    const ids = DOMAINS.filter((domain) => domain.group === group.id).map((domain) => domain.id);
    const allowedCount = ids.filter((id) => selected.has(id)).length;
    const button = document.querySelector("[data-group-toggle='" + group.id + "']");
    if (button) button.textContent = allowedCount === ids.length ? "Proteger grupo" : "Permitir grupo";
  });
}

function filterDomains() {
  const query = normalize(elements.search.value);
  document.querySelectorAll("[data-domain-id]").forEach((card) => {
    card.hidden = Boolean(query) && !card.dataset.search.includes(query);
  });
  document.querySelectorAll(".domain-group").forEach((group) => {
    group.hidden = !group.querySelector("[data-domain-id]:not([hidden])");
  });
}

function renderStats() {
  const summary = summarizeSelection(state.allowedDomainIds);
  const values = [[summary.domains, "dominios"], [summary.paths, "rutas"], [summary.contexts, "contextos"], [summary.validations, "checks"]];
  elements.stats.replaceChildren(...values.map(([value, label]) => {
    const item = document.createElement("div");
    item.className = "stat";
    const number = document.createElement("b");
    number.textContent = value;
    const caption = document.createElement("span");
    caption.textContent = label;
    item.append(number, caption);
    return item;
  }));
}

function update() {
  updateDomainViews();
  document.querySelectorAll("[data-surface-id]").forEach((input) => {
    const checked = state.protectedSurfaceIds.includes(input.dataset.surfaceId);
    input.checked = checked;
    input.closest(".surface").querySelector("small").textContent = checked ? "Protegida" : "Abierta por esta tarea";
  });
  elements.output.value = createPrompt(state);
  renderStats();
  saveState();
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.remove("visible"), 1800);
}

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(elements.output.value);
  } catch {
    elements.output.select();
    document.execCommand("copy");
  }
  showToast("Prompt copiado");
}

function downloadPrompt() {
  const blob = new Blob([elements.output.value + "\n"], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "iluminate-change-contract.txt";
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Archivo descargado");
}

function resetForm() {
  state.objective = "";
  state.mode = "diagnose_implement";
  state.allowedDomainIds = [];
  state.protectedSurfaceIds = PROTECTED_SURFACES.map((surface) => surface.id);
  state.extraLimits = "";
  state.extraValidation = "";
  elements.objective.value = "";
  elements.mode.value = state.mode;
  elements.extraLimits.value = "";
  elements.extraValidation.value = "";
  elements.search.value = "";
  filterDomains();
  renderSurfaces();
  update();
  showToast("Formulario restablecido");
}

function bind() {
  elements.objective.addEventListener("input", () => { state.objective = elements.objective.value; update(); });
  elements.mode.addEventListener("change", () => { state.mode = elements.mode.value; update(); });
  elements.extraLimits.addEventListener("input", () => { state.extraLimits = elements.extraLimits.value; update(); });
  elements.extraValidation.addEventListener("input", () => { state.extraValidation = elements.extraValidation.value; update(); });
  elements.search.addEventListener("input", filterDomains);
  document.querySelector("#protect-all").addEventListener("click", () => {
    state.allowedDomainIds = [];
    state.protectedSurfaceIds = PROTECTED_SURFACES.map((surface) => surface.id);
    renderSurfaces();
    update();
  });
  document.querySelector("#copy-prompt").addEventListener("click", copyPrompt);
  document.querySelector("#download-prompt").addEventListener("click", downloadPrompt);
  document.querySelector("#reset-form").addEventListener("click", resetForm);
  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      copyPrompt();
    }
  });
}

loadState();
renderModes();
renderPresets();
renderDomains();
renderSurfaces();
elements.objective.value = state.objective;
elements.extraLimits.value = state.extraLimits;
elements.extraValidation.value = state.extraValidation;
bind();
update();
