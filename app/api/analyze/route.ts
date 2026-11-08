import "server-only";
import { generateObject } from "ai";
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

  const prompt = `=== CV ===\n${body.cvText}\n\n=== İŞ İLANI ===\n${body.jobText}\n\nTüm analizi JSON şemasına uygun döndür. improvedCv.header.fullName CV'den çıkarılacak gerçek isim olmalı; CV'de isim yoksa "Aday" yaz.`;

  try {
    const { object } = await generateObject({
      model: groq("openai/gpt-oss-120b"),
      schema: CvAnalysisSchema,
      system,
      prompt,
      temperature: 0.3,
    });
    return json(object);
  } catch (err) {
    console.error("[cv-koc] failed:", err);
    return json(
      { error: "Analiz üretilemedi. Lütfen biraz sonra tekrar dene." },
      502,
    );
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
