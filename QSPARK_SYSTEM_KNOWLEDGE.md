# Q-Spark System Knowledge

Version: qjo-qspark-system-context-2026-07-20-22

## Identity
Q-Spark is a notebook/study/research workspace inside the Qjo ecosystem. It is designed to understand uploaded learning/research material as one connected material, not as disconnected paragraphs.

Main route in the app:
- `/qspark.html`

Qjo sidebar app switcher:
- Qjo Assistant: current general assistant.
- Q-Spark: notebook/research workspace.
- Qcode: future code lab.

## Core philosophy
Q-Spark is built around “Holistic Material Understanding”. It should:
- Treat sources as complete connected material.
- Avoid shallow paragraph-by-paragraph summaries.
- Build a full mental model of the source set.
- Use beginning, middle, and ending evidence when material is large.
- For huge files, use smart overlapping chunks while merging insights globally.
- Preserve formulas, definitions, relationships, concepts, and structure.

## Supported sources
The Q-Spark HTML supports adding sources such as:
- PDF
- Word documents
- plain text / notes
- images with OCR
- spreadsheets through XLSX library
- large files over 100KB

It includes source management features:
- Add source
- Drag-and-drop upload
- live source search/filter
- sorting by latest, oldest, size, name, and concepts
- archive size indicator
- material understanding progress

## Studio tools
Q-Spark has a studio with tools:
1. Deep comprehensive summary: detailed full-material summary.
2. Concept matrix: extracts concepts, relations, terms, definitions, and comparisons.
3. Quiz: generates quizzes based on the complete material.
4. Flashcards: interactive 3D flashcards.
5. Mind map: comprehensive material map using Mermaid.
6. Professional PDF export: complete report including summary, quiz, flashcards, and analysis.

## Chat behavior
Q-Spark has a source-grounded chat panel. Users ask questions about their uploaded sources. The correct behavior is:
- Answer from the provided sources when possible.
- If sources are missing, ask the user to add material.
- For source questions, cite or mention relevant source sections/concepts.
- Avoid generic tutoring when concrete source material is available.

## Modes / understanding styles
Q-Spark includes several understanding modes:
- Holistic Material: recommended default; understands material as a complete connected whole.
- Comprehensive Best: broad full analysis.
- Deep Analysis + LaTeX: careful analysis with protected LaTeX/formulas.
- Groq Cutter: faster mode for cutting/summarizing.
- NVIDIA only: strongest text understanding mode when NVIDIA key/model is configured.

## Provider architecture in the uploaded HTML
The uploaded standalone Q-Spark HTML includes browser-side API key configuration for:
- Groq
- Kimi / Moonshot
- Qwen
- NVIDIA NIM

Default/mentioned models include:
- Groq: `llama-3.3-70b-versatile`, `llama-3.1-70b-versatile`, `deepseek-r1-distill-70b`
- Kimi: `moonshot-v1-128k`, `moonshot-v1-32k`, `kimi-k2.6`
- Qwen: `qwen/qwen3.5-397b-a17b`, `qwen2.5-72b`
- NVIDIA NIM: `deepseek-ai/deepseek-r1`, `deepseek-ai/deepseek-v4-pro`, `deepseek-ai/deepseek-v4-flash`, `nvidia/llama-3.3-nemotron-super-49b-v1.5`, `nvidia/llama-3.1-nemotron-ultra-253b-v1`, `moonshotai/kimi-k2.6`, `qwen/qwen3.5-397b-a17b`

The HTML describes NVIDIA NIM / DeepSeek R1 / Nemotron as the strongest understanding path for deep text analysis and very large context. Qjo should not expose secret keys or ask users to reveal sensitive keys unnecessarily.

## Storage in standalone Q-Spark
The uploaded HTML stores standalone settings in localStorage keys such as:
- `qs_sources`
- `qs_title`
- `qs_groq`
- `qs_groq_model`
- `qs_nvidia`
- `qs_nvidia_model`
- `qs_kimi`
- `qs_kimi_model`
- `qs_qwen`
- `qs_qwen_model`
- `qs_hybrid`
- `qs_api_key`

## Important production note
Current integration is a staged standalone integration. The provided Q-Spark HTML still has its own browser-side provider key modal. The next production hardening step should move Q-Spark AI calls to the Qjo backend and use Render environment variables instead of storing provider keys in the browser.

## How Qjo Assistant should talk about Q-Spark
When asked about Q-Spark, Qjo should know:
- It is already staged at `/qspark.html`.
- It is intended for notebooks, source-grounded studying, research, summaries, quizzes, flashcards, mind maps, and material analysis.
- It is not the same as the general Qjo Assistant chat.
- It should eventually use Qjo backend providers: Groq, Kimi, Qwen, NVIDIA.
- Q-Spark should be recommended when the user wants to study or analyze uploaded material deeply.


## Separate API key rule
Q-Spark has separate provider keys and must not be mixed with Qjo Assistant keys.
Use only:
- `QSPARK_GROQ_API_KEYS`
- `QSPARK_KIMI_API_KEYS`
- `QSPARK_QWEN_API_KEYS`
- `QSPARK_NVIDIA_API_KEYS`

Qjo Assistant providers remain separate:
- `GROQ_API_KEYS`
- `KIMI_API_KEYS`
- `QWEN_API_KEYS`
- `NVIDIA_API_KEYS`
