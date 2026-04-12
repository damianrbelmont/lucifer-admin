import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, deleteDoc, doc, getDoc, getFirestore, runTransaction, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyAALd99tyT-ILov22m1G58iforA3f-E628",
    authDomain: "nimroel-wiki.firebaseapp.com",
    projectId: "nimroel-wiki",
    storageBucket: "nimroel-wiki.firebasestorage.app",
    messagingSenderId: "499128220480",
    appId: "1:499128220480:web:e1da6cf1a6f306cd0458a5"
};

const firebaseConfig = window.WIKI_ADMIN_FIREBASE_CONFIG || window.LUCIFER_ADMIN_FIREBASE_CONFIG || window.NIMROEL_ADMIN_FIREBASE_CONFIG || DEFAULT_FIREBASE_CONFIG;
const ADMIN_UID = window.WIKI_ADMIN_UID || window.LUCIFER_ADMIN_UID || window.NIMROEL_ADMIN_UID || "ofe3AaZtvwd7KxY8MqG4182BZpo2";
const ADMIN_EMAIL = (window.WIKI_ADMIN_EMAIL || window.LUCIFER_ADMIN_EMAIL || window.NIMROEL_ADMIN_EMAIL || "damianr.belmont@gmail.com").toLowerCase();

const LUCIFER_TEMPLATE_BASE_URL = "https://damianrbelmont.github.io/lore/lucifer/templates/json/";
const LUCIFER_TEMPLATE_URLS = {
    character: `${LUCIFER_TEMPLATE_BASE_URL}character.base.json`,
    location: `${LUCIFER_TEMPLATE_BASE_URL}location.base.json`,
    event: `${LUCIFER_TEMPLATE_BASE_URL}event.base.json`,
    concept: `${LUCIFER_TEMPLATE_BASE_URL}concept.base.json`
};

const NIMROEL_TEMPLATES = {
    character: { id: "", type: "character", name: "", slug: "", meta: { title: "", description: "", image: "" }, alias: [], tags: [], relations: { characters: [], locations: [], events: [] }, content: { summary: "", sections: [] }, extra: { race: "", birth: "", death: "", affiliation: [] } },
    location: { id: "", type: "location", name: "", slug: "", meta: { title: "", description: "", image: "" }, tags: [], relations: { characters: [], locations: [], events: [] }, content: { summary: "", sections: [] } },
    event: { id: "", type: "event", name: "", slug: "", meta: { title: "", description: "", image: "" }, tags: [], relations: { characters: [], locations: [], events: [] }, content: { summary: "", sections: [] } },
    organization: { id: "", type: "organization", name: "", slug: "", meta: { title: "", description: "", image: "" }, alias: [], tags: [], relations: { characters: [], locations: [], events: [] }, content: { summary: "", sections: [] }, extra: { affiliation: [] } },
    creature: { id: "", type: "creature", name: "", slug: "", meta: { title: "", description: "", image: "" }, alias: [], tags: [], relations: { characters: [], locations: [], events: [] }, content: { summary: "", sections: [] }, extra: { race: "" } },
    artifact: { id: "", type: "artifact", name: "", slug: "", meta: { title: "", description: "", image: "" }, alias: [], tags: [], relations: { characters: [], locations: [], events: [] }, content: { summary: "", sections: [] } }
};

const RELATION_FIELD_BY_KEY = { characters: "relCharacters", locations: "relLocations", organizations: "relOrganizations", events: "relEvents", concepts: "relConcepts", artifacts: "relArtifacts", creatures: "relCreatures", related: "relRelated" };
const ALL_RELATION_KEYS = Object.keys(RELATION_FIELD_BY_KEY);

const WIKI_CONFIGS = {
    lucifer: { key: "lucifer", label: "Lucifer", types: ["character", "location", "event", "concept"], itemsCollection: window.LUCIFER_ITEMS_COLLECTION || "lucifer_items", indexDocument: window.LUCIFER_INDEX_DOCUMENT || "meta_lucifer/index", relationKeys: ["characters", "locations", "organizations", "events", "concepts", "related"], supportsAlias: true, supportsTags: true, templateLoader: loadLuciferTemplate },
    nimroel: { key: "nimroel", label: "Nimroel", types: ["character", "location", "event", "organization", "creature", "artifact"], itemsCollection: window.NIMROEL_ITEMS_COLLECTION || "items", indexDocument: window.NIMROEL_INDEX_DOCUMENT || "meta/index", relationKeys: ["characters", "locations", "events"], supportsAliasByType: new Set(["character", "organization", "creature", "artifact"]), supportsTags: true, templateLoader: loadNimroelTemplate }
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const ids = ["wikiSelect", "typeSelect", "newFromTemplateBtn", "reloadTemplateBtn", "templateStatus", "authStatus", "authBtn", "docId", "docSlug", "docName", "seoTitle", "seoDescription", "coverImage", "summaryField", "addUngroupedSectionBtn", "addGroupBtn", "ungroupedSections", "groupsContainer", "aliasField", "tagsField", "relCharacters", "relLocations", "relOrganizations", "relEvents", "relConcepts", "relArtifacts", "relCreatures", "relRelated", "extraRace", "extraBirth", "extraDeath", "extraAffiliation", "firebaseTargetId", "loadBtn", "createBtn", "saveBtn", "deleteBtn", "downloadBtn", "actionStatus", "loadedInfo", "applyAdvancedBtn", "formatAdvancedBtn", "advancedJson", "jsonPreview"];
const els = {};
ids.forEach((id) => { els[id] = document.getElementById(id); });

const state = { currentWiki: "lucifer", currentType: "character", isAuthorized: false, loadedDocId: "", workingPayload: null, templateCache: new Map(), sections: { ungrouped: [], groups: [] }, keySerial: 1, isHydrating: false };

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function clean(v) { return (v ?? "").toString().trim(); }
function multi(v) { return (v ?? "").toString().replace(/\r\n?/g, "\n").replace(/\\n/g, "\n").trim(); }
function parseList(v) { return [...new Set(multi(v).split(/[\n,]/).map((x) => x.trim()).filter(Boolean))]; }
function listText(v) { return Array.isArray(v) ? v.map((x) => clean(x)).filter(Boolean).join("\n") : ""; }
function safeName(v) { const s = clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, ""); return s || "entry"; }

