import { formatEuro, quoteToJSON } from "@/domain";
import { serializeConfig } from "@/stores/config-file";
import { CONSENT_REQUIRED_MESSAGE, CONSENT_TEXT, PRIVACY_NOTICE_VERSION } from "@/server/consent";
import { enqueue, flush } from "@/server/email/outbox";
import { getEnv } from "@/server/env";
import { BodyTooLargeError, clientIp, errorResponse, internalError, jsonResponse, readBodyLimited, zodIssues, type FieldIssue } from "@/server/http";
import { MAX_FILL_MS, MAX_SUBMIT_BODY_BYTES, MAX_SUBMIT_JSON_BYTES, MIN_FILL_MS, SubmitRequestSchema, type SubmitRequest } from "@/server/public-dto";
import { CatalogUnavailableError, getPublicCatalog } from "@/server/quotes/catalog";
import { computeEstimate, EstimateInputError, type EstimateResult } from "@/server/quotes/estimate";
import { STORED_QUOTE_SCHEMA, type StoredQuote } from "@/server/quotes/snapshot";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/server/rate-limit";
import { createLeadWithQuote, type UploadRef } from "@/server/repositories/leads";
import { issueCustomerToken } from "@/server/repositories/tokens";
import { MAX_SCENE_BYTES, UploadError, validateImage, validatePhotos, type ValidImage } from "@/server/storage/images";
import { deleteUploads, storeImages } from "@/server/storage/uploads";

/**
 * `POST /api/preventivo` (P9, spec `richieste-preventivo`): multipart con il campo
 * `request` (JSON, `SubmitRequestSchema`), fino a 5 `photos` e l'immagine `scene` della
 * scena catturata dal viewer. Protezioni: rate limit per IP (5 ogni 10 minuti), corpo
 * limitato, schema strict, campo trappola, tempo minimo di compilazione, foto verificate
 * dai byte, consenso obbligatorio. La richiesta è salvata **prima** delle email: un errore
 * del provider lascia l'outbox `da-reinviare` e la risposta resta 201 `{ code, token }`.
 */

const SPAM_MESSAGE = "Invio non riuscito: controlla i dati e riprova.";

const badRequest = (message: string, issues?: readonly FieldIssue[]) => errorResponse(400, message, issues ? { issues } : {});

interface ParsedSubmission {
  readonly request: SubmitRequest;
  readonly photos: ValidImage[];
  readonly scene: ValidImage | null;
}

