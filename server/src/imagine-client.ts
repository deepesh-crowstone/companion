const XAI_BASE = "https://api.x.ai/v1";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/** $0.02/image — used for gallery shots. */
export const IMAGINE_MODEL_FAST = "grok-imagine-image";
/** $0.05/image — used for the identity anchor where quality matters most. */
export const IMAGINE_MODEL_QUALITY = "grok-imagine-image-quality";

export type ImagineAspectRatio =
  | "1:1"
  | "16:9"
  | "9:16"
  | "4:3"
  | "3:4"
  | "3:2"
  | "2:3"
  | "auto";

export type GeneratedImage = {
  bytes: Buffer;
  mimeType: string;
};

type ImagineRequestOptions = {
  model?: string;
  aspectRatio?: ImagineAspectRatio;
  resolution?: "1k" | "2k";
  /** Hard per-attempt timeout. Image generation is slow; default 120s. */
  timeoutMs?: number;
  /** Extra attempts after the first, only for transient (429/5xx) responses. */
  retries?: number;
  label?: string;
};

function xaiApiKey(): string {
  const key = process.env.XAI_API_KEY?.trim().replace(/^['"]|['"]$/g, "");
  if (!key) {
    throw new Error("XAI_API_KEY is not set");
  }
  return key;
}

function isTimeoutError(err: Error): boolean {
  return err.name === "TimeoutError" || err.name === "AbortError";
}

function toDataUrl(image: GeneratedImage): string {
  return `data:${image.mimeType};base64,${image.bytes.toString("base64")}`;
}

type ImagineResponse = {
  data?: {
    url?: string | null;
    b64_json?: string | null;
    mime_type?: string | null;
  }[];
};

async function postImagine(
  path: "/images/generations" | "/images/edits",
  body: Record<string, unknown>,
  options: ImagineRequestOptions,
): Promise<GeneratedImage> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const retries = options.retries ?? 1;
  const label = options.label ?? "Image generation";

  let lastError: Error = new Error(`${label} failed`);

  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${XAI_BASE}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${xaiApiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      lastError = new Error(
        isTimeoutError(err)
          ? `${label} failed: timed out after ${timeoutMs}ms`
          : `${label} failed: ${err.message}`,
      );
      break;
    }

    if (res.ok) {
      const data = (await res.json()) as ImagineResponse;
      const first = data.data?.[0];
      if (first?.b64_json) {
        return {
          bytes: Buffer.from(first.b64_json, "base64"),
          mimeType: first.mime_type ?? "image/jpeg",
        };
      }
      // Fall back to downloading the temporary URL if b64 was not honored.
      if (first?.url) {
        const imgRes = await fetch(first.url, {
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!imgRes.ok) {
          throw new Error(
            `${label} failed: could not download image (${imgRes.status})`,
          );
        }
        const arrayBuffer = await imgRes.arrayBuffer();
        return {
          bytes: Buffer.from(arrayBuffer),
          mimeType:
            imgRes.headers.get("content-type") ??
            first.mime_type ??
            "image/jpeg",
        };
      }
      throw new Error(
        `${label} failed: response contained no image (possibly moderated)`,
      );
    }

    const errText = await res.text().catch(() => "");
    lastError = new Error(
      `${label} failed: ${res.status} ${errText.slice(0, 300)}`,
    );
    if (!RETRYABLE_STATUS.has(res.status) || attempt === retries) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }

  throw lastError;
}

/** Text-to-image via `POST /v1/images/generations`. */
export async function generateImage(
  prompt: string,
  options: ImagineRequestOptions = {},
): Promise<GeneratedImage> {
  return postImagine(
    "/images/generations",
    {
      model: options.model ?? IMAGINE_MODEL_QUALITY,
      prompt,
      aspect_ratio: options.aspectRatio ?? "3:4",
      resolution: options.resolution ?? "1k",
      response_format: "b64_json",
    },
    { label: "Image generation", ...options },
  );
}

/**
 * Reference-based generation via `POST /v1/images/edits`.
 *
 * With one reference the output keeps the reference's aspect ratio; with
 * multiple references (max 3) refer to them as <image_0>, <image_1>, ... in
 * the prompt and pass aspectRatio explicitly.
 */
export async function editImage(
  prompt: string,
  references: GeneratedImage[],
  options: ImagineRequestOptions = {},
): Promise<GeneratedImage> {
  if (references.length === 0 || references.length > 3) {
    throw new Error("editImage requires 1-3 reference images");
  }

  const body: Record<string, unknown> = {
    model: options.model ?? IMAGINE_MODEL_FAST,
    prompt,
    response_format: "b64_json",
  };

  if (references.length === 1) {
    body.image = { url: toDataUrl(references[0]), type: "image_url" };
  } else {
    body.images = references.map((ref) => ({
      url: toDataUrl(ref),
      type: "image_url",
    }));
    body.aspect_ratio = options.aspectRatio ?? "3:4";
  }

  return postImagine("/images/edits", body, {
    label: "Image edit",
    ...options,
  });
}