function setStatus(el, msg, error = false) { el.textContent = msg; el.style.color = error ? "#ff8b8b" : ""; }
function getErrorMessage(error) {
    if (!error) return "Error desconocido.";
    const code = clean(error.code);
    const message = clean(error.message || error.toString());
    if (code && message) return `${code}: ${message}`;
    return message || "Error desconocido.";
}
function logOpError(operation, error, meta = {}) {
    console.error(`[unified-admin:${operation}]`, { ...meta, error });
}
function cfg() { return WIKI_CONFIGS[state.currentWiki]; }
function seg(path) { return (path || "").toString().split("/").map((x) => x.trim()).filter(Boolean); }
function collRef() { const s = seg(cfg().itemsCollection); if (!s.length) throw new Error("Coleccion vacia."); return collection(db, ...s); }
function itemRef(id) { const x = clean(id); if (!x) throw new Error("ID vacio."); return doc(collRef(), x); }
function indexRef() { const s = seg(cfg().indexDocument); if (s.length < 2 || s.length % 2 !== 0) throw new Error("indexDocument invalido."); return doc(db, ...s); }
function mk(prefix) { const k = `${prefix}_${state.keySerial}`; state.keySerial += 1; return k; }

function setControlVisible(controlId, visible) {
    const element = els[controlId];
    if (!element) return;
    const wrap = element.closest("div");
    (wrap || element).classList.toggle("is-hidden", !visible);
}

function applyVisibility() {
    const c = cfg();
    const t = clean(els.typeSelect.value).toLowerCase();
    const aliasVisible = c.key === "lucifer" ? c.supportsAlias : c.supportsAliasByType.has(t);
    setControlVisible("aliasField", aliasVisible);
    setControlVisible("tagsField", !!c.supportsTags);
    ALL_RELATION_KEYS.forEach((k) => setControlVisible(RELATION_FIELD_BY_KEY[k], c.relationKeys.includes(k)));
    setControlVisible("extraRace", c.key === "nimroel" && (t === "character" || t === "creature"));
    setControlVisible("extraBirth", c.key === "nimroel" && t === "character");
    setControlVisible("extraDeath", c.key === "nimroel" && t === "character");
    setControlVisible("extraAffiliation", c.key === "nimroel" && (t === "character" || t === "organization"));
}

function sectionDraft(initial = {}) {
    return { key: mk("s"), id: clean(initial.id), title: clean(initial.title || initial.tittle || initial.name), text: multi(initial.text || initial.description || "") };
}

function groupDraft(title = "") {
    return { key: mk("g"), title: clean(title), sections: [] };
}

function move(list, index, delta) {
    const next = index + delta;
    if (next < 0 || next >= list.length) return;
    const tmp = list[index];
    list[index] = list[next];
    list[next] = tmp;
}

function cardSection(section, handlers) {
    const card = document.createElement("div");
    card.className = "section-card";

    const head = document.createElement("div");
    head.className = "section-head";
    const p = document.createElement("p");
    p.className = "section-title-label";
    p.textContent = "Seccion";
    head.appendChild(p);

    const actions = document.createElement("div");
    actions.className = "section-actions";
    [["ARRIBA", handlers.up], ["ABAJO", handlers.down], ["ELIMINAR", handlers.del, true]].forEach(([txt, fn, danger]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = danger ? "mini-btn action-btn-danger" : "mini-btn";
        b.textContent = txt;
        b.addEventListener("click", fn);
        actions.appendChild(b);
    });
    head.appendChild(actions);
    card.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "section-grid";

    const fields = [
        ["Section id", "early_life", "id", false],
        ["Section title", "Vida temprana", "title", false],
        ["Section text", "Texto de la seccion", "text", true]
    ];

    fields.forEach(([label, placeholder, key, isText]) => {
        const wrap = document.createElement("div");
        if (isText) wrap.className = "full-col";
        const l = document.createElement("label");
        l.className = "field-label";
        l.textContent = label;
        wrap.appendChild(l);
        const input = isText ? document.createElement("textarea") : document.createElement("input");
        if (isText) {
            input.rows = 6;
            input.value = section[key];
        } else {
            input.type = "text";
            input.value = section[key];
        }
        input.placeholder = placeholder;
        input.addEventListener("input", () => {
            section[key] = key === "text" ? multi(input.value) : clean(input.value);
            refreshPreview();
        });
        wrap.appendChild(input);
        grid.appendChild(wrap);
    });

    card.appendChild(grid);
    return card;
}

