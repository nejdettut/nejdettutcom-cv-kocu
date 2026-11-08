# AI CV Koçu — nejdettut.com

PDF/metin CV + iş ilanı → uyum skoru + ATS CV + ön yazı + 30-60-90 plan.

- **Model:** Groq `openai/gpt-oss-120b` (tek `generateObject` çağrısı)
- **PDF parse:** `pdf-parse` (server-side, max 5 MB)
- **Çıktı:** 0-100 fit skoru · eşleşen/eksik keywords · güçlü yönler · gap
  analizi · ATS CV · ön yazı · 30-60-90 plan
- **Rate limit:** 10 analiz/saat, 30 PDF/saat

Bu uygulama [nejdettut.com](https://www.nejdettut.com) koleksiyonunun bir parçasıdır.

## Geliştirme

```bash
npm install
cp .env.example .env.local   # GROQ_API_KEY ekleyin
npm run dev
```
