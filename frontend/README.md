# Frontend Web Service - Translation Center

The Translation Center frontend is a hybrid service consisting of an **Express API server** (which serves as the orchestration gateway and API backend) and a **React Single Page Application (SPA)** built with Vite and styled using Vanilla CSS.

## Directory Structure
- [server.js](file:///Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/frontend/server.js): The Express Gateway API, serving routes for Authentication, Config/Prompt management in GCS, usage reporting, and log filtering.
- [users.json](file:///Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/frontend/users.json): Local file acting as the user database containing roles and bcrypt-hashed passwords.
- [package.json](file:///Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/frontend/package.json): Node project dependencies.
- [vite.config.js](file:///Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/frontend/vite.config.js): Bundler settings.
- [index.html](file:///Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/frontend/index.html): HTML page wrapper.
- [src/App.jsx](file:///Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/frontend/src/App.jsx): React SPA root code.
- [src/index.css](file:///Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/frontend/src/index.css): Design system style sheets (Vanilla CSS).

## User Roles & Auth Config
The initial user mappings populated in `users.json` are:
1. **admin1**: Role `admin` (Can edit config/prompts, see graphs, change user roles, and review/reject jobs).
2. **user1**: Role `user` (Can submit and approve/reject jobs).
3. **user2**: Role `viewer` (Can only view the jobs list and open documents).

*Password for all users: `123Translate` (stored as bcrypt hash).*

## Environment Variables
Create a `.env` file in this directory for local execution:
```env
PORT=8080
JWT_SECRET=translation-center-secret
GCP_PROJECT=YOUR_GCP_PROJECT_ID
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=password
DB_NAME=translation_center
DB_PORT=3306
TRANSLATION_BACKEND_URL=http://localhost:5000/translate
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
```

## Running Locally

### Development Setup
To run the project in development mode:
1. Spin up the Express backend (runs on port 8080):
   ```bash
   npm run dev
   ```
2. In a separate terminal or using local proxying, you can run the Vite Dev server (runs on port 3000):
   ```bash
   npx vite
   ```

### Production Build
To build and bundle the React SPA into static assets (served by Express from `dist/`):
```bash
npm run build
npm start
```
The application will be accessible at `http://localhost:8080`.