function renderSections() {
    els.ungroupedSections.textContent = "";
    els.groupsContainer.textContent = "";

    if (!state.sections.ungrouped.length) {
        const p = document.createElement("p");
        p.className = "section-empty";
        p.textContent = "Sin secciones sin grupo.";
        els.ungroupedSections.appendChild(p);
    } else {
        state.sections.ungrouped.forEach((section, i) => {
            els.ungroupedSections.appendChild(cardSection(section, {
                up: () => { move(state.sections.ungrouped, i, -1); renderSections(); refreshPreview(); },
                down: () => { move(state.sections.ungrouped, i, 1); renderSections(); refreshPreview(); },
                del: () => { state.sections.ungrouped.splice(i, 1); renderSections(); refreshPreview(); }
            }));
        });
    }

    if (!state.sections.groups.length) {
        const p = document.createElement("p");
        p.className = "section-empty";
        p.textContent = "Sin grupos por ahora.";
        els.groupsContainer.appendChild(p);
        return;
    }

    state.sections.groups.forEach((group, gi) => {
        const card = document.createElement("div");
        card.className = "group-card";

        const head = document.createElement("div");
        head.className = "group-header";
        const h3 = document.createElement("h3");
        h3.textContent = `Grupo ${gi + 1}`;
        head.appendChild(h3);

        const controls = document.createElement("div");
        controls.className = "group-controls";
        [["ARRIBA", () => { move(state.sections.groups, gi, -1); renderSections(); refreshPreview(); }], ["ABAJO", () => { move(state.sections.groups, gi, 1); renderSections(); refreshPreview(); }], ["ELIMINAR", () => { state.sections.groups.splice(gi, 1); renderSections(); refreshPreview(); }, true]].forEach(([txt, fn, danger]) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = danger ? "mini-btn action-btn-danger" : "mini-btn";
            b.textContent = txt;
            b.addEventListener("click", fn);
            controls.appendChild(b);
        });
        head.appendChild(controls);
        card.appendChild(head);

        const name = document.createElement("input");
        name.type = "text";
        name.className = "group-name-input";
        name.placeholder = "Nombre del grupo";
        name.value = group.title;
        name.addEventListener("input", () => { group.title = clean(name.value); refreshPreview(); });
        card.appendChild(name);

        const add = document.createElement("button");
        add.type = "button";
        add.className = "mini-btn";
        add.textContent = "ANADIR SECCION";
        add.addEventListener("click", () => { group.sections.push(sectionDraft({})); renderSections(); refreshPreview(); });
        card.appendChild(add);

        const stack = document.createElement("div");
        stack.className = "sections-stack";

        if (!group.sections.length) {
            const p = document.createElement("p");
            p.className = "section-empty";
            p.textContent = "Sin secciones en este grupo.";
            stack.appendChild(p);
        } else {
            group.sections.forEach((section, si) => {
                stack.appendChild(cardSection(section, {
                    up: () => { move(group.sections, si, -1); renderSections(); refreshPreview(); },
                    down: () => { move(group.sections, si, 1); renderSections(); refreshPreview(); },
                    del: () => { group.sections.splice(si, 1); renderSections(); refreshPreview(); }
                }));
            });
        }

        card.appendChild(stack);
        els.groupsContainer.appendChild(card);
    });
}

function sectionsFromPayload(payload) {
    const next = { ungrouped: [], groups: [] };
    const source = Array.isArray(payload?.content?.sections) ? payload.content.sections : (Array.isArray(payload?.sections) ? payload.sections : []);
    const map = new Map();

    source.forEach((raw, i) => {
        const sec = sectionDraft({ id: raw?.id || `section_${i + 1}`, title: raw?.title || raw?.tittle || `Seccion ${i + 1}`, text: raw?.text || "" });
        const g = clean(raw?.groupTitle || raw?.group || "");
        if (!g) {
            next.ungrouped.push(sec);
            return;
        }
        const key = g.toLowerCase();
        if (!map.has(key)) {
            const group = groupDraft(g);
            map.set(key, group);
            next.groups.push(group);
        }
        map.get(key).sections.push(sec);
    });

    state.sections = next;
    renderSections();
}

function collectSections(strict = false) {
    const out = [];
    const used = new Set();
    const push = (section, groupTitle = "") => {
        const id = clean(section.id);
        const title = clean(section.title);
        const text = multi(section.text);
        if (!id && !title && !text) return;
        if (strict && (!id || !title || !text)) throw new Error("Cada seccion debe tener id, title y text.");
        if (id) {
            if (used.has(id)) throw new Error(`ID de seccion repetido: ${id}`);
            used.add(id);
        }
        const row = { id, title, text };
        const g = clean(groupTitle);
        if (g) row.groupTitle = g;
        out.push(row);
    };

    state.sections.ungrouped.forEach((s) => push(s));
    state.sections.groups.forEach((g) => g.sections.forEach((s) => push(s, g.title)));
    return out;
}

