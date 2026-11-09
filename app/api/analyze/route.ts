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
  // NoObjectGeneratedError atıyordu (ana sitedeki slayt fix'inin aynısı).
  // generateText + örnek JSON şablonu + safeParse yoluna geçildi; şema
  // uyuşmazlığında 1 kere daha denenir.
  const prompt = `=== CV ===\n${body.cvText}\n\n=== İŞ İLANI ===\n${body.jobText}\n\nSadece aşağıdaki örnek yapıyla birebir aynı alan adlarını kullanan tek bir JSON nesnesi döndür. Başka hiçbir metin, açıklama, markdown veya kod bloğu ekleme.\n\nÖrnek şablon (alanlar birebir aynı olmalı, değerleri gerçek analizle doldur):\n\n${CV_EXAMPLE}\n\nKurallar:\n- improvedCv.header.fullName CV'deki gerçek isim; CV'de isim yoksa "Aday".\n- Tüm string'ler Türkçe.\n- Sayı alanları number tipi (integer).\n- Boş liste yerine en az 2 öğe üret (zorunlu min değerler var).\n- Sadece JSON döndür, başka hiçbir şey ekleme.`;

  async function attempt(): Promise<unknown | null> {
    let raw: string;
    try {
      const { text } = await generateText({
        model: groq("openai/gpt-oss-120b"),
        system,
        prompt,
        temperature: 0.25,
        maxOutputTokens: 4000,
      });
      raw = text;
    } catch (err) {
      console.error("[cv-koc] generateText failed:", err);
      return null;
    }
    const jsonText = extractJson(raw);
    if (!jsonText) {
      console.error("[cv-koc] no JSON in output:", raw.slice(0, 400));
      return null;
    }
    try {
      return JSON.parse(jsonText);
    } catch (err) {
      console.error("[cv-koc] JSON parse failed:", err, raw.slice(0, 400));
      return null;
    }
  }

  for (let i = 0; i < 2; i++) {
    const parsed = await attempt();
    if (!parsed) continue;
    const result = CvAnalysisSchema.safeParse(parsed);
    if (result.success) return json(result.data);
    console.error("[cv-koc] schema mismatch attempt", i + 1, "issues:", result.error.issues.slice(0, 5));
  }
  return json(
    { error: "Analiz üretilemedi. Lütfen biraz sonra tekrar dene." },
    502,
  );
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

const CV_EXAMPLE = `{
  "fitScore": {
    "score": 72,
    "verdict": "iyi",
    "summary": "Aday deneyim olarak iyi eşleşiyor ancak teknolojide bir eksik var."
  },
  "matchedKeywords": ["Python", "eğitmen", "10 yıl"],
  "missingKeywords": ["Django", "REST API"],
  "strengths": [
    "Güçlü öğretmenlik deneyimi",
    "Python'da derinleşmiş bilgi",
    "Yaş gruplarına uygun müfredat tasarımı"
  ],
  "gaps": [
    {
      "area": "Backend framework",
      "why": "İş ilanında Django istenmiş, CV'de belirtilmemiş",
      "howToClose": "Django online kursu + mini proje portfolyosu"
    }
  ],
  "improvedCv": {
    "header": {
      "fullName": "Nejdet Tut",
      "title": "Bilişim Teknolojileri Öğretmeni",
      "contactLine": "nejdettut@gmail.com · Ankara"
    },
    "summary": "10+ yıl deneyimli bilişim öğretmeni; Python ve yapay zekâ eğitimi.",
    "skills": ["Python", "Machine Learning", "Scratch", "Robotik Kodlama"],
    "experience": [
      {
        "role": "Bilişim Öğretmeni",
        "company": "Vektörel Bilişim",
        "period": "2023 — Devam",
        "bullets": [
          "K12-yetişkin gruplarına Python dersleri verdim (100+ öğrenci)",
          "Makine öğrenmesi atölyesi tasarladım ve yürüttüm"
        ]
      }
    ],
    "education": [
      {
        "degree": "Bilgisayar ve Öğretim Teknolojileri",
        "institution": "Trakya Üniversitesi",
        "period": "2010 — 2012"
      }
    ]
  },
  "coverLetter": {
    "greeting": "Sayın İnsan Kaynakları Ekibi,",
    "body": [
      "10 yılı aşkın bilişim öğretmenliği deneyimi ile bu pozisyona başvuruyorum.",
      "Python ve yapay zekâ konularında K12-yetişkin gruplarına ders verdim; robotik kodlama müfredatı tasarladım."
    ],
    "closing": "Saygılarımla,"
  },
  "thirtySixtyNinety": {
    "thirty": [
      "Ekip ve müfredatla tanışma",
      "İlk sınıf gözlemlerini tamamlama"
    ],
    "sixty": [
      "Pilot bir atölye tasarla",
      "Öğrenci değerlendirme rubriğini güncelle"
    ],
    "ninety": [
      "Haftalık ders planı sistemini kur",
      "Veli raporlama akışını tamamla"
    ]
  }
}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
