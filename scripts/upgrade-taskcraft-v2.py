#!/usr/bin/env python3
"""Upgrade all Qjo taskcraft entries to a dense world-class house standard."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "knowledge"

SENSITIVE = {
    "summarize-legal",
    "summarize-medical",
    "format-contract",
    "format-policy-doc",
    "format-invoice",
    "format-job-desc",
    "write-scholarship",
    "write-recommendation",
}

ROLE_WRITE = (
    "دور: المحتوى والنبرة فقط. إذا وُجد قالب تنسيق في السياق، اتبع هيكله ولا تعِد اختراع الشكل."
)
ROLE_FORMAT = (
    "دور: هيكل المخرجات العالمي (ISO/IBM/Google style). لا تختلق حقائق؛ املأ الهيكل بمحتوى المستخدم."
)
ROLE_CODE = (
    "دور: هندسة برمجيات إنتاجية — تشخيص ثم أصغر تغيير صحيح، مع أمان واختبارات."
)
ROLE_MATH = (
    "دور: حل رياضي قابل للتدقيق: معطيات → قانون → تعويض (حاسبة) → تحقق وحدات → جواب نهائي."
)
ROLE_EXPLAIN = (
    "دور: شرح تدريجي: تعريف سطر → تشبيه → آلية → مثال → قيد شائع."
)
ROLE_EDIT = (
    "دور: تحرير يحافظ على صوت الكاتب؛ غيّر الشكل أو الصحة لا المعنى إلا بطلب صريح."
)
ROLE_SUM = (
    "دور: تلخيص أمين — حقائق كما وردت، أرقام كما هي، الاستنتاج موسوم أنه استنتاج."
)

SAFETY = (
    "تنويه إلزامي بأول سطر: هذا نموذج/معلومة عامة وليس استشارة قانونية أو طبية أو مالية ملزمة. "
    "للعقود والسياسات والفواتير: اطلب مراجعة مختص مرخّص قبل الاستخدام."
)

DIALECT_POOL = [
    "رتّبلي",
    "زبطلي",
    "اعملي إياها صح",
    "بدي إياها احترافية",
    "على أصولها",
    "عالمي مستوى",
    "مثل الشركات الكبيرة",
]


def uniq(seq):
    seen = set()
    out = []
    for x in seq:
        if not x:
            continue
        k = " ".join(str(x).strip().lower().split())
        if k in seen:
            continue
        seen.add(k)
        out.append(str(x).strip())
    return out


def role_for(eid: str, domain: str) -> str:
    if eid in SENSITIVE or any(x in domain for x in ("legal", "medical", "contract")):
        return SAFETY
    if eid.startswith("format-") or domain.startswith("formatting"):
        return ROLE_FORMAT
    if eid.startswith("code-") or domain.startswith("coding"):
        return ROLE_CODE
    if eid.startswith("math-") or domain.startswith("math") or "matrices" in eid:
        return ROLE_MATH
    if eid.startswith("explain-") or eid.startswith("study-") or domain.startswith("explanation"):
        return ROLE_EXPLAIN
    if eid.startswith("edit-") or domain.startswith("editing"):
        return ROLE_EDIT
    if eid.startswith("summar") or eid.startswith("analyze-") or eid.startswith("compare-") or domain.startswith("summarization"):
        return ROLE_SUM
    if eid.startswith("write-") or domain.startswith("writing"):
        return ROLE_WRITE
    return ROLE_FORMAT


def extra_triggers(eid: str, domain: str, existing: list[str]) -> list[str]:
    extras = []
    ar_seed = next((t for t in existing if any("\u0600" <= c <= "\u06FF" for c in t)), existing[0] if existing else eid)
    extras += [
        f"زبطلي {ar_seed}",
        f"بدي {ar_seed} بمستوى عالمي",
        f"رتّب {ar_seed} احترافي",
    ]
    if domain.startswith("formatting"):
        extras += [
            "نسّق المخرجات حسب المعيار",
            "structure this like a world-class template",
            "apply professional document structure",
        ]
    if domain.startswith("coding"):
        extras += [
            "صلّحها للإنتاج",
            "production-grade implementation",
            "secure by default please",
        ]
    if domain.startswith("math"):
        extras += ["حلّها خطوة خطوة مع تحقق", "show work and verify units"]
    if eid in SENSITIVE:
        extras += ["قالب فقط مو استشارة", "template with disclaimer"]
    return extras


def extra_keywords(domain: str) -> list[str]:
    base = ["معيار عالمي", "احترافي", "best practice", "quality bar", "قابل للتدقيق"]
    if domain.startswith("coding"):
        base += ["owasp", "tests", "edge cases", "least privilege"]
    if domain.startswith("formatting"):
        base += ["هيكل", "قالب", "typography", "scannable"]
    if domain.startswith("math"):
        base += ["وحدات", "تحقق", "calculator"]
    return base


GOLD_RULES = (
    "معيار الجودة: ابدأ بالنتيجة أو التشخيص؛ اجعل النص قابلاً للمسح (عناوين/نقاط/جداول ≤5 أعمدة)؛ "
    "ممنوع اختلاق أرقام أو مراجع؛ اللغة تطابق المستخدم (أردني ودّي أو إنجليزي واضح)؛ "
    "CTA أو خطوة تالية واحدة؛ إذا نقص معطى حاسم اسأل سؤالاً واحداً ثم افترض صراحة."
)


def clamp(text: str, n: int) -> str:
    text = text.strip()
    if len(text) <= n:
        return text
    cut = text[: n - 1]
    if "\n" in cut:
        cut = cut.rsplit("\n", 1)[0]
    return cut.rstrip(" -•") + "…"


def upgrade_guidance(e: dict) -> str:
    role = role_for(e["id"], e["domain"])
    core = str(e.get("guidance") or "").strip()
    # avoid duplicating if already upgraded
    if core.startswith("دور:") or core.startswith("تنويه"):
        body = core
    else:
        body = f"{role}\n{core}\n{GOLD_RULES}"
    return clamp(body, 880)


def upgrade_example(e: dict) -> str:
    ex = str(e.get("example") or "").strip()
    if e["id"] in SENSITIVE and "تنويه" not in ex and "ليس استشارة" not in ex:
        ex = "تنويه: نموذج عام وليس استشارة ملزمة.\n" + ex
    return clamp(ex, 880)


def upgrade_entry(e: dict) -> dict:
    triggers = uniq(list(e.get("triggers") or []) + extra_triggers(e["id"], e["domain"], e.get("triggers") or []))
    keywords = uniq(list(e.get("keywords") or []) + extra_keywords(e["domain"]))
    return {
        "id": e["id"],
        "domain": e["domain"],
        "triggers": triggers[:10],
        "keywords": keywords[:14],
        "guidance": upgrade_guidance(e),
        "example": upgrade_example(e),
    }


NEW_B7 = [
    {
        "id": "format-exec-brief",
        "domain": "formatting/business",
        "triggers": [
            "موجز تنفيذي عالمي",
            "one page exec brief",
            "رتّبلي بريفاً للإدارة",
            "مذكرة قرار صفحة واحدة",
            "board one-pager",
        ],
        "keywords": ["تنفيذي", "brief", "قرار", "صفحة واحدة", "McKinsey"],
        "guidance": (
            f"{ROLE_FORMAT}\n"
            "- صفحة واحدة فقط: الوضع → الخيار → التوصية → الأثر → القرار المطلوب بتاريخ.\n"
            "- الأرقام في صندوق أعلى الصفحة؛ المصدر والتاريخ بجانب كل رقم.\n"
            "- لا ملاحق داخل الموجز — رابط واحد للتفاصيل.\n"
            f"{GOLD_RULES}"
        ),
        "example": (
            "# موجز: افتتاح فرع الزرقاء\n**التوصية:** نعم — Q1 2027.\n"
            "| المؤشر | القيمة | المصدر |\n|---|---|---|---|---|---|\n"
            "| إيراد إربد | +18% QoQ | مالية آب 2026 |\n"
            "**القرار المطلوب منك قبل 20 أيلول:** اعتماد ميزانية 25 ألف د.أ."
        ),
    },
    {
        "id": "code-secure-owasp",
        "domain": "coding/security",
        "triggers": [
            "أمّن الـ api",
            "owasp top 10 fix",
            "حقن sql حماية",
            "secure this endpoint",
            "رتّبلي أمان الإنتاج",
        ],
        "keywords": ["owasp", "injection", "xss", "csrf", "authn", "secrets"],
        "guidance": (
            f"{ROLE_CODE}\n"
            "- افحص بالترتيب: حقن (SQL/NoSQL/CMD) → XSS → كسر المصادقة → أسرار مكشوفة → CSRF.\n"
            "- استعلامات مُعلَّمة فقط؛ ترميز مخرجات حسب السياق؛ مفاتيح من البيئة لا الكود.\n"
            "- مبدأ أقل صلاحية + مهلة جلسات + تسجيل أمني بلا بيانات حساسة.\n"
            "- لا تكتب استغلالاً؛ اشرح الدفاع وعيّنة اختبار سلبية.\n"
            f"{GOLD_RULES}"
        ),
        "example": (
            "قبل: `query('SELECT * FROM users WHERE id=' + id)`\n"
            "بعد:\n```js\nconst { rows } = await db.query('SELECT * FROM users WHERE id=$1', [id]);\n```\n"
            "اختبار: مدخل `1; DROP TABLE` يجب أن يفشل كقيمة لا كأمر."
        ),
    },
    {
        "id": "code-sql-production",
        "domain": "coding/data",
        "triggers": [
            "استعلام sql للإنتاج",
            "explain analyze query",
            "index strategy",
            "زبطلي الجوين",
            "production sql review",
        ],
        "keywords": ["sql", "index", "explain", "n+1", "postgres", "mysql"],
        "guidance": (
            f"{ROLE_CODE}\n"
            "- صرّح الجداول والفهارس المفترضة قبل الاستعلام.\n"
            "- تجنّب SELECT *؛ فهارس تطابق WHERE/JOIN/ORDER؛ حذّر N+1.\n"
            "- اذكر لهجة SQL (Postgres/MySQL) عند اختلاف الدوال.\n"
            "- للبيانات الكبيرة: LIMIT + مفتاح ترقيم لا OFFSET عميق.\n"
            f"{GOLD_RULES}"
        ),
        "example": (
            "```sql\nSELECT u.id, u.name, COUNT(o.id) AS orders\n"
            "FROM users u\nLEFT JOIN orders o ON o.user_id = u.id AND o.status = 'paid'\n"
            "GROUP BY u.id\nHAVING COUNT(o.id) > 5\nORDER BY orders DESC\nLIMIT 50;\n```\n"
            "فهرس مقترح: orders(user_id, status)."
        ),
    },
    {
        "id": "study-tawjihi-plan",
        "domain": "explanation/study",
        "triggers": [
            "خطة توجيهي",
            "مذاكرة توجيهي الأردن",
            "جدول قدرات ووزاري",
            "tawjihi study plan",
            "زبطلي مواد العلمي",
        ],
        "keywords": ["توجيهي", "وزاري", "قدرات", "الأردن", "مذاكرة"],
        "guidance": (
            f"{ROLE_EXPLAIN}\n"
            "- اسأل: الفرع (علمي/أدبي/…) والأيام المتبقية والمعدل المستهدف.\n"
            "- وزّع حسب وزن العلامة لا حب المادة؛ جلسة 45د + استرجاع نشط.\n"
            "- خطأ شائع: إعادة قراءة الملخص بدل حل نماذج وزارية مؤقتة.\n"
            "- كل 3 أيام اختبار ذاتي بزمن حقيقي.\n"
            f"{GOLD_RULES}"
        ),
        "example": (
            "علمي — 21 يوماً: صباحاً رياضيات/فيزياء (ذروة)، مساء عربي/ثقافة، ليلاً نماذج وزارية 40د.\n"
            "الجمعة: محاكاة كاملة + تحليل الأخطاء فقط."
        ),
    },
    {
        "id": "format-incident-report",
        "domain": "formatting/code",
        "triggers": [
            "تقرير حادث إنتاج",
            "incident postmortem",
            "سقوط السيرفر تقرير",
            "blameless postmortem",
            "رتّبلي بوست مورتيم",
        ],
        "keywords": ["incident", "postmortem", "sre", "timeline", "severity"],
        "guidance": (
            f"{ROLE_FORMAT}\n"
            "- بلا لوم: خط زمني UTC، أثر المستخدم، سبب جذري، ما منع الاكتشاف، إجراءات بمسؤول وتاريخ.\n"
            "- درجة الخطورة (SEV1–4) ومعيار الاستعادة (SLO).\n"
            "- ممنوع أسماء للوم؛ ركّز على النظام.\n"
            f"{GOLD_RULES}"
        ),
        "example": (
            "# INC-214 SEV2 — توقف دفع 18د\n**الأثر:** 12% طلبات فشلت.\n"
            "**الجذر:** مهلة بوابة الدفع 2ث بعد نشر #212.\n"
            "**إجراء:** رفع المهلة 8ث + إنذار p95 — سارة — 10 أيلول."
        ),
    },
    {
        "id": "write-customer-support-levant",
        "domain": "writing/business",
        "triggers": [
            "رد دعم أردني",
            "شكوى زبون بأدب",
            "customer support arabic levantine",
            "اعتذار احترافي للدعم",
            "زبطلي رد الكول سنتر",
        ],
        "keywords": ["دعم", "شكوى", "اعتذار", "CX", "لهجة"],
        "guidance": (
            f"{ROLE_WRITE}\n"
            "- اعترف بالمشكلة بجملة، اعتذر بلا مبالغة، قدّم حلاً بزمن، خيار بديل، رقم تذكرة.\n"
            "- لهجة أردنية مهذبة في المحادثة؛ فصحى في الإيميل الرسمي.\n"
            "- لا تلُم الزبون ولا تعد بما لا تملك صلاحية تنفيذه.\n"
            f"{GOLD_RULES}"
        ),
        "example": (
            "أهلاً أحمد، معك من الدعم. تأخر الطلب 48 ساعة وهذا تقصير منّا.\n"
            "حلّينا: توصيل اليوم قبل 6 مساء أو استرجاع كامل — اختار الأنسب.\n"
            "رقم التذكرة QJ-4412 وبتوصلّك رسالة تأكيد."
        ),
    },
    {
        "id": "math-units-sigfigs",
        "domain": "math/science",
        "triggers": [
            "أرقام معنوية ووحدات",
            "si units check",
            "تحقق الوحدات الفيزيائية",
            "significant figures",
            "رتّب الجواب بوحدات SI",
        ],
        "keywords": ["SI", "وحدات", "أرقام معنوية", "أبعاد"],
        "guidance": (
            f"{ROLE_MATH}\n"
            "- حوّل كل المعطيات لوحدات SI قبل التعويض.\n"
            "- تتبع الأبعاد (dimensional analysis) سطر مستقل.\n"
            "- الأرقام المعنوية تتبع أضعف قياس؛ الآلة الحاسبة للضرب فقط.\n"
            f"{GOLD_RULES}"
        ),
        "example": (
            "v=72 كم/س = 20 م/ث. s=½at² مع a=2 م/ث² → t²=20 → t=4.47 ث (3 أرقام معنوية)."
        ),
    },
    {
        "id": "edit-inclusive-plain",
        "domain": "editing/general",
        "triggers": [
            "لغة واضحة شاملة",
            "plain language rewrite",
            "سهّل النص للقارئ",
            "accessible wording",
            "خليه مفهوم للكل",
        ],
        "keywords": ["plain language", "وضوح", "شمول", "A1", "إتاحة"],
        "guidance": (
            f"{ROLE_EDIT}\n"
            "- جملة واحدة فكرة واحدة؛ فعل معلوم لا مجهول؛ اشرح المختصرات أول مرة.\n"
            "- تجنّب تحيز الجنس/الإعاقة؛ خاطب القارئ مباشرة.\n"
            "- حافظ على المعنى القانوني إن وُجد واطلب تأكيداً.\n"
            f"{GOLD_RULES}"
        ),
        "example": (
            "قبل: «يتوجب على المستفيد اتخاذ الإجراءات اللازمة في أقرب فرصة.»\n"
            "بعد: «قدّم الطلب خلال 5 أيام عمل عبر التطبيق.»"
        ),
    },
]


def main():
    files = sorted(ROOT.glob("qkb-taskcraft-*.json")) + [ROOT / "qkb-v1.json"]
    for path in files:
        raw = json.loads(path.read_text(encoding="utf-8"))
        raw["entries"] = [upgrade_entry(e) for e in raw.get("entries") or []]
        if path.name == "qkb-v1.json":
            raw["version"] = "qkb-v1.2-worldclass-2026-09-07"
            raw["notes"] = (
                "Q-KB taskcraft v1.2 world-class: bilingual+Levantine triggers, role-separated "
                "write vs format, safety hedges, dense 880-char guidance matching injection cap."
            )
        else:
            raw["version"] = str(raw.get("version", "taskcraft")).split("-2026")[0] + "-worldclass-2026-09-07"
            raw["notes"] = (
                str(raw.get("notes") or "")
                + " | 2026-09-07 world-class pass: dialect triggers, role lines, legal/medical disclaimers, quality bar."
            )
            raw["layer"] = "taskcraft"
        path.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"upgraded {path.name}: {len(raw['entries'])}")

    b7 = {
        "version": "qkb-taskcraft-b7-worldclass-2026-09-07",
        "layer": "taskcraft",
        "notes": "Gap-fill world-class pack: exec brief, OWASP, production SQL, Tawjihi, incident, Levant CX, SI units, plain language.",
        "entries": [upgrade_entry(e) for e in NEW_B7],
    }
    out = ROOT / "qkb-taskcraft-b7.json"
    out.write_text(json.dumps(b7, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out.name}: {len(b7['entries'])}")


if __name__ == "__main__":
    main()