function buildLuciferPayload(strict = false) {
    const id = clean(els.docId.value);
    const slug = clean(els.docSlug.value);
    const title = clean(els.docName.value);
    const type = clean(els.typeSelect.value).toLowerCase();
    if (strict && !id) throw new Error("Falta id.");
    if (strict && !slug) throw new Error("Falta slug.");
    if (strict && !title) throw new Error("Falta name/title.");

    const payload = isObj(state.workingPayload) ? clone(state.workingPayload) : {};
    payload.id = id;
    payload.slug = slug;
    payload.type = type;
    payload.universe = "lucifer";
    payload.title = title;
    payload.image = clean(els.coverImage.value);
    payload.alias = parseList(els.aliasField.value);
    payload.tags = parseList(els.tagsField.value);

    payload.seo = isObj(payload.seo) ? payload.seo : {};
    payload.seo.title = clean(els.seoTitle.value);
    payload.seo.description = multi(els.seoDescription.value);
    payload.seo.image = payload.image;

    payload.content = isObj(payload.content) ? payload.content : {};
    payload.content.summary = multi(els.summaryField.value);
    payload.content.sections = collectSections(strict);

    payload.excerpt = clean(payload.excerpt || payload.content.summary);
    payload.description = clean(payload.description || payload.seo.description || payload.content.summary);

    payload.relations = isObj(payload.relations) ? payload.relations : {};
    ALL_RELATION_KEYS.forEach((k) => {
        const field = els[RELATION_FIELD_BY_KEY[k]];
        payload.relations[k] = parseList(field.value);
    });

    payload.paths = isObj(payload.paths) ? payload.paths : {};
    const folder = clean(payload.section) || (type ? `${type}s` : "misc");
    if (id) payload.paths.json = `${folder}/${id}.json`;
    if (slug) payload.paths.html = `${slug}.html`;
    if (id) payload.paths.url = `?id=${encodeURIComponent(id)}`;

    payload.publication = isObj(payload.publication) ? payload.publication : {};
    const statusRaw = clean(payload.publication.status).toLowerCase();
    const visibilityRaw = clean(payload.publication.visibility).toLowerCase();
    payload.publication.status = (statusRaw === "published" || statusRaw === "draft") ? statusRaw : "published";
    payload.publication.visibility = (visibilityRaw === "public" || visibilityRaw === "private") ? visibilityRaw : "public";
    payload.publication.updatedAt = new Date().toISOString();
    payload.publication.version = Number.isFinite(Number(payload.publication.version)) ? Number(payload.publication.version) : 1;

    return payload;
}

function buildNimroelPayload(strict = false) {
    const id = clean(els.docId.value);
    const slug = clean(els.docSlug.value);
    const name = clean(els.docName.value);
    const type = clean(els.typeSelect.value).toLowerCase();

    if (strict && !id) throw new Error("Falta id.");
    if (strict && !slug) throw new Error("Falta slug.");
    if (strict && !name) throw new Error("Falta name/title.");

    const raw = {
        id,
        type,
        name,
        slug,
        meta: {
            title: clean(els.seoTitle.value),
            description: multi(els.seoDescription.value),
            image: clean(els.coverImage.value)
        },
        alias: parseList(els.aliasField.value),
        tags: parseList(els.tagsField.value),
        relations: {
            characters: parseList(els.relCharacters.value),
            locations: parseList(els.relLocations.value),
            events: parseList(els.relEvents.value)
        },
        content: {
            summary: multi(els.summaryField.value),
            sections: collectSections(strict)
        },
        extra: {
            race: clean(els.extraRace.value),
            birth: clean(els.extraBirth.value),
            death: clean(els.extraDeath.value),
            affiliation: parseList(els.extraAffiliation.value)
        }
    };

    if (type === "character") return raw;
    if (type === "location" || type === "event") {
        return { id: raw.id, type, name: raw.name, slug: raw.slug, meta: raw.meta, tags: raw.tags, relations: raw.relations, content: raw.content };
    }
    if (type === "organization") {
        return { id: raw.id, type, name: raw.name, slug: raw.slug, meta: raw.meta, alias: raw.alias, tags: raw.tags, relations: raw.relations, content: raw.content, extra: { affiliation: raw.extra.affiliation } };
    }
    if (type === "creature") {
        return { id: raw.id, type, name: raw.name, slug: raw.slug, meta: raw.meta, alias: raw.alias, tags: raw.tags, relations: raw.relations, content: raw.content, extra: { race: raw.extra.race } };
    }
    if (type === "artifact") {
        return { id: raw.id, type, name: raw.name, slug: raw.slug, meta: raw.meta, alias: raw.alias, tags: raw.tags, relations: raw.relations, content: raw.content };
    }
    return raw;
}

function buildPayload(strict = false) {
    return state.currentWiki === "nimroel" ? buildNimroelPayload(strict) : buildLuciferPayload(strict);
}

function fillForm(payload) {
    const c = cfg();
    const t = clean(payload?.type || c.types[0] || "").toLowerCase();

    state.isHydrating = true;
    if ([...els.typeSelect.options].some((option) => option.value === t)) {
        els.typeSelect.value = t;
        state.currentType = t;
    }

    els.docId.value = clean(payload?.id);
    els.docSlug.value = clean(payload?.slug);

    if (c.key === "lucifer") {
        els.docName.value = clean(payload?.title || payload?.name);
        els.seoTitle.value = clean(payload?.seo?.title || payload?.title);
        els.seoDescription.value = clean(payload?.seo?.description || payload?.description);
        els.coverImage.value = clean(payload?.image || payload?.seo?.image);
        els.summaryField.value = clean(payload?.content?.summary || payload?.excerpt || payload?.description);
    } else {
        els.docName.value = clean(payload?.name || payload?.title);
        els.seoTitle.value = clean(payload?.meta?.title || payload?.name);
        els.seoDescription.value = clean(payload?.meta?.description || payload?.description);
        els.coverImage.value = clean(payload?.meta?.image || payload?.image);
        els.summaryField.value = clean(payload?.content?.summary || payload?.summary);
    }

    els.aliasField.value = listText(payload?.alias || payload?.aliases);
    els.tagsField.value = listText(payload?.tags);

    ALL_RELATION_KEYS.forEach((k) => {
        const field = els[RELATION_FIELD_BY_KEY[k]];
        field.value = listText(payload?.relations?.[k]);
    });

    els.extraRace.value = clean(payload?.extra?.race || payload?.race);
    els.extraBirth.value = clean(payload?.extra?.birth || payload?.birth);
    els.extraDeath.value = clean(payload?.extra?.death || payload?.death);
    els.extraAffiliation.value = listText(payload?.extra?.affiliation || payload?.affiliation);

    sectionsFromPayload(payload);
    applyVisibility();
    state.isHydrating = false;
    refreshPreview();
}

