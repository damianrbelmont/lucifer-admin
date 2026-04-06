const TEMPLATE_BASE_URL = "https://damianrbelmont.github.io/lore/lucifer/templates/json/";

const TEMPLATE_URLS = {
    character: `${TEMPLATE_BASE_URL}character.base.json`,
    location: `${TEMPLATE_BASE_URL}location.base.json`,
    event: `${TEMPLATE_BASE_URL}event.base.json`,
    concept: `${TEMPLATE_BASE_URL}concept.base.json`
};

const entryTypeSelect = document.getElementById("entryTypeSelect");
const loadTemplateBtn = document.getElementById("loadTemplateBtn");
const resetTemplateBtn = document.getElementById("resetTemplateBtn");
const templateStatus = document.getElementById("templateStatus");
const templateSource = document.getElementById("templateSource");
const dynamicFormRoot = document.getElementById("dynamicFormRoot");
const jsonPreview = document.getElementById("jsonPreview");
const indexSnippetPreview = document.getElementById("indexSnippetPreview");
const indexSnippetStatus = document.getElementById("indexSnippetStatus");

const importJsonBtn = document.getElementById("importJsonBtn");
const importJsonInput = document.getElementById("importJsonInput");
const downloadJsonBtn = document.getElementById("downloadJsonBtn");
const copyJsonBtn = document.getElementById("copyJsonBtn");
const copyIndexSnippetBtn = document.getElementById("copyIndexSnippetBtn");
const downloadIndexSnippetBtn = document.getElementById("downloadIndexSnippetBtn");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");

const state = {
    currentType: "character",
    templateCache: new Map(),
    baseTemplate: null,
    workingData: null
};

function setStatus(message, isError = false) {
    templateStatus.textContent = message;
    templateStatus.style.color = isError ? "#ff8b8b" : "";
}

