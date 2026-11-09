import "server-only";
import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 90;

const CvAnalysisSchema = z.object({
  fitScore: z.object({
    score: z.number().int().min(0).max(100),
    verdict: z.enum(["dusuk", "orta", "iyi", "guclu", "mukemmel"]),
    summary: z.string(),
  }),
  matchedKeywords: z.array(z.string()).max(30),
  missingKeywords: z.array(z.string()).max(30),
  strengths: z.array(z.string()).min(2).max(8),
  gaps: z
    .array(
      z.object({
        area: z.string(),
        why: z.string(),
        howToClose: z.string(),
      }),
    )
    .max(8),
  improvedCv: z.object({
    header: z.object({
      fullName: z.string(),
      title: z.string(),
      contactLine: z.string(),
    }),
    summary: z.string(),
    skills: z.array(z.string()).min(4).max(20),
    experience: z
      .array(
        z.object({
          role: z.string(),
          company: z.string(),
          period: z.string(),
          bullets: z.array(z.string()).min(1).max(6),
        }),
      )
      .max(10),
    education: z
      .array(
        z.object({
          degree: z.string(),
          institution: z.string(),
          period: z.string(),
        }),
      )
      .max(6),
    certifications: z.array(z.string()).max(8).optional(),
  }),
  coverLetter: z.object({
    greeting: z.string(),
    body: z.array(z.string()).min(2).max(5),
    closing: z.string(),
  }),
  thirtySixtyNinety: z.object({
    thirty: z.array(z.string()).min(2).max(6),
    sixty: z.array(z.string()).min(2).max(6),
    ninety: z.array(z.string()).min(2).max(6),
  }),
});

const RequestSchema = z.object({
  cvText: z.string().min(50).max(20000),
  jobText: z.string().min(50).max(10000),
  candidateName: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  const limited = await rateLimit({
    action: "cv-koc",
    windowMs: 60 * 60 * 1000,
    max: 10,
  });
  if (!limited.ok) {
    return json(
      {
        error:
          "Saatte en fazla 10 analiz üretebilirsin. Lütfen biraz sonra tekrar dene.",
      },
      429,
    );
  }

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch {
    return json({ error: "Geçersiz istek gövdesi." }, 400);
  }

  const system = [
    "Sen Türkiye iş piyasasını iyi bilen, ATS (Applicant Tracking System) uyumlu CV yazımında deneyimli bir kariyer koçusun.",
    "Kullanıcı CV'sini metin olarak ve bir iş ilanının metnini verir; senin görevin dört aşamalı bir çıktı üretmek:",
    "1) İş ilanı-CV uyum skoru (0-100) + eşleşen/eksik anahtar kelimeler + güçlü yönler + gap analizi.",
    "2) ATS uyumlu güçlendirilmiş CV: belirgin başlık, 3-4 cümle özet, yetenek etiketleri, deneyim madde bulletleri (fiil + rakam + etki).",
    "3) Kişiye özel ön yazı: selamlama + 2-5 paragraf gövde + kapanış.",
    "4) 30-60-90 günlük işe giriş planı: her periyot için 2-6 somut madde.",
    "ATS kuralları: emoji/tablo/ikon yok, standart başlık adları (ÖZET, YETENEKLER, DENEYİM, EĞİTİM, SERTİFİKALAR), anahtar kelimeleri doğal biçimde dağıt.",
    "Deneyim madde bulletleri CAR formatında (Context → Action → Result); mümkünse rakam ver ('%30 artırdı', '15 kişilik ekip').",
    "Tüm metin resmi Türkçe. Yanlış veya abartılı iddia yok; CV'de verilmemiş rakamı uydurma.",
    "Verdict eşikleri: 0-39 düşük, 40-59 orta, 60-74 iyi, 75-89 güçlü, 90-100 mükemmel.",
    body.candidateName ? `Adayın adı: ${body.candidateName}.` : "Adayın adı CV'den çıkarılacak.",
  ].join(" ");

  // Groq gpt-oss-120b'nin generateObject yolu karmaşık nested şemalarda
  // NoObjectGeneratedError/JSON parse ile 502 atıyordu (ana sitedeki slayt
  // fix'inin aynısı). generateText + manual JSON.parse + safeParse yoluna
  // geçildi.
  const prompt = `=== CV ===\n${body.cvText}\n\n=== İŞ İLANI ===\n${body.jobText}\n\nAşağıdaki JSON şemasına birebir uyan tek bir JSON döndür. Başka hiçbir metin ekleme, kod bloğu kullanma.\n\nŞema (TypeScript):\n${CV_SCHEMA_HINT}\n\nimprovedCv.header.fullName CV'den çıkarılacak gerçek isim olmalı; CV'de isim yoksa "Aday" yaz.`;

  let raw: string;
  try {
    const { text } = await generateText({
      model: groq("openai/gpt-oss-120b"),
      system,
      prompt,
      temperature: 0.3,
    });
    raw = text;
  } catch (err) {
    console.error("[cv-koc] generateText failed:", err);
    return json(
      { error: "Analiz üretilemedi. Lütfen biraz sonra tekrar dene." },
      502,
    );
  }

  const jsonText = extractJson(raw);
  if (!jsonText) {
    console.error("[cv-koc] no JSON in output:", raw.slice(0, 400));
    return json({ error: "Analiz formatı beklenmedik. Tekrar dene." }, 422);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    console.error("[cv-koc] JSON parse failed:", err, raw.slice(0, 400));
    return json({ error: "Analiz formatı beklenmedik. Tekrar dene." }, 422);
  }
  const result = CvAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[cv-koc] schema mismatch:", result.error.issues.slice(0, 3));
    return json({ error: "Analiz formatı beklenmedik. Tekrar dene." }, 422);
  }
  return json(result.data);
}

function extractJson(text: string): string | null {
  const trimmed = text.trim();
  // Try to peel optional code fences
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // Fallback: first { to last }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}

const CV_SCHEMA_HINT = `{
  fitScore: { score: number(0-100), verdict: "dusuk"|"orta"|"iyi"|"guclu"|"mukemmel", summary: string },
  matchedKeywords: string[] (max 30),
  missingKeywords: string[] (max 30),
  strengths: string[] (2-8),
  gaps: { area, why, howToClose }[] (max 8),
  improvedCv: {
    header: { fullName, title, contactLine },
    summary: string,
    skills: string[] (4-20),
    experience: { role, company, period, bullets: string[] (1-6) }[] (max 10),
    education: { degree, institution, period }[] (max 6),
    certifications?: string[] (max 8)
  },
  coverLetter: { greeting, body: string[] (2-5), closing },
  thirtySixtyNinety: { thirty: string[] (2-6), sixty: string[] (2-6), ninety: string[] (2-6) }
}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
