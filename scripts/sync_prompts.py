import re
import os

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

qjo_full_path = os.path.join(root_dir, "QJO_FULL_TRAINING_PROMPT.md")
vnext_path = os.path.join(root_dir, "docs", "QJO_SYSTEM_PROMPT_VNEXT_XML.md")
app_js_path = os.path.join(root_dir, "public", "app.js")

with open(qjo_full_path, "r", encoding="utf-8") as f:
    qjo_full_content = f.read()

def extract_tag_content(text, tag):
    pattern = rf"<{tag}>([\s\S]*?)</{tag}>"
    match = re.search(pattern, text)
    if match:
        return match.group(1).strip()
    return None

tags_to_sync = [
    "language_and_tone_mirroring",
    "reasoning_and_math",
    "privacy_security_and_safety",
    "response_quality_and_formatting",
    "interactive_charts_and_artifacts",
    "colloquial_intent_router"
]

sync_data = {}
for tag in tags_to_sync:
    content = extract_tag_content(qjo_full_content, tag)
    if content is None:
        print(f"Error: Could not extract tag <{tag}> from QJO_FULL_TRAINING_PROMPT.md")
        exit(1)
    sync_data[tag] = content

def replace_tag_content(filepath, tag, new_content):
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return
    with open(filepath, "r", encoding="utf-8") as f:
        text = f.read()
    
    # Escape backticks if modifying app.js to prevent JS syntax crash
    is_js = filepath.endswith(".js")
    escaped_content = new_content
    if is_js:
        # replace any unescaped backtick (`) inside the content with single quote (') to keep JS template literal safe
        escaped_content = escaped_content.replace("`", "'")

    pattern = rf"(<{tag}>)[\s\S]*?(</{tag}>)"
    replacement = f"\\1\n    {escaped_content}\n  \\2" if is_js else f"\\1\n    {escaped_content}\n  \\2"
    
    modified_text = re.sub(pattern, replacement, text)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(modified_text)
    print(f"Successfully synchronized <{tag}> inside {os.path.basename(filepath)}")

for filepath in [vnext_path, app_js_path]:
    for tag in tags_to_sync:
        replace_tag_content(filepath, tag, sync_data[tag])

print("Prompt synchronization script completed successfully.")