function setSnippetStatus(message, isError = false) {
    if (!indexSnippetStatus) return;
    indexSnippetStatus.textContent = message;
    indexSnippetStatus.style.color = isError ? "#ff8b8b" : "";
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeEntryType(value) {
    const normalized = (value || "").toString().trim().toLowerCase();
    const aliases = {
        character: "character",
        characters: "character",
        location: "location",
        locations: "location",
        event: "event",
        events: "event",
        concept: "concept",
        concepts: "concept"
    };
    return aliases[normalized] || "";
}

function normalizePublicationStatus(value) {
    const normalized = (value || "draft").toString().trim().toLowerCase();
    return normalized === "published" ? "published" : "draft";
}

function normalizePublicationVisibility(value) {
    const normalized = (value || "private").toString().trim().toLowerCase();
    return normalized === "public" ? "public" : "private";
}

function normalizeForExport(payload) {
    const normalized = deepClone(payload);

    if (!isPlainObject(normalized.publication)) {
        normalized.publication = {};
    }

    normalized.publication.status = normalizePublicationStatus(normalized.publication.status);
    normalized.publication.visibility = normalizePublicationVisibility(normalized.publication.visibility);
    normalized.type = state.currentType;

    return normalized;
}

function mergeTemplateWithImported(templateValue, importedValue) {
    if (Array.isArray(templateValue)) {
        if (Array.isArray(importedValue)) return deepClone(importedValue);
        return deepClone(templateValue);
    }

    if (isPlainObject(templateValue)) {
        const result = {};
        const importedObj = isPlainObject(importedValue) ? importedValue : {};

        Object.keys(templateValue).forEach((key) => {
            result[key] = mergeTemplateWithImported(templateValue[key], importedObj[key]);
        });

        Object.keys(importedObj).forEach((key) => {
            if (!(key in result)) {
                result[key] = deepClone(importedObj[key]);
            }
        });

        return result;
    }

    if (importedValue === undefined) {
        return deepClone(templateValue);
    }

    return deepClone(importedValue);
}

function safeFileName(value) {
    const source = (value || "lucifer_entry")
        .toString()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

    return source || "lucifer_entry";
}

function cleanString(value) {
    return (value ?? "").toString().trim();
}

function resolveSnippetImage(payload) {
    const primary = cleanString(payload?.image);
    if (primary) return primary;
    const seoImage = cleanString(payload?.seo?.image);
    if (seoImage) return seoImage;
    return "";
}

function buildIndexSnippet(payload) {
    const id = cleanString(payload?.id);
    const slug = cleanString(payload?.slug);
    const title = cleanString(payload?.title);
    const type = cleanString(payload?.type);
    const section = cleanString(payload?.section).replace(/^\/+|\/+$/g, "");
    const subsection = cleanString(payload?.subsection);
    const excerpt = cleanString(payload?.excerpt);
    const image = resolveSnippetImage(payload);
    const status = normalizePublicationStatus(payload?.publication?.status);
    const visibility = normalizePublicationVisibility(payload?.publication?.visibility);
    const path = `${section}/${id}.json`;

    return {
        id,
        slug,
        title,
        type,
        section,
        subsection,
        excerpt,
        image,
        path,
        status,
        visibility
    };
}

function getIndexSnippetMissingFields(snippet) {
    const required = ["id", "slug", "title", "type", "section"];
    return required.filter((field) => !cleanString(snippet?.[field]));
}

function updateIndexSnippetPreview(payload) {
    if (!indexSnippetPreview) return;
    if (!payload) {
        indexSnippetPreview.textContent = "{}";
        setSnippetStatus("Sin datos para generar snippet.");
        return;
    }

    const snippet = buildIndexSnippet(payload);
    const missing = getIndexSnippetMissingFields(snippet);
    indexSnippetPreview.textContent = JSON.stringify(snippet, null, 2);

    if (missing.length > 0) {
        setSnippetStatus(`Faltan campos criticos: ${missing.join(", ")}. Puedes copiar igual para completar manualmente.`, true);
    } else {
        setSnippetStatus("Snippet listo para pegar en lore/lucifer/data/index.json > entries[].");
    }
}

function triggerDownload(fileName, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function getArrayItemKind(arrayValue) {
    if (!Array.isArray(arrayValue) || arrayValue.length === 0) return "text";
    const first = arrayValue[0];
    if (Array.isArray(first)) return "array";
    if (isPlainObject(first)) return "object";
    if (typeof first === "number") return "number";
    if (typeof first === "boolean") return "boolean";
    return "text";
}

function getDefaultByKind(kind) {
    if (kind === "object") return {};
    if (kind === "array") return [];
    if (kind === "number") return 0;
    if (kind === "boolean") return false;
    return "";
}

function isLongTextField(key, value) {
    if (typeof value !== "string") return false;
    const lowerKey = (key || "").toString().toLowerCase();
    return [
        "description",
        "summary",
        "excerpt",
        "text",
        "body",
        "content"
    ].some((token) => lowerKey.includes(token)) || value.includes("\n") || value.length > 120;
}

function createPrimitiveEditor(key, value, onChange) {
    const row = document.createElement("div");
    row.className = "field-row";

    const label = document.createElement("label");
    label.className = "field-label";
    label.textContent = key;
    row.appendChild(label);

    if (typeof value === "boolean") {
        const select = document.createElement("select");
        select.innerHTML = `
            <option value="true">true</option>
            <option value="false">false</option>
        `;
        select.value = value ? "true" : "false";
        select.addEventListener("change", () => onChange(select.value === "true", false));
        row.appendChild(select);
        return row;
    }

    if (typeof value === "number") {
        const input = document.createElement("input");
        input.type = "number";
        input.step = "any";
        input.value = Number.isFinite(value) ? value : 0;
        input.addEventListener("input", () => {
            const next = input.value === "" ? 0 : Number(input.value);
            onChange(Number.isFinite(next) ? next : 0, false);
        });
        row.appendChild(input);
        return row;
    }

    if (isLongTextField(key, value)) {
        const textarea = document.createElement("textarea");
        textarea.rows = 4;
        textarea.value = value ?? "";
        textarea.addEventListener("input", () => onChange(textarea.value, false));
        row.appendChild(textarea);
        return row;
    }

    const input = document.createElement("input");
    input.type = "text";
    input.value = value ?? "";
    input.addEventListener("input", () => onChange(input.value, false));
    row.appendChild(input);
    return row;
}

function createArrayEditor(key, arrayValue, onChange, path) {
    const box = document.createElement("div");
    box.className = "json-array";

    const header = document.createElement("div");
    header.className = "json-array-header";

    const title = document.createElement("p");
    title.className = "json-block-title";
    title.textContent = `${key} [array]`;
    header.appendChild(title);

    const controls = document.createElement("div");
    controls.className = "array-controls";

    const addType = document.createElement("select");
    addType.className = "array-kind-select";
    addType.innerHTML = `
        <option value="text">texto</option>
        <option value="number">numero</option>
        <option value="boolean">boolean</option>
        <option value="object">objeto</option>
        <option value="array">array</option>
    `;
    addType.value = getArrayItemKind(arrayValue);
    controls.appendChild(addType);

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "mini-btn";
    addButton.textContent = "ANADIR ITEM";
    addButton.addEventListener("click", () => {
        arrayValue.push(getDefaultByKind(addType.value));
        onChange(arrayValue, true);
    });
    controls.appendChild(addButton);

    header.appendChild(controls);
    box.appendChild(header);

    const list = document.createElement("div");
    list.className = "array-items";

    arrayValue.forEach((item, index) => {
        const itemCard = document.createElement("div");
        itemCard.className = "array-item-card";

        const itemHead = document.createElement("div");
        itemHead.className = "array-item-head";

        const itemLabel = document.createElement("span");
        itemLabel.textContent = `${key}[${index}]`;
        itemHead.appendChild(itemLabel);

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "section-remove section-remove-inline";
        removeButton.textContent = "X";
        removeButton.title = "Eliminar item";
        removeButton.addEventListener("click", () => {
            arrayValue.splice(index, 1);
            onChange(arrayValue, true);
        });
        itemHead.appendChild(removeButton);

        itemCard.appendChild(itemHead);

        const childEditor = createValueEditor(
            `[${index}]`,
            item,
            (nextValue, shouldRerender) => {
                arrayValue[index] = nextValue;
                onChange(arrayValue, shouldRerender);
            },
            [...path, String(index)]
        );

        itemCard.appendChild(childEditor);
        list.appendChild(itemCard);
    });

    box.appendChild(list);
    return box;
}

function createObjectEditor(key, objectValue, onChange, path) {
    const box = document.createElement("fieldset");
    box.className = "json-object";

    const legend = document.createElement("legend");
    legend.className = "json-block-title";
    legend.textContent = path.length === 0 ? "raiz" : `${key} {objeto}`;
    box.appendChild(legend);

    const fields = document.createElement("div");
    fields.className = "object-fields";

    Object.keys(objectValue).forEach((propertyKey) => {
        const wrap = document.createElement("div");
        wrap.className = "object-field-wrap";

        const editor = createValueEditor(
            propertyKey,
            objectValue[propertyKey],
            (nextValue, shouldRerender) => {
                objectValue[propertyKey] = nextValue;
                onChange(objectValue, shouldRerender);
            },
            [...path, propertyKey]
        );
        wrap.appendChild(editor);

        if (path.length > 0) {
            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.className = "section-remove";
            removeButton.textContent = "ELIMINAR CAMPO";
            removeButton.addEventListener("click", () => {
                delete objectValue[propertyKey];
                onChange(objectValue, true);
            });
            wrap.appendChild(removeButton);
        }

        fields.appendChild(wrap);
    });

    box.appendChild(fields);

    const addControls = document.createElement("div");
    addControls.className = "add-field-controls";

    const addInput = document.createElement("input");
    addInput.type = "text";
    addInput.placeholder = "nuevo_campo";
    addControls.appendChild(addInput);

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "mini-btn";
    addButton.textContent = "ANADIR CAMPO";
    addButton.addEventListener("click", () => {
        const keyName = (addInput.value || "").trim();
        if (!keyName) return;
        if (Object.prototype.hasOwnProperty.call(objectValue, keyName)) {
            alert("Ese campo ya existe.");
            return;
        }
        objectValue[keyName] = "";
        addInput.value = "";
        onChange(objectValue, true);
    });
    addControls.appendChild(addButton);

    box.appendChild(addControls);
    return box;
}

function createValueEditor(key, value, onChange, path) {
    if (Array.isArray(value)) {
        return createArrayEditor(key, value, onChange, path);
    }
    if (isPlainObject(value)) {
        return createObjectEditor(key, value, onChange, path);
    }
    return createPrimitiveEditor(key, value, onChange);
}

function updatePreview() {
    if (!state.workingData) {
        jsonPreview.textContent = "{}";
        updateIndexSnippetPreview(null);
        return;
    }
    const payload = normalizeForExport(state.workingData);
    jsonPreview.textContent = JSON.stringify(payload, null, 2);
    updateIndexSnippetPreview(payload);
}

function renderDynamicForm() {
    dynamicFormRoot.textContent = "";
    if (!state.workingData) return;

    const editor = createObjectEditor(
        "raiz",
        state.workingData,
        (nextValue, shouldRerender) => {
            state.workingData = nextValue;
            if (shouldRerender) {
                renderDynamicForm();
            }
            updatePreview();
        },
        []
    );

    dynamicFormRoot.appendChild(editor);
}

async function fetchTemplate(type, forceReload = false) {
    const url = TEMPLATE_URLS[type];
    if (!url) {
        throw new Error(`Tipo no soportado: ${type}`);
    }

    if (!forceReload && state.templateCache.has(type)) {
        return deepClone(state.templateCache.get(type));
    }

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`No se pudo descargar la plantilla (${response.status})`);
    }

    const template = await response.json();
    if (!isPlainObject(template)) {
        throw new Error("La plantilla remota no es un JSON de objeto valido.");
    }

    state.templateCache.set(type, template);
    return deepClone(template);
}

