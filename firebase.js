const TEMPLATE_BASE_URL = "https://damianrbelmont.github.io/lore/lucifer/templates/json/";

const TEMPLATE_URLS = {
    character: `${TEMPLATE_BASE_URL}character.base.json`,
    location: `${TEMPLATE_BASE_URL}location.base.json`,
    event: `${TEMPLATE_BASE_URL}event.base.json`,
    concept: `${TEMPLATE_BASE_URL}concept.base.json`
};

const IMAGE_BASE_PATH = "assets/images";
const IMAGE_FOLDER_BY_TYPE = {
    character: "characters",
    location: "locations",
    event: "events",
    concept: "concepts"
};
const RELATION_KEYS = ["characters", "locations", "events", "concepts", "organizations", "related"];
const REPEATABLE_BLOCK_PATH_CONFIG = {
    "content.sections": {
        singularLabel: "Seccion",
        addButtonLabel: "ANADIR SECCION",
        idPrefix: "section",
        autoManageIds: true,
        ensureIdField: true,
        defaultFactory: (index) => ({
            id: `section_${index + 1}`,
            title: "",
            groupTitle: "",
            text: ""
        })
    }
};
const REPEATABLE_LABEL_ALIASES = {
    sections: "Seccion",
    interpretations: "Interpretacion",
    principles: "Principio",
    blocks: "Bloque",
    entries: "Entrada",
    items: "Item"
};
const REPEATABLE_ARRAY_META_BY_PATH = new Map();

const entryTypeSelect = document.getElementById("entryTypeSelect");
const loadTemplateBtn = document.getElementById("loadTemplateBtn");
const resetTemplateBtn = document.getElementById("resetTemplateBtn");
const templateStatus = document.getElementById("templateStatus");
const templateSource = document.getElementById("templateSource");
const dynamicFormRoot = document.getElementById("dynamicFormRoot");
const jsonPreview = document.getElementById("jsonPreview");
const normalizationStatus = document.getElementById("normalizationStatus");
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

function setNormalizationStatus(message, isWarning = false) {
    if (!normalizationStatus) return;
    normalizationStatus.textContent = message;
    normalizationStatus.style.color = isWarning ? "#e6c98f" : "";
}

function pushCorrection(corrections, message) {
    if (!message) return;
    if (!corrections.includes(message)) {
        corrections.push(message);
    }
}

