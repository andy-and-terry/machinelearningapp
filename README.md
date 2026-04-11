# Local ML Platform

A **Windows-friendly, local-first** machine learning chat platform powered by [Ollama](https://ollama.com). All processing runs on your machine — no cloud, no login, no data leaves your PC.

---

## What's inside

| Path | Description |
|------|-------------|
| `server/index.js` | Node.js / Express backend — proxies Ollama, handles streaming |
| `public/` | HTML + CSS + JS frontend — chat UI with model status |
| `scripts/install.ps1` | PowerShell installer (Ollama check + model pull + npm install) |
| `scripts/install.bat` | Batch wrapper — double-click to run the PS installer |

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| [Node.js](https://nodejs.org/) | 16 LTS or newer | Download the Windows installer |
| [Ollama](https://ollama.com/download/windows) | latest | Required to run LLMs locally |

---

## Quick start (dev)

```powershell
# 1. Clone or download this repository
git clone https://github.com/andy-and-terry/machinelearningapp
cd machinelearningapp

# 2. Install Node.js dependencies
npm install

# 3. Make sure Ollama is running (in a separate terminal or as a Windows service)
ollama serve

# 4. Start the app
npm start

# 5. Open in your browser
#    http://localhost:3000
```

---

## Install models with the scripts

The installer scripts will:
1. Check if Ollama is installed (and open the download page if not).
2. Start Ollama if it isn't already running.
3. Pull the selected models from Ollama's registry.
4. Run `npm install` for the app.

### Option A — Double-click (easiest)

Double-click **`scripts\install.bat`** in Explorer.

### Option B — PowerShell

```powershell
# Install all default models
.\scripts\install.ps1

# Install only the fast/small models
.\scripts\install.ps1 -Models "qwen2.5:0.5b,llama3.2:1b"

# Install a single model
.\scripts\install.ps1 -Models "mistral:7b"

# Skip npm install (if you already ran npm install)
.\scripts\install.ps1 -SkipNodeInstall
```

### Supported models

| Model | Size | Speed | Best for |
|-------|------|-------|---------|
| `qwen2.5:0.5b` | ~400 MB | Fastest | Quick answers, low-end hardware |
| `llama3.2:1b` | ~1.3 GB | Very fast | General chat, simple explanations |
| `mistral:7b` | ~4.1 GB | Medium | Better reasoning, GPU recommended |
| `deepseek-r1:7b` | ~4.7 GB | Slower | Step-by-step reasoning |
| `deepseek-r1:8b` | ~5.2 GB | Slower | Step-by-step reasoning (more capable) |

> **Tip:** Start with `qwen2.5:0.5b` or `llama3.2:1b` for the best experience on a CPU-only machine.

---

## Troubleshooting

### Ollama is not running / `Ollama offline` in the UI

1. Open a terminal and run:
   ```powershell
   ollama serve
   ```
2. Leave that terminal open while using the app.
3. Check that nothing else is using port `11434`:
   ```powershell
   netstat -an | findstr 11434
   ```

### Port 11434 is blocked

If your firewall or antivirus blocks port `11434`:
- Temporarily disable the firewall rule for `ollama.exe`.
- Or set `OLLAMA_HOST=127.0.0.1:11434` in your environment and ensure the rule allows `127.0.0.1`.

### Port 3000 is already in use

Change the port by setting the `PORT` environment variable:
```powershell
$env:PORT = 3001
npm start
```

### A model shows as "not installed" (red dot)

The model hasn't been pulled yet. Either:
- Re-run `scripts\install.ps1` (or `scripts\install.bat`).
- Or manually pull it:
  ```powershell
  ollama pull qwen2.5:0.5b
  ```

### The response is very slow

- Switch to a smaller model (`qwen2.5:0.5b` or `llama3.2:1b`).
- Ensure no other heavy processes are competing for RAM/CPU.
- If you have an NVIDIA GPU, Ollama will use it automatically — install the [CUDA drivers](https://developer.nvidia.com/cuda-downloads).

### `npm install` fails

- Make sure Node.js 16+ is installed: `node --version`
- Try clearing the cache: `npm cache clean --force`, then `npm install`

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port for the app server |
| `OLLAMA_BASE` | `http://127.0.0.1:11434` | Ollama API base URL |

---

## License

MIT