async function loadTemplateForType(type, forceReload = false) {
    state.currentType = type;
    entryTypeSelect.value = type;
    templateSource.textContent = `Fuente: ${TEMPLATE_URLS[type]}`;
    setStatus("Cargando plantilla remota...");

    try {
        const template = await fetchTemplate(type, forceReload);
        state.baseTemplate = deepClone(template);
        state.workingData = deepClone(template);
        state.workingData.type = type;
        renderDynamicForm();
        updatePreview();
        setStatus("Plantilla cargada correctamente.");
    } catch (error) {
        console.error(error);
        setStatus(`Error cargando plantilla: ${error.message}`, true);
    }
}

async function importLocalJsonFile(file) {
    if (!file) return;

    try {
        const rawText = await file.text();
        let parsed;

        try {
            parsed = JSON.parse(rawText);
        } catch (parseError) {
            setStatus("El archivo no contiene JSON valido.", true);
            return;
        }

        if (!isPlainObject(parsed)) {
            setStatus("El JSON importado debe ser un objeto en la raiz.", true);
            return;
        }

        const detectedType = normalizeEntryType(parsed.type);
        let importType = detectedType || state.currentType;
        let importedPayload = deepClone(parsed);

        if (detectedType) {
            const canonicalTemplate = await fetchTemplate(detectedType, false);
            state.baseTemplate = deepClone(canonicalTemplate);
            importedPayload = mergeTemplateWithImported(canonicalTemplate, importedPayload);
            state.currentType = detectedType;
            entryTypeSelect.value = detectedType;
            templateSource.textContent = `Fuente: ${TEMPLATE_URLS[detectedType]}`;
            importType = detectedType;
        }

        importedPayload.type = importType;
        state.workingData = importedPayload;

        renderDynamicForm();
        updatePreview();

        if (detectedType) {
            setStatus(`JSON importado (${file.name}). Tipo detectado: ${detectedType}.`);
        } else {
            setStatus(`JSON importado (${file.name}). Tipo no detectado; se mantiene: ${state.currentType}.`);
        }
    } catch (error) {
        console.error(error);
        setStatus(`Error al importar JSON: ${error.message}`, true);
    } finally {
        importJsonInput.value = "";
    }
}