function summarizeCorrections(corrections, max = 4) {
    if (!Array.isArray(corrections) || corrections.length === 0) return "";
    const visible = corrections.slice(0, max);
    const suffix = corrections.length > max ? ` (+${corrections.length - max} mas)` : "";
    return `${visible.join(" | ")}${suffix}`;
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getNormalizedPath(path) {
    return (path || [])
        .map((segment) => (segment ?? "").toString().toLowerCase())
        .join(".");
}

function isMultilineTextPath(path) {
    const normalizedPath = getNormalizedPath(path);
    if (!normalizedPath) return false;

    if (normalizedPath === "description") return true;
    if (normalizedPath === "excerpt") return true;
    if (normalizedPath === "content.summary") return true;
    if (/^content\.sections\.\d+\.text$/.test(normalizedPath)) return true;
    if (normalizedPath.endsWith(".description")) return true;
    if (normalizedPath.endsWith(".excerpt")) return true;
    return false;
}

function normalizeTextValue(value, asMultiline) {
    const normalized = (value ?? "").toString().replace(/\r\n?/g, "\n");
    if (asMultiline) {
        return normalized.trim();
    }
    return normalized.trim();
}

function normalizeTextRecursively(value, path = []) {
    if (Array.isArray(value)) {
        return value.map((item, index) => normalizeTextRecursively(item, [...path, String(index)]));
    }

    if (isPlainObject(value)) {
        const nextObject = {};
        Object.entries(value).forEach(([key, nested]) => {
            nextObject[key] = normalizeTextRecursively(nested, [...path, key]);
        });
        return nextObject;
    }

    if (typeof value === "string") {
        return normalizeTextValue(value, isMultilineTextPath(path));
    }

    return value;
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

function getImageFolderByType(type) {
    return IMAGE_FOLDER_BY_TYPE[normalizeEntryType(type)] || "";
}

function isHttpUrl(value) {
    return /^https?:\/\//i.test((value || "").toString().trim());
}

function extractImageFileName(value) {
    const clean = cleanString(value).replace(/\\/g, "/");
    if (!clean || isHttpUrl(clean)) return clean;
    const parts = clean.split("/").filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : clean;
}

function toCanonicalImagePath(value, type) {
    const clean = cleanString(value).replace(/\\/g, "/");
    if (!clean || isHttpUrl(clean)) return clean;

    const noLeadingSlash = clean.replace(/^\/+/, "");
    if (noLeadingSlash.startsWith(`${IMAGE_BASE_PATH}/`)) {
        return noLeadingSlash;
    }
    if (noLeadingSlash.startsWith(`lore/lucifer/${IMAGE_BASE_PATH}/`)) {
        return noLeadingSlash.replace(/^lore\/lucifer\//, "");
    }

    const folder = getImageFolderByType(type);
    if (!folder) return extractImageFileName(noLeadingSlash);

    const fileName = extractImageFileName(noLeadingSlash);
    return fileName ? `${IMAGE_BASE_PATH}/${folder}/${fileName}` : "";
}

function normalizeImageFieldsForEditor(payload, type) {
    if (!isPlainObject(payload)) return payload;

    const next = deepClone(payload);
    if (typeof next.image === "string") {
        next.image = extractImageFileName(next.image);
    }

    if (isPlainObject(next.seo) && typeof next.seo.image === "string") {
        next.seo.image = extractImageFileName(next.seo.image);
    }

    if (isPlainObject(next.content) && Array.isArray(next.content.sections)) {
        next.content.sections = next.content.sections.map((section) => {
            if (!isPlainObject(section)) return section;

            const normalizedSection = { ...section };
            const groupTitle = cleanString(
                normalizedSection.groupTitle
                || normalizedSection.group
                || normalizedSection.sectionGroupTitle
                || normalizedSection.section_group_title
                || normalizedSection.group_title
            );

            if (!Object.prototype.hasOwnProperty.call(normalizedSection, "groupTitle")) {
                normalizedSection.groupTitle = groupTitle;
            }

            return normalizedSection;
        });
    }

    return next;
}

function isImageFieldPath(path) {
    const normalizedPath = getNormalizedPath(path);
    return normalizedPath === "image" || normalizedPath === "seo.image";
}

function getImageFieldHint(type) {
    const folder = getImageFolderByType(type);
    if (!folder) return `Ruta final: ${IMAGE_BASE_PATH}/<carpeta>/<archivo>`;
    return `Ruta final: ${IMAGE_BASE_PATH}/${folder}/<archivo>`;
}

function tryParseJsonString(value) {
    const raw = cleanString(value);
    if (!raw) return null;
    if (!(raw.startsWith("{") || raw.startsWith("["))) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function uniqueCleanStrings(values) {
    const seen = new Set();
    const result = [];
    (values || []).forEach((value) => {
        const clean = cleanString(value);
        if (!clean) return;
        const key = clean.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        result.push(clean);
    });
    return result;
}

function slugifyIdentifier(value, fallbackIndex = 0) {
    const source = cleanString(value) || `section_${fallbackIndex + 1}`;
    return source
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || `section_${fallbackIndex + 1}`;
}

function toParagraphText(value) {
    if (typeof value === "string") return normalizeTextValue(value, true);
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) {
        const flat = value
            .map((item) => toParagraphText(item))
            .filter(Boolean);
        return flat.join("\n\n");
    }
    if (isPlainObject(value)) {
        return normalizeTextValue(JSON.stringify(value, null, 2), true);
    }
    return "";
}

function normalizeSectionItem(rawSection, index, fallbackTitle = "", corrections = []) {
    let id = "";
    let title = "";
    let groupTitle = "";
    let text = "";

    if (typeof rawSection === "string" || typeof rawSection === "number" || typeof rawSection === "boolean") {
        title = fallbackTitle || `Seccion ${index + 1}`;
        text = toParagraphText(rawSection);
    } else if (Array.isArray(rawSection)) {
        title = fallbackTitle || `Seccion ${index + 1}`;
        text = toParagraphText(rawSection);
        pushCorrection(corrections, "content.sections[]: convertido item array a texto");
    } else if (isPlainObject(rawSection)) {
        id = cleanString(rawSection.id || rawSection.slug);
        title = cleanString(rawSection.title || rawSection.tittle || rawSection.heading || rawSection.name || fallbackTitle);
        groupTitle = cleanString(
            rawSection.groupTitle
            || rawSection.group
            || rawSection.sectionGroupTitle
            || rawSection.section_group_title
            || rawSection.group_title
        );
        text = toParagraphText(rawSection.text ?? rawSection.description ?? rawSection.body ?? rawSection.content ?? rawSection.value ?? "");

        if (!text) {
            const looseValues = Object.entries(rawSection)
                .filter(([key]) => !["id", "slug", "title", "tittle", "heading", "name", "groupTitle", "group", "sectionGroupTitle", "section_group_title", "group_title", "text", "description", "body", "content", "value", "order"].includes(key))
                .map(([, value]) => toParagraphText(value))
                .filter(Boolean);
            if (looseValues.length > 0) {
                text = looseValues.join("\n\n");
                pushCorrection(corrections, "content.sections[]: consolidado objeto no canonico");
            }
        }
    }

    text = normalizeTextValue(text, true);
    if (!text) return null;
    title = title || fallbackTitle || `Seccion ${index + 1}`;
    id = id || slugifyIdentifier(title, index);

    return {
        id,
        title,
        groupTitle,
        text
    };
}

function normalizeContentForExport(contentValue, corrections = []) {
    const source = isPlainObject(contentValue) ? deepClone(contentValue) : {};
    if (!isPlainObject(contentValue)) {
        pushCorrection(corrections, "content: creado objeto canonico");
    }

    let summary = normalizeTextValue(source.summary ?? "", true);
    if (!summary && typeof source.intro === "string" && cleanString(source.intro)) {
        summary = normalizeTextValue(source.intro, true);
        pushCorrection(corrections, "content.intro -> content.summary");
    }

    const sections = [];
    const sourceSections = source.sections;

    if (Array.isArray(sourceSections)) {
        sourceSections.forEach((item, index) => {
            const normalizedSection = normalizeSectionItem(item, index, "", corrections);
            if (normalizedSection) sections.push(normalizedSection);
        });
    } else if (sourceSections !== undefined && sourceSections !== null && sourceSections !== "") {
        const normalizedSection = normalizeSectionItem(sourceSections, 0, "Seccion", corrections);
        if (normalizedSection) sections.push(normalizedSection);
        pushCorrection(corrections, "content.sections: convertido a array canonico");
    }

    Object.entries(source).forEach(([key, value]) => {
        if (["summary", "sections", "intro"].includes(key)) return;
        if (value === undefined || value === null) return;
        if (typeof value === "string" && !cleanString(value)) return;

        const normalizedSection = normalizeSectionItem(value, sections.length, key, corrections);
        if (!normalizedSection) return;
        sections.push(normalizedSection);
        pushCorrection(corrections, `content.${key}: movido a content.sections[]`);
    });

    const usedIds = new Set();
    const canonicalSections = sections.map((section, index) => {
        let nextId = slugifyIdentifier(section.id || section.title, index);
        let suffix = 2;
        while (usedIds.has(nextId)) {
            nextId = `${nextId}_${suffix}`;
            suffix += 1;
        }
        usedIds.add(nextId);
        const normalizedGroupTitle = cleanString(section.groupTitle);
        const canonicalSection = {
            id: nextId,
            title: cleanString(section.title) || `Seccion ${index + 1}`,
            text: normalizeTextValue(section.text, true)
        };
        if (normalizedGroupTitle) {
            canonicalSection.groupTitle = normalizedGroupTitle;
        }
        return canonicalSection;
    }).filter((section) => cleanString(section.text));

    return {
        summary,
        sections: canonicalSections
    };
}

function normalizeRelationBucket(value, bucketName, corrections = []) {
    if (value === undefined || value === null || value === "") return [];

    const stack = Array.isArray(value) ? [...value] : [value];
    const collected = [];

    while (stack.length > 0) {
        const current = stack.shift();
        if (current === undefined || current === null) continue;

        if (typeof current === "string") {
            const clean = current.trim();
            if (!clean) continue;

            const parsed = tryParseJsonString(clean);
            if (parsed !== null) {
                stack.push(parsed);
                pushCorrection(corrections, `relations.${bucketName}: convertido desde JSON stringificado`);
                continue;
            }

            if (clean.includes(",") && !clean.includes("://")) {
                const parts = clean.split(",").map((part) => part.trim()).filter(Boolean);
                if (parts.length > 1) {
                    collected.push(...parts);
                    pushCorrection(corrections, `relations.${bucketName}: separado string con comas`);
                    continue;
                }
            }

            collected.push(clean);
            continue;
        }

        if (typeof current === "number" || typeof current === "boolean") {
            collected.push(String(current));
            pushCorrection(corrections, `relations.${bucketName}: convertido valor primitivo a string`);
            continue;
        }

        if (Array.isArray(current)) {
            stack.push(...current);
            continue;
        }

        if (isPlainObject(current)) {
            const direct = cleanString(
                current.id
                || current.slug
                || current.ref
                || current.name
                || current.title
                || current.label
            );

            if (direct) {
                collected.push(direct);
                pushCorrection(corrections, `relations.${bucketName}: extraido identificador desde objeto`);
                continue;
            }

            const relationEntries = Object.entries(current)
                .filter(([key]) => RELATION_KEYS.includes((key || "").toLowerCase()));

            if (relationEntries.length > 0) {
                relationEntries.forEach(([, nestedValue]) => stack.push(nestedValue));
                pushCorrection(corrections, `relations.${bucketName}: expandido objeto de relaciones`);
                continue;
            }

            Object.values(current).forEach((nestedValue) => stack.push(nestedValue));
            pushCorrection(corrections, `relations.${bucketName}: convertido desde objeto no canonico`);
        }
    }

    return uniqueCleanStrings(collected);
}

function normalizeRelationsForExport(relationsValue, corrections = []) {
    const relationKeyAliases = {
        character: "characters",
        characters: "characters",
        location: "locations",
        locations: "locations",
        event: "events",
        events: "events",
        concept: "concepts",
        concepts: "concepts",
        organization: "organizations",
        organizations: "organizations",
        related: "related"
    };

    const source = isPlainObject(relationsValue) ? relationsValue : {};
    if (!isPlainObject(relationsValue)) {
        pushCorrection(corrections, "relations: creado objeto canonico");
    }

    const bucketSource = {
        characters: [],
        locations: [],
        events: [],
        concepts: [],
        organizations: [],
        related: []
    };

    function getEmbeddedRelationsObject(rawValue) {
        if (isPlainObject(rawValue) && Object.keys(rawValue).some((key) => relationKeyAliases[(key || "").toString().trim().toLowerCase()])) {
            return rawValue;
        }
        if (typeof rawValue === "string") {
            const parsed = tryParseJsonString(rawValue);
            if (isPlainObject(parsed) && Object.keys(parsed).some((key) => relationKeyAliases[(key || "").toString().trim().toLowerCase()])) {
                return parsed;
            }
        }
        return null;
    }

    Object.entries(source).forEach(([rawKey, value]) => {
        const embeddedRelations = getEmbeddedRelationsObject(value);
        if (embeddedRelations) {
            Object.entries(embeddedRelations).forEach(([embeddedKey, embeddedValue]) => {
                const embeddedNormalizedKey = relationKeyAliases[(embeddedKey || "").toString().trim().toLowerCase()];
                if (!embeddedNormalizedKey) return;
                bucketSource[embeddedNormalizedKey].push(embeddedValue);
            });
            pushCorrection(corrections, `relations.${rawKey}: expandido objeto de relaciones embebido`);
            return;
        }

        const normalizedKey = relationKeyAliases[(rawKey || "").toString().trim().toLowerCase()];
        if (!normalizedKey) {
            if (value !== undefined && value !== null && value !== "") {
                bucketSource.related.push(value);
                pushCorrection(corrections, `relations.${rawKey}: movido a relations.related`);
            }
            return;
        }

        bucketSource[normalizedKey].push(value);
        if (normalizedKey !== rawKey) {
            pushCorrection(corrections, `relations.${rawKey}: normalizado a relations.${normalizedKey}`);
        }
    });

    const normalized = {};
    RELATION_KEYS.forEach((bucket) => {
        normalized[bucket] = normalizeRelationBucket(bucketSource[bucket], bucket, corrections);
    });

    return normalized;
}

function normalizeForExportDetailed(payload) {
    const normalized = normalizeTextRecursively(deepClone(payload), []);
    const corrections = [];

    const normalizedType = normalizeEntryType(normalized.type) || state.currentType;
    if (normalized.type !== normalizedType) {
        pushCorrection(corrections, `type: normalizado a "${normalizedType}"`);
    }
    normalized.type = normalizedType;

    if (!isPlainObject(normalized.publication)) {
        normalized.publication = {};
        pushCorrection(corrections, "publication: creado objeto canonico");
    }

    const originalStatus = cleanString(normalized.publication.status);
    const originalVisibility = cleanString(normalized.publication.visibility);
    normalized.publication.status = normalizePublicationStatus(normalized.publication.status);
    normalized.publication.visibility = normalizePublicationVisibility(normalized.publication.visibility);
    if (originalStatus && originalStatus !== normalized.publication.status) {
        pushCorrection(corrections, `publication.status: normalizado a "${normalized.publication.status}"`);
    }
    if (originalVisibility && originalVisibility !== normalized.publication.visibility) {
        pushCorrection(corrections, `publication.visibility: normalizado a "${normalized.publication.visibility}"`);
    }

    if (typeof normalized.summary === "string" && cleanString(normalized.summary)) {
        pushCorrection(corrections, "summary top-level: integrado en content.summary");
    }

    normalized.content = normalizeContentForExport(normalized.content, corrections);
    if (!normalized.content.summary && typeof normalized.summary === "string" && cleanString(normalized.summary)) {
        normalized.content.summary = normalizeTextValue(normalized.summary, true);
    }
    if ("summary" in normalized) {
        delete normalized.summary;
    }

    normalized.relations = normalizeRelationsForExport(normalized.relations, corrections);

    const originalImage = cleanString(normalized.image);
    normalized.image = toCanonicalImagePath(normalized.image, normalized.type);
    if (originalImage && originalImage !== normalized.image) {
        pushCorrection(corrections, "image: normalizada a ruta canonica");
    }

    if (!isPlainObject(normalized.seo)) {
        normalized.seo = {};
        pushCorrection(corrections, "seo: creado objeto canonico");
    }
    const originalSeoImage = cleanString(normalized.seo.image);
    normalized.seo.image = toCanonicalImagePath(normalized.seo.image, normalized.type);
    if (originalSeoImage && originalSeoImage !== normalized.seo.image) {
        pushCorrection(corrections, "seo.image: normalizada a ruta canonica");
    }

    return {
        payload: normalized,
        corrections
    };
}

function normalizeForExport(payload) {
    return normalizeForExportDetailed(payload).payload;
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

function humanizeToken(value) {
    const source = (value || "")
        .toString()
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .trim()
        .toLowerCase();
    if (!source) return "item";
    return source.charAt(0).toUpperCase() + source.slice(1);
}

function singularizeToken(value) {
    const source = (value || "").toString().trim();
    if (!source) return "item";
    if (source.endsWith("ies")) return `${source.slice(0, -3)}y`;
    if (source.endsWith("ses")) return source.slice(0, -2);
    if (source.endsWith("s") && source.length > 1) return source.slice(0, -1);
    return source;
}

function getRepeatableItemLabel(key, path) {
    const leaf = ((path && path[path.length - 1]) || key || "item").toString().toLowerCase();
    if (REPEATABLE_LABEL_ALIASES[leaf]) return REPEATABLE_LABEL_ALIASES[leaf];
    return humanizeToken(singularizeToken(leaf));
}

function getFirstObjectFromArray(arrayValue) {
    return (arrayValue || []).find((item) => isPlainObject(item)) || null;
}

function cloneDefaultValue(value) {
    if (Array.isArray(value)) return [];
    if (isPlainObject(value)) {
        const next = {};
        Object.entries(value).forEach(([key, nested]) => {
            next[key] = cloneDefaultValue(nested);
        });
        return next;
    }
    if (typeof value === "number") return 0;
    if (typeof value === "boolean") return false;
    return "";
}

function createDefaultRepeatableItem(arrayValue, config) {
    if (config && typeof config.defaultFactory === "function") {
        return config.defaultFactory(arrayValue.length);
    }

    const firstObject = getFirstObjectFromArray(arrayValue);
    if (firstObject) return cloneDefaultValue(firstObject);
    return {};
}

function isSemicomplexObjectShape(objectValue) {
    if (!isPlainObject(objectValue)) return false;
    const keys = Object.keys(objectValue);
    if (keys.length >= 2) return true;
    if (keys.length === 0) return false;

    const onlyKey = keys[0].toLowerCase();
    return ["text", "description", "summary", "content", "body", "view"].some((token) => onlyKey.includes(token));
}

function getRepeatableBlockConfig(key, arrayValue, path) {
    const normalizedPath = getNormalizedPath(path);
    const forcedConfig = REPEATABLE_BLOCK_PATH_CONFIG[normalizedPath];

    if (forcedConfig) {
        const singularLabel = forcedConfig.singularLabel || getRepeatableItemLabel(key, path);
        return {
            ...forcedConfig,
            path: normalizedPath,
            singularLabel,
            addButtonLabel: forcedConfig.addButtonLabel || `ANADIR ${singularLabel.toUpperCase()}`
        };
    }

    const cachedConfig = REPEATABLE_ARRAY_META_BY_PATH.get(normalizedPath);
    if (cachedConfig) {
        const hasItems = Array.isArray(arrayValue) && arrayValue.length > 0;
        const hasOnlyObjects = hasItems ? arrayValue.every((item) => isPlainObject(item)) : true;
        if (hasOnlyObjects) {
            return {
                ...cachedConfig,
                path: normalizedPath
            };
        }
        REPEATABLE_ARRAY_META_BY_PATH.delete(normalizedPath);
    }

    if (!Array.isArray(arrayValue) || arrayValue.length === 0) return null;
    const everyItemObject = arrayValue.every((item) => isPlainObject(item));
    if (!everyItemObject) return null;

    const firstObject = getFirstObjectFromArray(arrayValue);
    if (!isSemicomplexObjectShape(firstObject)) return null;

    const singularLabel = getRepeatableItemLabel(key, path);
    const firstKeys = Object.keys(firstObject);
    const hasIdField = firstKeys.includes("id");
    const idPrefixRaw = singularizeToken((path && path[path.length - 1]) || key || "item").toLowerCase();
    const idPrefix = slugifyIdentifier(idPrefixRaw || "item");

    const nextConfig = {
        path: normalizedPath,
        singularLabel,
        addButtonLabel: `ANADIR ${singularLabel.toUpperCase()}`,
        idPrefix: idPrefix || "item",
        autoManageIds: hasIdField,
        ensureIdField: false,
        defaultFactory: () => cloneDefaultValue(firstObject)
    };

    REPEATABLE_ARRAY_META_BY_PATH.set(normalizedPath, {
        singularLabel: nextConfig.singularLabel,
        addButtonLabel: nextConfig.addButtonLabel,
        idPrefix: nextConfig.idPrefix,
        autoManageIds: nextConfig.autoManageIds,
        ensureIdField: nextConfig.ensureIdField,
        defaultFactory: nextConfig.defaultFactory
    });

    return nextConfig;
}

function reindexRepeatableIds(arrayValue, config) {
    if (!Array.isArray(arrayValue) || !config || !config.autoManageIds) return;

    const hasIdFieldInAnyItem = arrayValue.some((item) => isPlainObject(item) && Object.prototype.hasOwnProperty.call(item, "id"));
    if (!hasIdFieldInAnyItem && !config.ensureIdField) return;

    const idPrefix = slugifyIdentifier(config.idPrefix || "item") || "item";
    arrayValue.forEach((item, index) => {
        if (!isPlainObject(item)) return;
        if (!hasIdFieldInAnyItem && !config.ensureIdField) return;
        item.id = `${idPrefix}_${index + 1}`;
    });
}

function getRepeatableCardTitle(item, config, index) {
    const base = `${config.singularLabel || "Bloque"} ${index + 1}`;
    if (!isPlainObject(item)) return base;

    const groupPreview = cleanString(
        item.groupTitle
        || item.group
        || item.sectionGroupTitle
        || item.section_group_title
        || item.group_title
    );
    const preview = cleanString(
        item.title
        || item.name
        || item.label
        || item.perspective
        || item.id
    );
    if (groupPreview && preview) return `${base} - ${groupPreview} / ${preview}`;
    if (groupPreview) return `${base} - ${groupPreview}`;
    if (!preview) return base;
    return `${base} - ${preview}`;
}

function getTextareaRows(path, value) {
    const normalizedPath = getNormalizedPath(path);
    if (/^content\.sections\.\d+\.text$/.test(normalizedPath)) return 12;
    if (normalizedPath.endsWith(".text")) return 9;
    if (normalizedPath.endsWith(".description") || normalizedPath.endsWith(".summary") || normalizedPath.endsWith(".excerpt")) return 8;
    if (normalizedPath.endsWith(".content") || normalizedPath.endsWith(".body") || normalizedPath.endsWith(".view")) return 8;
    if (typeof value === "string" && value.length > 600) return 12;
    if (typeof value === "string" && value.length > 240) return 8;
    return 5;
}

function isLongTextField(key, value) {
    if (typeof value !== "string") return false;
    if (isMultilineTextPath(key)) return true;
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

function createPrimitiveEditor(key, value, onChange, path) {
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

    if (isLongTextField(path, value)) {
        const textarea = document.createElement("textarea");
        textarea.rows = getTextareaRows(path, value);
        textarea.className = "editor-textarea";
        textarea.value = value ?? "";
        textarea.addEventListener("input", () => onChange(textarea.value, false));
        row.appendChild(textarea);
        return row;
    }

    const input = document.createElement("input");
    input.type = "text";
    input.value = value ?? "";
    if (isImageFieldPath(path)) {
        input.placeholder = "valak.webp";

        const hint = document.createElement("p");
        hint.className = "field-hint";
        hint.textContent = "Introduce solo el nombre del archivo con extension. " + getImageFieldHint(state.currentType);
        row.appendChild(hint);
    }
    input.addEventListener("input", () => onChange(input.value, false));
    row.appendChild(input);
    return row;
}

function createRepeatableBlockArrayEditor(key, arrayValue, onChange, path, config) {
    const box = document.createElement("div");
    box.className = "json-array repeatable-array";

    reindexRepeatableIds(arrayValue, config);

    const header = document.createElement("div");
    header.className = "json-array-header repeatable-array-header";

    const title = document.createElement("p");
    title.className = "json-block-title";
    title.textContent = `${key} [bloques]`;
    header.appendChild(title);

    const controls = document.createElement("div");
    controls.className = "array-controls";

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "mini-btn";
    addButton.textContent = config.addButtonLabel || "ANADIR BLOQUE";
    addButton.addEventListener("click", () => {
        const nextItem = createDefaultRepeatableItem(arrayValue, config);
        arrayValue.push(nextItem);
        reindexRepeatableIds(arrayValue, config);
        onChange(arrayValue, true);
    });
    controls.appendChild(addButton);

    header.appendChild(controls);
    box.appendChild(header);

    const list = document.createElement("div");
    list.className = "array-items repeatable-list";

    arrayValue.forEach((item, index) => {
        const itemCard = document.createElement("div");
        itemCard.className = "array-item-card repeatable-card";

        const itemHead = document.createElement("div");
        itemHead.className = "array-item-head repeatable-card-head";

        const itemLabel = document.createElement("span");
        itemLabel.className = "repeatable-card-title";
        itemLabel.textContent = getRepeatableCardTitle(item, config, index);
        itemHead.appendChild(itemLabel);

        const actionWrap = document.createElement("div");
        actionWrap.className = "repeatable-card-actions";

        const moveUpButton = document.createElement("button");
        moveUpButton.type = "button";
        moveUpButton.className = "mini-btn mini-btn-ghost";
        moveUpButton.textContent = "SUBIR";
        moveUpButton.disabled = index === 0;
        moveUpButton.addEventListener("click", () => {
            if (index === 0) return;
            const temp = arrayValue[index - 1];
            arrayValue[index - 1] = arrayValue[index];
            arrayValue[index] = temp;
            reindexRepeatableIds(arrayValue, config);
            onChange(arrayValue, true);
        });
        actionWrap.appendChild(moveUpButton);

        const moveDownButton = document.createElement("button");
        moveDownButton.type = "button";
        moveDownButton.className = "mini-btn mini-btn-ghost";
        moveDownButton.textContent = "BAJAR";
        moveDownButton.disabled = index === arrayValue.length - 1;
        moveDownButton.addEventListener("click", () => {
            if (index >= arrayValue.length - 1) return;
            const temp = arrayValue[index + 1];
            arrayValue[index + 1] = arrayValue[index];
            arrayValue[index] = temp;
            reindexRepeatableIds(arrayValue, config);
            onChange(arrayValue, true);
        });
        actionWrap.appendChild(moveDownButton);

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "section-remove";
        removeButton.textContent = "ELIMINAR";
        removeButton.title = "Eliminar bloque";
        removeButton.addEventListener("click", () => {
            arrayValue.splice(index, 1);
            reindexRepeatableIds(arrayValue, config);
            onChange(arrayValue, true);
        });
        actionWrap.appendChild(removeButton);

        itemHead.appendChild(actionWrap);
        itemCard.appendChild(itemHead);

        const itemBody = document.createElement("div");
        itemBody.className = "repeatable-card-body";

        const childEditor = createValueEditor(
            `[${index}]`,
            item,
            (nextValue, shouldRerender) => {
                arrayValue[index] = nextValue;
                if (shouldRerender) {
                    reindexRepeatableIds(arrayValue, config);
                }
                onChange(arrayValue, shouldRerender);
            },
            [...path, String(index)]
        );

        itemBody.appendChild(childEditor);
        itemCard.appendChild(itemBody);
        list.appendChild(itemCard);
    });

    box.appendChild(list);
    return box;
}

function createGenericArrayEditor(key, arrayValue, onChange, path) {
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

function createArrayEditor(key, arrayValue, onChange, path) {
    const repeatableConfig = getRepeatableBlockConfig(key, arrayValue, path);
    if (repeatableConfig) {
        return createRepeatableBlockArrayEditor(key, arrayValue, onChange, path, repeatableConfig);
    }
    return createGenericArrayEditor(key, arrayValue, onChange, path);
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
    return createPrimitiveEditor(key, value, onChange, path);
}

function updatePreview() {
    if (!state.workingData) {
        jsonPreview.textContent = "{}";
        setNormalizationStatus("Estructura canónica: pendiente de datos.");
        updateIndexSnippetPreview(null);
        return;
    }
    const result = normalizeForExportDetailed(state.workingData);
    jsonPreview.textContent = JSON.stringify(result.payload, null, 2);

    if (result.corrections.length > 0) {
        setNormalizationStatus(`Se normalizo estructura canonica (${result.corrections.length}): ${summarizeCorrections(result.corrections)}`, true);
    } else {
        setNormalizationStatus("Estructura canónica: sin correcciones automáticas.");
    }

    updateIndexSnippetPreview(result.payload);
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
        state.workingData = normalizeImageFieldsForEditor(template, type);
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
        state.workingData = normalizeImageFieldsForEditor(importedPayload, importType);

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
    return normalizeForExportDetailed(state.workingData).payload;
}

function getCurrentNormalizationResult() {
    if (!state.workingData) return null;
    return normalizeForExportDetailed(state.workingData);
}

function exportJson() {
    const result = getCurrentNormalizationResult();
    if (!result) return;
    const payload = result.payload;

    const jsonText = JSON.stringify(payload, null, 2);
    const fileName = `${safeFileName(payload.id || payload.slug || payload.type)}.json`;
    triggerDownload(fileName, jsonText, "application/json;charset=utf-8");

    if (result.corrections.length > 0) {
        setStatus(`JSON exportado con normalizacion canonica: ${summarizeCorrections(result.corrections)}.`);
    } else {
        setStatus("JSON exportado en formato canonico.");
    }
}

async function copyJsonToClipboard() {
    const result = getCurrentNormalizationResult();
    if (!result) return;
    const payload = result.payload;

    const jsonText = JSON.stringify(payload, null, 2);
    try {
        await navigator.clipboard.writeText(jsonText);
        if (result.corrections.length > 0) {
            setStatus(`JSON copiado con normalizacion canonica: ${summarizeCorrections(result.corrections)}.`);
        } else {
            setStatus("JSON copiado en formato canonico.");
        }
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
    state.workingData = normalizeImageFieldsForEditor(state.baseTemplate, state.currentType);
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
