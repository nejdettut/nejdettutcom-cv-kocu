"use client";

import { useState } from "react";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  Sparkles,
  Target,
  Upload,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Verdict = "dusuk" | "orta" | "iyi" | "guclu" | "mukemmel";

type Analysis = {
  fitScore: { score: number; verdict: Verdict; summary: string };
  matchedKeywords: string[];
  missingKeywords: string[];
  strengths: string[];
  gaps: { area: string; why: string; howToClose: string }[];
  improvedCv: {
    header: { fullName: string; title: string; contactLine: string };
    summary: string;
    skills: string[];
    experience: {
      role: string;
      company: string;
      period: string;
      bullets: string[];
    }[];
    education: { degree: string; institution: string; period: string }[];
    certifications?: string[];
  };
  coverLetter: { greeting: string; body: string[]; closing: string };
  thirtySixtyNinety: {
    thirty: string[];
    sixty: string[];
    ninety: string[];
  };
};

const VERDICT_STYLE: Record<Verdict, { label: string; color: string; bar: string }> = {
  dusuk: { label: "Düşük", color: "text-rose-600 dark:text-rose-400", bar: "bg-rose-500" },
  orta: { label: "Orta", color: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" },
  iyi: { label: "İyi", color: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
  guclu: { label: "Güçlü", color: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-600" },
  mukemmel: { label: "Mükemmel", color: "text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-700" },
};

const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-navy/90 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-rose focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-rose dark:text-white";

const BTN_OUTLINE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white/70 px-4 py-2 text-sm font-medium text-slate-900 shadow-sm backdrop-blur transition hover:bg-slate-50 hover:shadow disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100 dark:hover:bg-slate-900";

const CARD =
  "rounded-2xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/60";

const MUTED_TEXT = "text-slate-500 dark:text-slate-400";

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

function coverLetterText(a: Analysis): string {
  return [
    a.coverLetter.greeting,
    "",
    a.coverLetter.body.join("\n\n"),
    "",
    a.coverLetter.closing,
  ].join("\n");
}

function improvedCvText(a: Analysis): string {
  const cv = a.improvedCv;
  const lines: string[] = [];
  lines.push(cv.header.fullName.toUpperCase());
  lines.push(cv.header.title);
  lines.push(cv.header.contactLine);
  lines.push("");
  lines.push("ÖZET");
  lines.push(cv.summary);
  lines.push("");
  lines.push("YETENEKLER");
  lines.push(cv.skills.join(" · "));
  lines.push("");
  lines.push("DENEYİM");
  cv.experience.forEach((e) => {
    lines.push(`${e.role} — ${e.company} (${e.period})`);
    e.bullets.forEach((b) => lines.push(`• ${b}`));
    lines.push("");
  });
  lines.push("EĞİTİM");
  cv.education.forEach((ed) => {
    lines.push(`${ed.degree} — ${ed.institution} (${ed.period})`);
  });
  if (cv.certifications && cv.certifications.length) {
    lines.push("");
    lines.push("SERTİFİKALAR");
    cv.certifications.forEach((c) => lines.push(`• ${c}`));
  }
  return lines.join("\n");
}

export function CvKocuApp() {
  const [cvText, setCvText] = useState("");
  const [jobText, setJobText] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);

  async function onPdfSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch("/api/extract-pdf", { method: "POST", body: form });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "PDF okunamadı.");
        return;
      }
      setCvText(data.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yükleme hatası.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function run() {
    if (cvText.trim().length < 50 || jobText.trim().length < 50) {
      setError("CV ve iş ilanının her biri en az 50 karakter olmalı.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvText, jobText, candidateName: candidateName || undefined }),
      });
      const data = await r.json();
      if (!r.ok) setError(data.error ?? "Bilinmeyen hata.");
      else setResult(data as Analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ağ hatası.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Input column */}
      <div className="space-y-4 lg:col-span-2">
        <div className={CARD}>
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <FileText className="size-4 text-brand-rose" />
              CV &amp; İş İlanı
            </h2>
          </div>
          <div className="space-y-4 p-5">
            <div>
              <label className={cn("mb-1.5 block text-xs font-semibold uppercase tracking-wider", MUTED_TEXT)}>
                CV (PDF veya metin)
              </label>
              <div className="mb-2 flex flex-wrap gap-2">
                <label className={cn(BTN_OUTLINE, "cursor-pointer")}>
                  {uploading ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Okunuyor…
                    </>
                  ) : (
                    <>
                      <Upload className="size-3.5" />
                      PDF yükle
                    </>
                  )}
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    disabled={uploading || loading}
                    onChange={onPdfSelected}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setCvText("")}
                  disabled={!cvText || loading}
                  className={BTN_OUTLINE}
                >
                  Temizle
                </button>
              </div>
              <textarea
                value={cvText}
                onChange={(e) => setCvText(e.target.value)}
                placeholder="CV metnini buraya yapıştırabilir veya yukarıdan PDF yükleyebilirsin."
                className="block h-40 w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-xs leading-relaxed dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <p className={cn("mt-1 text-[11px]", MUTED_TEXT)}>
                PDF maks. 5 MB. Taranmış görüntü PDF çalışmaz; metin olarak yapıştır.
              </p>
            </div>

            <div>
              <label className={cn("mb-1.5 block text-xs font-semibold uppercase tracking-wider", MUTED_TEXT)}>
                İş ilanı metni
              </label>
              <textarea
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                placeholder="LinkedIn / Kariyer.net / şirket sayfasındaki iş ilanının tamamını yapıştır."
                className="block h-36 w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-xs leading-relaxed dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label className={cn("mb-1.5 block text-xs font-semibold uppercase tracking-wider", MUTED_TEXT)}>
                Ad soyad (opsiyonel)
              </label>
              <input
                type="text"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                placeholder="CV'de yoksa buraya yaz"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={run}
                disabled={loading || cvText.length < 50 || jobText.length < 50}
                className={BTN_PRIMARY}
              >
                {loading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Analiz üretiliyor…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" />
                    CV&apos;mi analiz et
                  </>
                )}
              </button>
            </div>

            <p className={cn("text-[11px]", MUTED_TEXT)}>
              Saatte 10 analiz · 30 PDF yükleme sınırı. CV&apos;in ve iş
              ilanının en az 50&apos;şer karakter olmalı.
            </p>
          </div>
        </div>
      </div>

      {/* Output column */}
      <div className="space-y-4 lg:col-span-3">
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-900 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {!result && !loading && !error ? (
          <div
            className={cn(
              CARD,
              "flex flex-col items-center gap-3 border-dashed py-14 text-center",
            )}
          >
            <Target className="size-10 text-brand-rose" />
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              CV&apos;ni yükle, iş ilanını yapıştır, analizi başlat
            </h3>
            <p className={cn("max-w-sm text-sm", MUTED_TEXT)}>
              Uyum skoru · eşleşen/eksik anahtar kelimeler · güçlü yönler ·
              ATS CV + ön yazı + 30-60-90 plan bu sütunda belirir.
            </p>
          </div>
        ) : null}

        {loading ? (
          <div
            className={cn(
              CARD,
              "flex flex-col items-center gap-3 py-14 text-center",
            )}
          >
            <Loader2 className="size-10 animate-spin text-brand-rose" />
            <p className={cn("text-sm", MUTED_TEXT)}>
              Analiz hazırlanıyor… 20-40 saniye.
            </p>
          </div>
        ) : null}

        {result ? (
          <>
            {/* Fit score */}
            <div className={cn(CARD, "px-5 py-5")}>
              <p className={cn("text-[11px] font-semibold uppercase tracking-wider", MUTED_TEXT)}>
                İş İlanı Uyum Skorun
              </p>
              <div className="mt-2 flex items-baseline gap-3">
                <span
                  className={cn(
                    "text-4xl font-bold tracking-tight",
                    VERDICT_STYLE[result.fitScore.verdict].color,
                  )}
                >
                  {result.fitScore.score}
                </span>
                <span className={cn("text-xs font-semibold uppercase tracking-wider", VERDICT_STYLE[result.fitScore.verdict].color)}>
                  {VERDICT_STYLE[result.fitScore.verdict].label}
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className={cn("h-full transition-all", VERDICT_STYLE[result.fitScore.verdict].bar)}
                  style={{ width: `${result.fitScore.score}%` }}
                />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                {result.fitScore.summary}
              </p>
            </div>

            {/* Keywords */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className={cn(CARD, "px-5 py-5")}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="size-4" />
                  Eşleşen anahtar kelimeler
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {result.matchedKeywords.length === 0 ? (
                    <span className={cn("text-xs italic", MUTED_TEXT)}>Eşleşen anahtar kelime çıkarılamadı.</span>
                  ) : (
                    result.matchedKeywords.map((k, i) => (
                      <span key={i} className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                        {k}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className={cn(CARD, "px-5 py-5")}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
                  <XCircle className="size-4" />
                  Eksik anahtar kelimeler
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {result.missingKeywords.length === 0 ? (
                    <span className={cn("text-xs italic", MUTED_TEXT)}>Eksik yok.</span>
                  ) : (
                    result.missingKeywords.map((k, i) => (
                      <span key={i} className="rounded-full border border-rose-400/40 bg-rose-400/10 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-300">
                        {k}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Strengths */}
            <div className={cn(CARD, "px-5 py-5")}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Award className="size-4 text-brand-rose" />
                Güçlü yönlerin
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-200">
                {result.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>

            {/* Gaps */}
            {result.gaps.length > 0 ? (
              <div className={cn(CARD, "px-5 py-5")}>
                <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Gelişim alanları
                </h3>
                <ul className="space-y-2">
                  {result.gaps.map((g, i) => (
                    <li key={i} className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/40">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {g.area}
                      </p>
                      <p className={cn("mt-0.5 text-xs", MUTED_TEXT)}>{g.why}</p>
                      <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                        <span className="font-medium">Nasıl kapatılır:</span> {g.howToClose}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Improved CV */}
            <div className={cn(CARD, "px-5 py-5")}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  ATS Uyumlu Güçlendirilmiş CV
                </h3>
                <button
                  type="button"
                  onClick={() => copyToClipboard(improvedCvText(result))}
                  className={BTN_OUTLINE}
                >
                  Kopyala
                </button>
              </div>
              <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-900 dark:bg-slate-950 dark:text-slate-100">
                {improvedCvText(result)}
              </pre>
            </div>

            {/* Cover letter */}
            <div className={cn(CARD, "px-5 py-5")}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <Mail className="size-4 text-brand-rose" />
                  Ön yazı
                </h3>
                <button
                  type="button"
                  onClick={() => copyToClipboard(coverLetterText(result))}
                  className={BTN_OUTLINE}
                >
                  Kopyala
                </button>
              </div>
              <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-900 dark:bg-slate-950 dark:text-slate-100">
                {coverLetterText(result)}
              </pre>
            </div>

            {/* 30-60-90 */}
            <div className={cn(CARD, "px-5 py-5")}>
              <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                30-60-90 Günlük Plan
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {(["thirty", "sixty", "ninety"] as const).map((k, i) => {
                  const list = result.thirtySixtyNinety[k];
                  const label = ["30 gün", "60 gün", "90 gün"][i];
                  return (
                    <div key={k} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-brand-rose">
                        {label}
                      </p>
                      <ul className="list-disc space-y-1 pl-4 text-xs text-slate-700 dark:text-slate-200">
                        {list.map((item, j) => (
                          <li key={j}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