function getCurrentPayload() {
    if (!state.workingData) return null;
    return normalizeForExport(state.workingData);
}

function exportJson() {
    const payload = getCurrentPayload();
    if (!payload) return;

    const jsonText = JSON.stringify(payload, null, 2);
    const fileName = `${safeFileName(payload.id || payload.slug || payload.type)}.json`;
    triggerDownload(fileName, jsonText, "application/json;charset=utf-8");
}

async function copyJsonToClipboard() {
    const payload = getCurrentPayload();
    if (!payload) return;

    const jsonText = JSON.stringify(payload, null, 2);
    try {
        await navigator.clipboard.writeText(jsonText);
        setStatus("JSON copiado al portapapeles.");
    } catch (error) {
        console.error(error);
        setStatus("No se pudo copiar el JSON.", true);
    }
}

async function copyIndexSnippetToClipboard() {
    const payload = getCurrentPayload();
    if (!payload) return;

    const snippet = buildIndexSnippet(payload);
    const missing = getIndexSnippetMissingFields(snippet);
    const text = JSON.stringify(snippet, null, 2);

    try {
        await navigator.clipboard.writeText(text);
        if (missing.length > 0) {
            setStatus(`Snippet copiado con campos pendientes: ${missing.join(", ")}.`, true);
        } else {
            setStatus("Snippet index.json copiado.");
        }
        updateIndexSnippetPreview(payload);
    } catch (error) {
        console.error(error);
        setStatus("No se pudo copiar el snippet.", true);
    }
}

