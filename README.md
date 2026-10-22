# Nexus - Agentic AI Code Upgrade Assistant

An agentic AI developer tool that automatically analyzes software repositories, identifies outdated dependencies, and generates safe upgrade patches and GitHub Pull Requests.

## Getting Started

### 1. Prerequisites
- Python 3.9+
- Node.js 18+

### 2. Setup Backend (FastAPI)
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env # Add your GEMINI_API_KEY inside
uvicorn main:app --reload
```

### 3. Setup Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```

### 4. Usage
Open `http://localhost:3000` in your browser.
Enter a valid GitHub repository URL (e.g., `https://github.com/fastapi/fastapi`) and click "Analyze Dependencies".

## Deployment

### Backend (Render)
1. In Render, choose **New → Blueprint** and select this repository. It picks up [`render.yaml`](render.yaml).
2. Fill in the environment variables when prompted:
   - `GEMINI_API_KEY`: your Gemini API key
   - `GITHUB_TOKEN`: a fine-grained GitHub token with read-only access to public repositories. Without it, release notes stop loading after GitHub's 60 anonymous requests per hour.
   - `ALLOWED_ORIGINS`: your Vercel URL, e.g. `https://nexus.vercel.app` (add this after step 2 below)
   - `ALLOWED_ORIGIN_REGEX` (optional): to allow Vercel preview URLs, e.g. `https://nexus-.*\.vercel\.app`
3. Note the service URL, e.g. `https://nexus-api.onrender.com`.

On the free plan the service sleeps when idle, so the first request after a while can take up to a minute.

### Frontend (Vercel)
1. Import this repository in Vercel and set **Root Directory** to `frontend`.
2. Add the environment variable `NEXT_PUBLIC_API_URL` set to the Render service URL.
3. Deploy, then put the Vercel URL into the backend's `ALLOWED_ORIGINS`.