function refreshPreview() {
    if (state.isHydrating) return;
    try {
        const payload = buildPayload(false);
        state.workingPayload = clone(payload);
        const text = JSON.stringify(payload, null, 2);
        els.jsonPreview.textContent = text;
        els.advancedJson.value = text;
    } catch {
        els.jsonPreview.textContent = "{}";
    }
}

function downloadJson() {
    try {
        const payload = buildPayload(false);
        const fileName = `${safeName(payload.id || payload.slug || payload.type || "entry")}.json`;
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setStatus(els.actionStatus, "JSON descargado.");
    } catch (error) {
        setStatus(els.actionStatus, error.message || "No se pudo generar JSON.", true);
    }
}

function formatAdvancedJson() {
    const raw = clean(els.advancedJson.value);
    if (!raw) return;
    try {
        els.advancedJson.value = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
        setStatus(els.actionStatus, "No se pudo formatear: JSON invalido.", true);
    }
}

function applyAdvancedJson() {
    const raw = clean(els.advancedJson.value);
    if (!raw) {
        setStatus(els.actionStatus, "El JSON avanzado esta vacio.", true);
        return;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!isObj(parsed)) {
            setStatus(els.actionStatus, "El JSON avanzado debe ser un objeto.", true);
            return;
        }
        if (clean(parsed.type)) {
            const nextType = clean(parsed.type).toLowerCase();
            if ([...els.typeSelect.options].some((option) => option.value === nextType)) {
                els.typeSelect.value = nextType;
                state.currentType = nextType;
            }
        }
        state.workingPayload = clone(parsed);
        fillForm(parsed);
        setStatus(els.actionStatus, "JSON avanzado aplicado al formulario.");
    } catch {
        setStatus(els.actionStatus, "JSON avanzado invalido.", true);
    }
}

async function loadLuciferTemplate(type, forceReload = false) {
    const key = `lucifer:${type}`;
    if (!forceReload && state.templateCache.has(key)) return clone(state.templateCache.get(key));
    const url = LUCIFER_TEMPLATE_URLS[type];
    if (!url) throw new Error(`Tipo Lucifer no soportado: ${type}`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`No se pudo descargar plantilla (${response.status}).`);
    const template = await response.json();
    if (!isObj(template)) throw new Error("Plantilla Lucifer invalida.");
    state.templateCache.set(key, clone(template));
    return clone(template);
}

async function loadNimroelTemplate(type) {
    if (!NIMROEL_TEMPLATES[type]) throw new Error(`Tipo Nimroel no soportado: ${type}`);
    return clone(NIMROEL_TEMPLATES[type]);
}

async function loadTemplate(forceReload = false) {
    const type = clean(els.typeSelect.value).toLowerCase();
    const c = cfg();
    state.currentType = type;
    setStatus(els.templateStatus, "Cargando plantilla...");
    const template = await c.templateLoader(type, forceReload);
    template.type = type;
    if (c.key === "lucifer") {
        template.publication = isObj(template.publication) ? template.publication : {};
        template.publication.status = "published";
        template.publication.visibility = "public";
    }
    state.loadedDocId = "";
    state.workingPayload = clone(template);
    els.firebaseTargetId.value = "";
    els.loadedInfo.textContent = "Ningun documento cargado.";
    fillForm(template);
    setStatus(els.templateStatus, `Plantilla cargada (${c.label}/${type}).`);
}

function populateTypes() {
    const c = cfg();
    els.typeSelect.textContent = "";
    c.types.forEach((type) => {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = type;
        els.typeSelect.appendChild(option);
    });
    state.currentType = c.types.includes(state.currentType) ? state.currentType : c.types[0];
    els.typeSelect.value = state.currentType;
}

function isAuthorizedUser(user) {
    return !!user && user.uid === ADMIN_UID && (user.email || "").toLowerCase() === ADMIN_EMAIL;
}

function setAuthMode(mode) {
    els.authBtn.dataset.mode = mode;
    els.authBtn.textContent = mode === "logout" ? "CERRAR SESION FIREBASE" : "INICIAR SESION FIREBASE";
}

function setFirebaseButtons(enabled) {
    [els.loadBtn, els.createBtn, els.saveBtn, els.deleteBtn].forEach((b) => { b.disabled = !enabled; });
}

function ensureAuth() {
    const ok = state.isAuthorized && isAuthorizedUser(auth.currentUser);
    if (!ok) setStatus(els.actionStatus, "Debes iniciar sesion con la cuenta autorizada.", true);
    return ok;
}