function downloadIndexSnippet() {
    const payload = getCurrentPayload();
    if (!payload) return;

    const snippet = buildIndexSnippet(payload);
    const text = JSON.stringify(snippet, null, 2);
    const baseName = safeFileName(`${snippet.id || payload.id || payload.type}_index_snippet`);
    triggerDownload(`${baseName}.json`, text, "application/json;charset=utf-8");
    updateIndexSnippetPreview(payload);
}

function exportPdf() {
    const payload = getCurrentPayload();
    if (!payload) return;

    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert("No se pudo cargar la libreria de PDF.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const marginX = 50;
    const marginTop = 60;
    const marginBottom = 50;
    const maxWidth = pageWidth - marginX * 2;
    const lineHeight = 14;
    let y = marginTop;

    const title = (payload.title || payload.id || "Lucifer Entry").toString();
    const prettyJson = JSON.stringify(payload, null, 2);

    pdf.setFont("times", "bold");
    pdf.setFontSize(18);
    pdf.text(title, marginX, y);
    y += 28;

    pdf.setFont("courier", "normal");
    pdf.setFontSize(9);
    const lines = pdf.splitTextToSize(prettyJson, maxWidth);

    lines.forEach((line) => {
        if (y + lineHeight > pageHeight - marginBottom) {
            pdf.addPage();
            y = marginTop;
            pdf.setFont("courier", "normal");
            pdf.setFontSize(9);
        }
        pdf.text(line, marginX, y);
        y += lineHeight;
    });

    const fileName = `${safeFileName(payload.id || payload.slug || payload.type)}.pdf`;
    pdf.save(fileName);
}

loadTemplateBtn.addEventListener("click", async () => {
    await loadTemplateForType(entryTypeSelect.value, true);
});

resetTemplateBtn.addEventListener("click", () => {
    if (!state.baseTemplate) return;
    state.workingData = deepClone(state.baseTemplate);
    state.workingData.type = state.currentType;
    renderDynamicForm();
    updatePreview();
    setStatus("Formulario restaurado desde la plantilla.");
});

entryTypeSelect.addEventListener("change", async () => {
    await loadTemplateForType(entryTypeSelect.value, false);
});

importJsonBtn.addEventListener("click", () => {
    importJsonInput.click();
});

importJsonInput.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
    await importLocalJsonFile(file);
});

downloadJsonBtn.addEventListener("click", exportJson);
copyJsonBtn.addEventListener("click", copyJsonToClipboard);
copyIndexSnippetBtn.addEventListener("click", copyIndexSnippetToClipboard);
downloadIndexSnippetBtn.addEventListener("click", downloadIndexSnippet);
downloadPdfBtn.addEventListener("click", exportPdf);

loadTemplateForType(state.currentType).catch((error) => {
    console.error(error);
    setStatus("No se pudo inicializar el editor.", true);
});
