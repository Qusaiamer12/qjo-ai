# منع Render من تنويم Qjo

## المشكلة

خدمة الويب على خطة Render المجانية **تنام بعد 15 دقيقة بلا أي زيارة**، والاستيقاظ
يأخذ **50-60 ثانية** يرى فيها الزائر صفحة تحميل أو يظن أن الموقع معطّل.

## القيد الذي يحكم الحل كله

Render يمنح **750 ساعة تشغيل شهريًا لكل workspace** (لا لكل خدمة)، والشهر
الميلادي **720-744 ساعة**.

النتيجة المهمة: إبقاء خدمة واحدة صاحية 24/7 يستهلك المخصص الشهري بالكامل تقريبًا،
وعند نفاده **يوقف Render كل الخدمات المجانية حتى بداية الشهر التالي**. الخدمة
الموقوفة أسوأ بكثير من الخدمة النائمة.

لهذا الحل هنا **نهاري بنافذة زمنية** وليس 24/7:

| النافذة | ساعات/شهر | الحالة |
|---|---|---|
| 24/7 | ~731 | ⚠️ خطر إيقاف |
| 07:00-01:00 (الافتراضي) | **~548** | ✅ آمن |
| 09:00-17:00 | ~243 | ✅ آمن جدًا |

## مصيدتان تُفشلان الحلول الشائعة بصمت

1. **نبض داخلي إلى `localhost` لا يفيد إطلاقًا.** مؤقّت الخمول يُصفَّر بالحركة
   الواصلة إلى راوتر Render، وطلب loopback لا يصل إليه. لذلك النبض يجب أن يذهب
   إلى الرابط العام. الكود يرفض التشغيل على loopback ويطبع تحذيرًا.
2. **لا تنبض على `/robots.txt` أبدًا.** أثناء نوم الخدمة يرد Render على هذا
   المسار بنفسه، فلا يصل الطلب للتطبيق ولا يوقظه. الكود يرفض هذا المسار صراحة.

## الطبقتان

### 1) نبض داخلي — مفعّل تلقائيًا

`src/services/keepAlive.js` ينبض على `/api/health` كل 14 دقيقة داخل النافذة.
يعمل تلقائيًا على Render (عندما `RENDER_EXTERNAL_URL` موجود) ومعطّل محليًا.

**حدّه الجوهري:** يبقي خدمة *تعمل* صاحية، لكنه **لا يستطيع إيقاظ خدمة نامت**،
لأنه يموت مع العملية. لذلك توجد الطبقة الثانية.

### 2) موقظ خارجي — يحتاج تفعيلًا يدويًا

ملف `docs/ci/keep-awake.yml` جاهز: ينبض كل 10 دقائق بين 04:00-21:59 UTC
(أي 07:00-00:59 بتوقيت عمّان).

يُخزَّن تحت `docs/ci/` وليس `.github/workflows/` اتباعًا لنفس عُرف المستودع
المتَّبع مع `docs/ci/github-actions-ci.yml` (أدوات الأتمتة لا تملك صلاحية
`workflows` للكتابة المباشرة في `.github/`).

لتفعيله:
1. انسخه إلى مكانه ثم ادفعه بنفسك:
   ```bash
   mkdir -p .github/workflows
   cp docs/ci/keep-awake.yml .github/workflows/keep-awake.yml
   git add .github/workflows/keep-awake.yml
   git commit -m "ci: enable Render keep-awake workflow"
   git push
   ```
2. اضبط رابط خدمتك: **Settings › Secrets and variables › Actions › Variables ›
   New repository variable** باسم `RENDER_URL` وقيمة مثل
   `https://qjo-ai-1.onrender.com`. (بدونها يستخدم الرابط الافتراضي.)
3. جرّبه يدويًا من تبويب **Actions › Keep Render awake › Run workflow**.

⚠️ **تنبيهان بخصوص GitHub Actions:** جدولة الكرون فيه *بذل أفضل جهد* وقد تتأخر
أكثر من 15 دقيقة وقت الذروة، كما أن GitHub يعطّل الكرون في المستودعات الخاملة
60 يومًا. لضمان قاطع استخدم مراقبًا خارجيًا:

- [cron-job.org](https://cron-job.org) (مجاني) — كل 10 دقائق على `/api/health`
- [UptimeRobot](https://uptimerobot.com) (مجاني) — فحص كل 5 دقائق

## الإعدادات

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `KEEP_ALIVE_ENABLED` | تلقائي على Render | `true` / `false` للتجاوز |
| `KEEP_ALIVE_URL` | `RENDER_EXTERNAL_URL` | الرابط العام (ليس localhost) |
| `KEEP_ALIVE_START_HOUR` | `7` | بداية النافذة (0-23) |
| `KEEP_ALIVE_END_HOUR` | `1` | نهايتها؛ يجوز عبور منتصف الليل |
| `KEEP_ALIVE_TIMEZONE` | `Asia/Amman` | منطقة زمنية IANA |
| `KEEP_ALIVE_INTERVAL_MS` | `840000` (14د) | يُقصَر تلقائيًا على 14 دقيقة |
| `KEEP_ALIVE_PATH` | `/api/health` | لا تستخدم `/robots.txt` |

جعل النافذة 24/7: اضبط `KEEP_ALIVE_START_HOUR` و`KEEP_ALIVE_END_HOUR` على نفس
القيمة — سيطبع الخادم تحذير الميزانية عند الإقلاع.

## التحقق

```bash
curl -s https://<your-app>.onrender.com/api/health | jq .keepAlive
```

```json
{
  "enabled": true,
  "running": true,
  "target": "https://qjo-ai-1.onrender.com/api/health",
  "intervalMinutes": 14,
  "window": "07:00-01:00",
  "withinWindowNow": true,
  "estimatedMonthlyHours": 548,
  "freeHoursCap": 750,
  "pings": 42,
  "failures": 0
}
```

راقب استهلاكك الفعلي من **Render Dashboard › Billing**.

## الحل النهائي

الترقية إلى Starter بـ **$7/شهر** تلغي النوم وحد الساعات تمامًا. كل ما سبق هو
التفاف على قيود الخطة المجانية، ويبقى الاستيقاظ البارد ممكنًا خارج النافذة.
