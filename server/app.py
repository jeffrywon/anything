import json
import os
from typing import Any, Dict

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
MODEL = "qwen/qwen3.5-122b-a10b"

app = Flask(__name__)
CORS(app)


def build_messages(goal: str, history: list[dict[str, Any]], page_context: Dict[str, Any], step: int):
    system_prompt = (
        "你是一个网页自动化规划器。"
        "你需要根据用户目标与当前页面上下文，返回下一步动作。"
        "动作必须是 JSON，且格式严格为:"
        "{\"action\": {\"type\": \"click|type|pressEnter|navigate|wait|done\", ...}, \"reason\": \"...\"}。"
        "不要输出 markdown。"
        "如果任务完成，请返回 action.type=done 并给出 summary。"
    )

    user_content = {
        "goal": goal,
        "step": step,
        "page_context": page_context,
        "history": history[-8:],
        "hints": {
            "type_action_fields": {
                "click": ["selector", "text"],
                "type": ["selector", "value", "text"],
                "pressEnter": ["selector", "text"],
                "navigate": ["url"],
                "wait": ["ms"],
                "done": ["summary"],
            }
        },
    }

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": json.dumps(user_content, ensure_ascii=False)},
    ]


def call_nvidia_api(messages: list[dict[str, str]]) -> Dict[str, Any]:
    api_key = os.getenv("NVIDIA_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("NVIDIA_API_KEY is not set")

    payload = {
        "model": MODEL,
        "messages": messages,
        "max_tokens": 1024,
        "temperature": 0.3,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    response = requests.post(NVIDIA_URL, headers=headers, json=payload, timeout=60)
    response.raise_for_status()
    return response.json()


def extract_json(content: str) -> Dict[str, Any]:
    text = content.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError(f"Model output does not contain JSON object: {text}")

    maybe_json = text[start : end + 1]
    return json.loads(maybe_json)


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.post("/api/next_action")
def next_action():
    data = request.get_json(force=True, silent=False)

    goal = (data.get("goal") or "").strip()
    history = data.get("history") or []
    page_context = data.get("page_context") or {}
    step = int(data.get("step") or 1)

    if not goal:
        return jsonify({"ok": False, "error": "goal is required"}), 400

    try:
        messages = build_messages(goal, history, page_context, step)
        raw = call_nvidia_api(messages)
        content = raw["choices"][0]["message"]["content"]
        parsed = extract_json(content)

        action = parsed.get("action")
        if not isinstance(action, dict) or "type" not in action:
            raise ValueError(f"Invalid action format: {parsed}")

        return jsonify({"ok": True, "action": action, "reason": parsed.get("reason", "")})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8787, debug=True)
