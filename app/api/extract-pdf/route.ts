import "server-only";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_PDF_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const limited = await rateLimit({
    action: "cv-pdf-extract",
    windowMs: 60 * 60 * 1000,
    max: 30,
  });
  if (!limited.ok) {
    return json(
      { error: "Saatte en fazla 30 PDF yükleyebilirsin." },
      429,
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Geçersiz form." }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return json({ error: "Dosya bulunamadı." }, 400);
  }
  if (file.type && file.type !== "application/pdf") {
    return json({ error: "Sadece PDF dosyaları kabul edilir." }, 400);
  }
  if (file.size > MAX_PDF_BYTES) {
    return json({ error: "Dosya 5 MB'tan büyük olamaz." }, 413);
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const buffer = Buffer.from(bytes);
    const mod = await import("pdf-parse");
    const pdfParse = (mod.default ?? mod) as (
      buf: Buffer,
    ) => Promise<{ text: string; numpages?: number }>;
    const parsed = await pdfParse(buffer);
    const text = parsed.text.trim();
    if (text.length < 20) {
      return json(
        {
          error:
            "PDF'den anlamlı metin çıkarılamadı. Taranmış görüntü PDF olabilir; CV'nizi metin olarak yapıştırmayı deneyin.",
        },
        422,
      );
    }
    return json({ text, pages: parsed.numpages ?? null });
  } catch (err) {
    console.error("[pdf-extract] failed:", err);
    return json({ error: "PDF okunamadı." }, 500);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
