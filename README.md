# Creator Signal

Creator Signal is a lightweight prototype for discovering YouTube creators that fit a brand.

## What it does
- Generates a brand profile from a name or website.
- Searches YouTube via the Tikhub API.
- Ranks creators and shows average views and engagement signals.

## Quick start
1. Install dependencies:
   ```bash
   npm install
   ```
2. Add API config:
   ```bash
   cp .env.example .env.local
   ```
   Then fill in `TIKHUB_API_BASE_URL` and `TIKHUB_API_KEY`.
3. Run the dev server:
   ```bash
   npm run dev
   ```

## Notes
- If engagement rates show `n/a`, YouTube may be hiding likes/comments for that video.
- All API calls are routed through `/api/analyze`.
