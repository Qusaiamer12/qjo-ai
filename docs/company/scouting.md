# Scouting: what the company found outside

The manager and every employee look outside for what would make their part
of Qjo better: on the web (papers, docs, how others solved the same thing)
and on GitHub (skills for Claude Code, libraries, prompts, test methods).
Each find is written here; nothing from a third party is installed or copied
in without the owner's approval (it goes to the office's approvals).

| Date | Who | Found (link) | What it would change in Qjo | Cost / risk | Decision |
|---|---|---|---|---|---|
| 2026-11-02 | manager | Groq community: "gpt-oss-120b ignoring tools" (community.groq.com/t/gpt-oss-120b-ignoring-tools/385); promptfoo Groq docs | `tool_choice: required` is not enforced on gpt-oss at Groq (other models return 400, gpt-oss answers without a tool); `browser_search` exists on gpt-oss but is configured by hand | none: our own code | Item 16 runs the search on the server before the model answers, not through `tool_choice` |
