# AI Web Operator (Chrome 插件 + 本地 Python 代理)

这是一个**个人用途**的 Chrome 插件原型：
- 你在插件里输入目标（例如“登录后打开订单页并搜索最近一个订单”）
- 插件读取当前网页上下文
- 把目标 + 上下文发给本地 Python 代理
- 代理调用 NVIDIA API（`qwen/qwen3.5-122b-a10b`）
- AI 返回下一步动作（点击、输入、回车、等待、导航、完成）
- 插件在网页上执行动作并循环，直到完成

## 为什么这样做可以避免 CORS

- **不要在插件前端直接请求第三方 AI API**（容易遇到 CORS，也会泄露密钥）
- 改为：插件只请求 `http://127.0.0.1:8787` 本地代理
- 本地代理再去请求 `https://integrate.api.nvidia.com/v1/chat/completions`
- API Key 仅存放在本地环境变量，不进入插件代码

## 目录结构

- `extension/`：Chrome 插件 (Manifest V3)
- `server/`：本地 Python 代理

## 1) 启动 Python 代理

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 设置你的 key（不要提交到代码仓库）
export NVIDIA_API_KEY="你的key"

python app.py
```

默认监听：`http://127.0.0.1:8787`

## 2) 安装 Chrome 插件

1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 点「加载已解压的扩展程序」
4. 选择本项目里的 `extension/` 文件夹

## 3) 使用

1. 打开任意网页
2. 点击插件图标
3. 输入目标（Goal）
4. 点击 `Start`

插件会在当前标签页循环执行，点 `Stop` 可停止。

## 安全说明

- 此原型会在当前页面自动执行点击和输入，请仅在你信任的网站测试。
- 建议使用测试账号，不要在高风险页面上直接运行自动化。
- API Key 只放在本地环境变量，避免泄露。

## 已知限制

- LLM 决策可能出错，需要你观察执行过程。
- 一些复杂页面（Shadow DOM、Canvas、强反爬）可能难以稳定自动化。
- 当前只实现基础动作集（click/type/pressEnter/navigate/wait/done）。
