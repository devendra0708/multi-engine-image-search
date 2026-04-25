# MultiSearch Images

A modern image search app that queries **Google Images**, **Bing Images**, **Yandex Images**, and **Unsplash** simultaneously and displays results in a beautiful masonry grid.

## Features

- Search all three engines at once or filter by a single engine
- Masonry grid layout with smooth hover animations
- Lightbox viewer with keyboard navigation (← → Esc)
- Copy image URL to clipboard
- Sort results (mixed / by engine)
- Dark theme with a clean, modern UI
- Yandex works out of the box via scraping (no key needed)

## Quick Start

### 1. Clone & install
```bash
npm install
```

### 2. Configure API keys
```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Run
```bash
npm start
# or for auto-reload during development:
npm run dev
```

Open http://localhost:3000

---

## API Keys Setup

### Google Images (Custom Search API)
Free tier: **100 searches/day**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Custom Search API**
3. Create an **API Key**
4. Go to [Programmable Search Engine](https://programmablesearchengine.google.com/)
5. Create a new engine → enable **"Search the entire web"**
6. Copy the **Search Engine ID (CX)**

Set in `.env`:
```
GOOGLE_API_KEY=AIzaSy...
GOOGLE_CX=1234567890abc
```

### Bing Images (Azure Cognitive Services)
Free tier: **1,000 searches/month**

1. Go to [Azure Portal](https://portal.azure.com/)
2. Create a **Bing Search v7** resource (choose Free tier)
3. Go to **Keys and Endpoint** → copy **Key 1**

Set in `.env`:
```
BING_API_KEY=abc123...
```

### Unsplash
Free tier: **50 requests/hour** (Demo), 5,000/hour after production approval

1. Go to [Unsplash Developers](https://unsplash.com/developers)
2. Click **"Your apps"** → **"New Application"**
3. Accept the API guidelines
4. Copy the **Access Key** (not the Secret Key)

Set in `.env`:
```
UNSPLASH_ACCESS_KEY=abc123...
```

> Per Unsplash guidelines, photographer attribution is displayed in the lightbox for every Unsplash image.

### Yandex Images
No API key needed — uses scraping. Results may vary depending on Yandex's anti-bot measures.

---

## Project Structure

```
image-search/
├── server.js          # Express backend + search engine integrations
├── public/
│   ├── index.html     # App shell
│   ├── style.css      # Dark theme styles
│   └── app.js         # Frontend logic
├── .env.example       # Environment variable template
└── package.json
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/search?q=cats&engine=all&count=20` | Search images. `engine` can be `all`, `google`, `bing`, `yandex`, or `unsplash` |
| `GET /api/status` | Returns which engines are configured |