async function parseSubmission(req: Request, now: number): Promise<ParsedSubmission | Response> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) return errorResponse(415, "formato non supportato: inviare multipart/form-data");
  let form: FormData;
  try {
    const bytes = await readBodyLimited(req, MAX_SUBMIT_BODY_BYTES);
    form = await new Response(Buffer.from(bytes), { headers: { "content-type": contentType } }).formData();
  } catch (e) {
    if (e instanceof BodyTooLargeError) return errorResponse(413, "richiesta troppo grande: riduci il numero o la dimensione delle foto");
    return badRequest("richiesta non valida");
  }

  const raw = form.get("request");
  if (typeof raw !== "string" || raw.length > MAX_SUBMIT_JSON_BYTES) return badRequest("richiesta non valida", [{ path: "request", message: "dati della richiesta mancanti o troppo grandi" }]);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return badRequest("JSON non valido");
  }
  const parsed = SubmitRequestSchema.safeParse(json);
  if (!parsed.success) return badRequest("richiesta non valida", zodIssues(parsed.error.issues));
  const request = parsed.data;

  // Anti-spam (best effort): campo trappola e tempo di compilazione. Messaggio generico.
  if (request.website.trim() !== "") return badRequest(SPAM_MESSAGE);
  const elapsed = now - request.startedAt;
  if (elapsed < MIN_FILL_MS || elapsed > MAX_FILL_MS) return badRequest(SPAM_MESSAGE);

  if (!request.consent.accepted) return badRequest(CONSENT_REQUIRED_MESSAGE, [{ path: "consent.accepted", message: CONSENT_REQUIRED_MESSAGE }]);
  if (request.consent.version !== PRIVACY_NOTICE_VERSION)
    return badRequest("L'informativa è stata aggiornata: ricarica la pagina e accettala di nuovo.", [{ path: "consent.version", message: "versione dell'informativa non aggiornata" }]);

  const files = form.getAll("photos");
  const sceneEntry = form.get("scene");
  if (files.some((f) => typeof f === "string") || typeof sceneEntry === "string") return badRequest("richiesta non valida", [{ path: "photos", message: "file non valido" }]);
  try {
    const photos = validatePhotos(await Promise.all((files as File[]).map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
    const scene = sceneEntry
      ? validateImage({ bytes: new Uint8Array(await (sceneEntry as File).arrayBuffer()) }, { field: "scene", maxBytes: MAX_SCENE_BYTES, allowed: ["image/png", "image/jpeg"] })
      : null;
    return { request, photos, scene };
  } catch (e) {
    if (e instanceof UploadError) return badRequest(e.message, [{ path: e.field, message: e.message }]);
    throw e;
  }
}

function storedQuote(result: EstimateResult, request: SubmitRequest, sceneImageId: string | null): StoredQuote {
  return {
    schema: STORED_QUOTE_SCHEMA,
    typology: { slug: result.config.typology, title: result.typologyTitle },
    customerQuote: result.response.quote,
    notes: [...result.response.notes],
    commercial: request.estimate.commercial,
    declared: request.estimate.declared,
    sceneImageId,
    office: JSON.parse(quoteToJSON(result.quote)),
  };
}

export async function handleSubmitPost(req: Request, options: { now?: () => Date } = {}): Promise<Response> {
  const now = options.now ?? (() => new Date());
  let uploaded: UploadRef[] = [];
  try {
    const ip = clientIp(req);
    const limit = checkRateLimit("submit", ip);
    if (!limit.allowed) return errorResponse(429, RATE_LIMIT_MESSAGE, { headers: { "retry-after": String(limit.retryAfterSec) } });

    const parsed = await parseSubmission(req, now().getTime());
    if (parsed instanceof Response) return parsed;
    const { request, photos, scene } = parsed;

    const catalog = await getPublicCatalog();
    let result: EstimateResult;
    try {
      result = computeEstimate(request.estimate, catalog);
    } catch (e) {
      if (e instanceof EstimateInputError)
        return errorResponse(e.status, e.status === 422 ? "configurazione non realizzabile" : "configurazione non valida", { issues: e.issues.map((i) => ({ ...i, path: `estimate.${i.path}` })) });
      throw e;
    }

    // File prima del database (chiavi casuali); se il salvataggio fallisce si cancellano.
    const photoRefs = await storeImages(photos, "foto");
    uploaded = photoRefs;
    const sceneRefs = scene ? await storeImages([scene], "scena") : [];
    uploaded = [...photoRefs, ...sceneRefs];

    const at = now();
    const customer = request.customer;
    const { lead } = await createLeadWithQuote({
      customer,
      consent: {
        text: CONSENT_TEXT,
        version: PRIVACY_NOTICE_VERSION,
        acceptedAt: at.toISOString(),
        ip,
        userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300),
      },
      photos: uploaded,
      notes: request.notes,
      quote: {
        config: JSON.parse(serializeConfig(result.config)),
        quote: storedQuote(result, request, sceneRefs[0]?.id ?? null),
        totalCents: result.quote.totals.totalCents,
        priceListVersionId: catalog.priceListVersionId,
        ruleSetVersionId: catalog.ruleSetVersionId,
        siteFactors: result.quote.siteFactors,
      },
      now: at,
    });
    uploaded = []; // ora appartengono alla richiesta

    const { token, expiresAt } = await issueCustomerToken(lead.id, undefined, at);
    // Da qui la richiesta è salvata: un errore delle email non deve far fallire la risposta
    // (il cliente ripeterebbe l'invio creando un doppione); resta nel log e nell'outbox.
    try {
      const env = getEnv();
      const cq = result.response.quote;
      const priced = cq.status === "completo";
      const entries = await Promise.all([
        enqueue({
          template: "conferma-cliente",
          to: customer.email,
          leadId: lead.id,
          payload: {
            leadId: lead.id,
            code: lead.code,
            name: customer.name,
            typology: result.typologyTitle,
            total: priced ? formatEuro(cq.totalCents) : null,
            range: priced ? `${formatEuro(cq.range.minCents)} – ${formatEuro(cq.range.maxCents)}` : null,
            notes: cq.notes.slice(0, 20),
            link: `${env.siteUrl}/p/${token}`,
            expiresOn: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(expiresAt),
          },
        }),
        enqueue({
          template: "notifica-ufficio",
          to: env.officeEmail,
          leadId: lead.id,
          payload: {
            leadId: lead.id,
            code: lead.code,
            customer,
            typology: result.typologyTitle,
            total: priced ? formatEuro(cq.totalCents) : null,
            notes: request.notes,
            photos: photoRefs.length,
            adminUrl: `${env.siteUrl}/admin/richieste/${lead.id}`,
          },
        }),
      ]);
      // Invio nella stessa richiesta (nessuna coda esterna): gli errori restano nell'outbox.
      await flush({ ids: entries.map((e) => e.id) }).catch((e) => console.error("[api] invio email non riuscito", e instanceof Error ? e.message : e));
    } catch (e) {
      console.error("[api] accodamento email non riuscito", e instanceof Error ? `${e.name}: ${e.message}` : e);
    }

    return jsonResponse({ code: lead.code, token }, 201);
  } catch (e) {
    if (uploaded.length) await deleteUploads(uploaded);
    if (e instanceof CatalogUnavailableError) return errorResponse(503, "il preventivo online non è disponibile al momento: contattaci");
    return internalError(e, "richiesta");
  }
}
