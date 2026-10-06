import { DOMAINS, GROUPS, MODES, PROTECTED_SURFACES } from "./catalog.mjs";

const unique = (items) => [...new Set(items.filter(Boolean))];
const bullet = (value) => "- " + value;

export function createPrompt(input) {
  const objective = String(input.objective || "").trim();
  const mode = MODES.find((entry) => entry.id === input.mode) || MODES[2];
  const allowedIds = new Set(input.allowedDomainIds || []);
  const protectedIds = new Set(input.protectedSurfaceIds || []);
  const allowed = DOMAINS.filter((domain) => allowedIds.has(domain.id));
  const protectedDomains = DOMAINS.filter((domain) => !allowedIds.has(domain.id));
  const contexts = unique(allowed.flatMap((domain) => domain.context));
  const paths = unique(allowed.flatMap((domain) => domain.paths));
  const validations = unique(allowed.flatMap((domain) => domain.validations));
  const guardrails = PROTECTED_SURFACES.filter((surface) => protectedIds.has(surface.id));
  const extraLimits = String(input.extraLimits || "").trim();
  const extraValidation = String(input.extraValidation || "").trim();

  const protectedByGroup = GROUPS.map((group) => {
    const names = protectedDomains.filter((domain) => domain.group === group.id).map((domain) => domain.label);
    return names.length ? group.label + ": " + names.join(", ") + "." : null;
  }).filter(Boolean);

  const sections = [
    "OBJETIVO",
    objective || "[Describe brevemente qué debe corregirse o implementarse.]",
    "",
    "MODO DE TRABAJO",
    mode.directive,
    "",
    "PROCEDIMIENTO DE CONTEXTO",
    "- Sigue AGENTS.md y el router de .agent/RULES.md.",
    "- Lee únicamente los documentos originales y las secciones necesarias para esta tarea.",
    "- Inspecciona el código y las pruebas vigentes antes de proponer o modificar.",
    "- No cargues AI_CONTEXT_PACK.md como contexto rutinario ni leas toda la carpeta .agent/docs."
  ];

  sections.push("", "ALCANCE PERMITIDO");
  if (allowed.length) {
    sections.push(...allowed.map((domain) => bullet(domain.label + ": " + domain.summary)));
  } else {
    sections.push("- Ningún dominio está autorizado para modificación. Limítate a revisión/diagnóstico.");
  }

  sections.push("", "CONTEXTO QUE DEBES CONSULTAR");
  sections.push(...(contexts.length ? contexts.map(bullet) : ["- .agent/RULES.md solamente, salvo una necesidad concreta demostrada."]));

  sections.push("", "RUTAS PROBABLES DE TRABAJO");
  sections.push(...(paths.length ? paths.map(bullet) : ["- Descubre las rutas mediante búsqueda de solo lectura; no modifiques sin alcance autorizado."]));

  sections.push(
    "",
    "REGLA DE PROTECCIÓN POR DEFECTO",
    "Todo dominio, archivo, comportamiento o contrato que no figure en «ALCANCE PERMITIDO» está protegido. No lo modifiques como efecto colateral.",
    ...protectedByGroup.map(bullet),
    "",
    "GUARDRAILS EXPLÍCITOS",
    ...guardrails.map((surface) => bullet(surface.guardrail))
  );

  if (extraLimits) sections.push("", "LÍMITES ADICIONALES", extraLimits);

  sections.push(
    "",
    "PROTOCOLO DE AMPLIACIÓN",
    "Si la causa está fuera del alcance permitido o exige tocar una superficie protegida, detente antes de editarla y reporta:",
    "1. evidencia concreta de la dependencia;",
    "2. dominio, contrato y archivos que habría que abrir;",
    "3. impacto y riesgo de regresión;",
    "4. ampliación mínima propuesta.",
    "No amplíes el alcance sin autorización expresa."
  );

  sections.push("", "VALIDACIÓN OBLIGATORIA");
  sections.push(...(validations.length ? validations.map(bullet) : ["- Realiza comprobaciones de solo lectura proporcionales al diagnóstico."]));
  sections.push(
    "- Ejecuta git diff --check.",
    "- Revisa git diff --name-only y confirma que cada archivo modificado pertenece al alcance permitido.",
    "- Añade una prueba de regresión cuando cambie comportamiento ejecutable.",
    "- Si una validación no puede ejecutarse, indica exactamente cuál y por qué."
  );
  if (extraValidation) sections.push(bullet(extraValidation));

  sections.push(
    "",
    "ENTREGA",
    "- Explica la causa o decisión técnica.",
    "- Enumera archivos modificados y por qué pertenecen al alcance.",
    "- Informa pruebas y validaciones ejecutadas.",
    "- Confirma expresamente que las superficies protegidas permanecieron intactas.",
    "- Señala riesgos o trabajo pendiente sin implementarlo fuera de alcance."
  );

  return sections.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function summarizeSelection(allowedDomainIds) {
  const ids = new Set(allowedDomainIds || []);
  const allowed = DOMAINS.filter((domain) => ids.has(domain.id));
  return {
    domains: allowed.length,
    paths: unique(allowed.flatMap((domain) => domain.paths)).length,
    contexts: unique(allowed.flatMap((domain) => domain.context)).length,
    validations: unique(allowed.flatMap((domain) => domain.validations)).length
  };
}