function luciferSnippet(payload) {
    const id = clean(payload?.id);
    const slug = clean(payload?.slug);
    const title = clean(payload?.title || payload?.name);
    const type = clean(payload?.type);
    const section = clean(payload?.section).replace(/^\/+|\/+$/g, "");
    const subsection = clean(payload?.subsection);
    const excerpt = clean(payload?.excerpt || payload?.content?.summary || payload?.description);
    const image = clean(payload?.image || payload?.seo?.image);
    const status = clean(payload?.publication?.status).toLowerCase() === "published" ? "published" : "draft";
    const visibility = clean(payload?.publication?.visibility).toLowerCase() === "public" ? "public" : "private";
    const folder = section || (type ? `${type}s` : "misc");
    return { id, slug, title, type, section, subsection, excerpt, image, path: `${folder}/${id}.json`, status, visibility };
}

function normalizeNimIndex(data) {
    const out = {};
    if (isObj(data)) {
        Object.entries(data).forEach(([k, v]) => {
            if (!Array.isArray(v)) return;
            out[k] = [...new Set(v.map((x) => clean(x)).filter(Boolean))];
        });
    }
    if (!out.characters) out.characters = [];
    if (!out.locations) out.locations = [];
    if (!out.organizations) out.organizations = [];
    return out;
}

function nimIndexKey(type) {
    const raw = clean(type).toLowerCase();
    if (!raw) return null;
    const aliases = { character: "characters", characters: "characters", location: "locations", locations: "locations", organization: "organizations", organizations: "organizations" };
    if (aliases[raw]) return aliases[raw];
    if (raw.endsWith("y")) return `${raw.slice(0, -1)}ies`;
    return raw.endsWith("s") ? raw : `${raw}s`;
}

function removeFromAll(indexData, id) {
    Object.keys(indexData).forEach((k) => {
        if (Array.isArray(indexData[k])) indexData[k] = indexData[k].filter((x) => x !== id);
    });
}

function sortBuckets(indexData) {
    Object.keys(indexData).forEach((k) => {
        if (Array.isArray(indexData[k])) indexData[k] = [...new Set(indexData[k])].sort((a, b) => a.localeCompare(b));
    });
}

async function upsertIndex(payload) {
    const wiki = state.currentWiki;
    const indexPath = cfg().indexDocument;
    try {
        if (wiki === "nimroel") {
            const id = clean(payload?.id);
            const key = nimIndexKey(payload?.type);
            if (!key) throw new Error("No se pudo resolver bucket de indice Nimroel.");
            await runTransaction(db, async (t) => {
                const ref = indexRef();
                const snap = await t.get(ref);
                const data = normalizeNimIndex(snap.exists() ? snap.data() : {});
                removeFromAll(data, id);
                if (!Array.isArray(data[key])) data[key] = [];
                data[key].push(id);
                sortBuckets(data);
                t.set(ref, data);
            });
            return;
        }

        const snippet = luciferSnippet(payload);
        await runTransaction(db, async (t) => {
            const ref = indexRef();
            const snap = await t.get(ref);
            const raw = snap.exists() ? (snap.data() || {}) : {};
            const current = Array.isArray(raw.entries) ? raw.entries.filter((e) => isObj(e) && clean(e.id)) : [];
            const merged = current.filter((e) => clean(e.id) !== snippet.id);
            merged.push(snippet);
            merged.sort((a, b) => clean(a.title).localeCompare(clean(b.title), "es", { sensitivity: "base" }));
            t.set(ref, { ...raw, entries: merged });
        });
    } catch (error) {
        logOpError("upsertIndex", error, { wiki, indexPath, id: clean(payload?.id) });
        throw error;
    }
}

async function removeIndex(id) {
    const cleanId = clean(id);
    const wiki = state.currentWiki;
    const indexPath = cfg().indexDocument;
    try {
        if (wiki === "nimroel") {
            await runTransaction(db, async (t) => {
                const ref = indexRef();
                const snap = await t.get(ref);
                if (!snap.exists()) return;
                const data = normalizeNimIndex(snap.data());
                removeFromAll(data, cleanId);
                sortBuckets(data);
                t.set(ref, data);
            });
            return;
        }

        await runTransaction(db, async (t) => {
            const ref = indexRef();
            const snap = await t.get(ref);
            if (!snap.exists()) return;
            const raw = snap.data() || {};
            const current = Array.isArray(raw.entries) ? raw.entries.filter((e) => isObj(e) && clean(e.id)) : [];
            t.set(ref, { ...raw, entries: current.filter((e) => clean(e.id) !== cleanId) });
        });
    } catch (error) {
        logOpError("removeIndex", error, { wiki, indexPath, id: cleanId });
        throw error;
    }
}

async function login() {
    setStatus(els.authStatus, "Abriendo login...");
    els.authBtn.disabled = true;
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        logOpError("login", error);
        setStatus(els.authStatus, `No se pudo iniciar sesion. ${getErrorMessage(error)}`, true);
    } finally {
        els.authBtn.disabled = false;
    }
}

async function logout() {
    setStatus(els.authStatus, "Cerrando sesion...");
    els.authBtn.disabled = true;
    try {
        await signOut(auth);
    } catch (error) {
        logOpError("logout", error);
        setStatus(els.authStatus, `No se pudo cerrar sesion. ${getErrorMessage(error)}`, true);
    } finally {
        els.authBtn.disabled = false;
    }
}

async function loadDoc() {
    if (!ensureAuth()) return;
    const targetId = clean(els.firebaseTargetId.value || els.docId.value);
    if (!targetId) return setStatus(els.actionStatus, "Indica un ID para cargar.", true);
    try {
        const snap = await getDoc(itemRef(targetId));
        if (!snap.exists()) return setStatus(els.actionStatus, `No existe el documento ${targetId}.`, true);
        const payload = { id: targetId, ...snap.data() };
        state.loadedDocId = targetId;
        state.workingPayload = clone(payload);
        els.firebaseTargetId.value = targetId;
        els.loadedInfo.textContent = `Documento cargado: ${targetId}`;
        fillForm(payload);
        setStatus(els.actionStatus, `Documento cargado desde ${cfg().label}.`);
    } catch (error) {
        logOpError("loadDoc", error, { wiki: state.currentWiki, collection: cfg().itemsCollection, id: targetId });
        setStatus(els.actionStatus, `Error al cargar desde Firebase: ${getErrorMessage(error)}`, true);
    }
}

async function createDoc() {
    if (!ensureAuth()) return;
    let payload;
    try { payload = buildPayload(true); } catch (error) { return setStatus(els.actionStatus, error.message, true); }
    const id = clean(payload?.id);
    if (!id) return setStatus(els.actionStatus, "El payload necesita id.", true);

    try {
        console.info("[unified-admin:createDoc:start]", {
            wiki: state.currentWiki,
            id,
            collection: cfg().itemsCollection,
            indexDocument: cfg().indexDocument
        });
        const ref = itemRef(id);
        const exists = await getDoc(ref);
        if (exists.exists()) return setStatus(els.actionStatus, `El ID ${id} ya existe. Usa guardar cambios.`, true);
        await setDoc(ref, payload);
        console.info("[unified-admin:createDoc:itemCreated]", { wiki: state.currentWiki, id, collection: cfg().itemsCollection });
        try {
            await upsertIndex(payload);
        } catch (indexError) {
            logOpError("createDoc.index", indexError, { wiki: state.currentWiki, id, indexDocument: cfg().indexDocument });
            const detail = getErrorMessage(indexError);
            if (state.currentWiki === "lucifer") {
                setStatus(
                    els.actionStatus,
                    `Documento creado en ${cfg().itemsCollection}/${id}, pero fallo actualizando indice ${cfg().indexDocument}: ${detail}`,
                    true
                );
                state.loadedDocId = id;
                state.workingPayload = clone(payload);
                els.firebaseTargetId.value = id;
                els.loadedInfo.textContent = `Documento cargado: ${id}`;
                return;
            }
            throw indexError;
        }
        state.loadedDocId = id;
        state.workingPayload = clone(payload);
        els.firebaseTargetId.value = id;
        els.loadedInfo.textContent = `Documento cargado: ${id}`;
        setStatus(els.actionStatus, `Documento creado en ${cfg().label} e indice actualizado.`);
    } catch (error) {
        logOpError("createDoc", error, { wiki: state.currentWiki, collection: cfg().itemsCollection, indexDocument: cfg().indexDocument, id });
        setStatus(els.actionStatus, `Error al crear en Firebase: ${getErrorMessage(error)}`, true);
    }
}

async function saveDoc() {
    if (!ensureAuth()) return;
    if (!state.loadedDocId) return setStatus(els.actionStatus, "Primero carga un documento para guardar cambios.", true);

    let payload;
    try { payload = buildPayload(true); } catch (error) { return setStatus(els.actionStatus, error.message, true); }
    const id = clean(payload?.id);
    if (!id) return setStatus(els.actionStatus, "El payload necesita id.", true);
    if (id !== state.loadedDocId) return setStatus(els.actionStatus, "El ID actual no coincide con el documento cargado.", true);

    try {
        console.info("[unified-admin:saveDoc:start]", {
            wiki: state.currentWiki,
            id,
            collection: cfg().itemsCollection,
            indexDocument: cfg().indexDocument
        });
        const ref = itemRef(id);
        const exists = await getDoc(ref);
        if (!exists.exists()) return setStatus(els.actionStatus, "El documento ya no existe en Firebase.", true);
        await setDoc(ref, payload);
        try {
            await upsertIndex(payload);
        } catch (indexError) {
            logOpError("saveDoc.index", indexError, { wiki: state.currentWiki, id, indexDocument: cfg().indexDocument });
            if (state.currentWiki === "lucifer") {
                setStatus(
                    els.actionStatus,
                    `Cambios guardados en ${cfg().itemsCollection}/${id}, pero fallo actualizando indice ${cfg().indexDocument}: ${getErrorMessage(indexError)}`,
                    true
                );
                state.workingPayload = clone(payload);
                return;
            }
            throw indexError;
        }
        state.workingPayload = clone(payload);
        setStatus(els.actionStatus, "Cambios guardados e indice actualizado.");
    } catch (error) {
        logOpError("saveDoc", error, { wiki: state.currentWiki, collection: cfg().itemsCollection, indexDocument: cfg().indexDocument, id });
        setStatus(els.actionStatus, `Error al guardar cambios: ${getErrorMessage(error)}`, true);
    }
}

async function deleteDocFromFirebase() {
    if (!ensureAuth()) return;
    const id = clean(els.firebaseTargetId.value || state.loadedDocId || els.docId.value);
    if (!id) return setStatus(els.actionStatus, "Indica un ID para eliminar.", true);
    if (!window.confirm(`Vas a eliminar ${cfg().itemsCollection}/${id}. Continuar?`)) return;

    try {
        console.info("[unified-admin:deleteDoc:start]", {
            wiki: state.currentWiki,
            id,
            collection: cfg().itemsCollection,
            indexDocument: cfg().indexDocument
        });
        await deleteDoc(itemRef(id));
        try {
            await removeIndex(id);
        } catch (indexError) {
            logOpError("deleteDoc.index", indexError, { wiki: state.currentWiki, id, indexDocument: cfg().indexDocument });
            if (state.currentWiki === "lucifer") {
                if (state.loadedDocId === id) {
                    state.loadedDocId = "";
                    els.loadedInfo.textContent = "Ningun documento cargado.";
                }
                setStatus(
                    els.actionStatus,
                    `Documento eliminado de ${cfg().itemsCollection}/${id}, pero fallo desindexando ${cfg().indexDocument}: ${getErrorMessage(indexError)}`,
                    true
                );
                return;
            }
            throw indexError;
        }
        if (state.loadedDocId === id) {
            state.loadedDocId = "";
            els.loadedInfo.textContent = "Ningun documento cargado.";
        }
        setStatus(els.actionStatus, `Documento ${id} eliminado e indice actualizado.`);
    } catch (error) {
        logOpError("deleteDoc", error, { wiki: state.currentWiki, collection: cfg().itemsCollection, indexDocument: cfg().indexDocument, id });
        setStatus(els.actionStatus, `Error al eliminar en Firebase: ${getErrorMessage(error)}`, true);
    }
}

async function switchWiki(nextWiki) {
    if (!WIKI_CONFIGS[nextWiki]) return;
    state.currentWiki = nextWiki;
    state.loadedDocId = "";
    state.workingPayload = null;
    els.loadedInfo.textContent = "Ningun documento cargado.";
    els.firebaseTargetId.value = "";
    populateTypes();
    applyVisibility();
    try {
        await loadTemplate(false);
        setStatus(els.actionStatus, `Wiki activa: ${cfg().label}.`);
    } catch (error) {
        setStatus(els.templateStatus, error.message || "No se pudo cargar plantilla.", true);
    }
}

function bindPreviewInputs() {
    [els.docId, els.docSlug, els.docName, els.seoTitle, els.seoDescription, els.coverImage, els.summaryField, els.aliasField, els.tagsField, els.relCharacters, els.relLocations, els.relOrganizations, els.relEvents, els.relConcepts, els.relArtifacts, els.relCreatures, els.relRelated, els.extraRace, els.extraBirth, els.extraDeath, els.extraAffiliation]
        .forEach((el) => el.addEventListener("input", refreshPreview));
}

els.wikiSelect.addEventListener("change", async () => { await switchWiki(els.wikiSelect.value); });
els.typeSelect.addEventListener("change", async () => { state.currentType = clean(els.typeSelect.value).toLowerCase(); applyVisibility(); await loadTemplate(false); });
els.newFromTemplateBtn.addEventListener("click", async () => { try { await loadTemplate(false); } catch (error) { setStatus(els.templateStatus, error.message || "No se pudo cargar plantilla.", true); } });
els.reloadTemplateBtn.addEventListener("click", async () => { try { await loadTemplate(true); } catch (error) { setStatus(els.templateStatus, error.message || "No se pudo recargar plantilla.", true); } });
els.authBtn.addEventListener("click", async () => { if (els.authBtn.dataset.mode === "logout") await logout(); else await login(); });
els.addUngroupedSectionBtn.addEventListener("click", () => { state.sections.ungrouped.push(sectionDraft({})); renderSections(); refreshPreview(); });
els.addGroupBtn.addEventListener("click", () => { state.sections.groups.push(groupDraft("")); renderSections(); refreshPreview(); });
els.loadBtn.addEventListener("click", loadDoc);
els.createBtn.addEventListener("click", createDoc);
els.saveBtn.addEventListener("click", saveDoc);
els.deleteBtn.addEventListener("click", deleteDocFromFirebase);
els.downloadBtn.addEventListener("click", downloadJson);
els.applyAdvancedBtn.addEventListener("click", applyAdvancedJson);
els.formatAdvancedBtn.addEventListener("click", formatAdvancedJson);

bindPreviewInputs();
setFirebaseButtons(false);
setAuthMode("login");
setStatus(els.authStatus, "Debes iniciar sesion para continuar.");
setStatus(els.actionStatus, "Sin operaciones.");
setStatus(els.templateStatus, "Listo.");

onAuthStateChanged(auth, (user) => {
    const ok = isAuthorizedUser(user);
    state.isAuthorized = ok;
    setFirebaseButtons(ok);
    if (!user) {
        setAuthMode("login");
        setStatus(els.authStatus, "Debes iniciar sesion para continuar.");
        return;
    }
    if (!ok) {
        setAuthMode("login");
        setStatus(els.authStatus, "Cuenta no autorizada para este admin.", true);
        return;
    }
    setAuthMode("logout");
    setStatus(els.authStatus, `Autenticado como ${user.email}`);
});

switchWiki(els.wikiSelect.value || "lucifer").catch(() => {
    setStatus(els.templateStatus, "No se pudo inicializar el admin unificado.", true);
});
