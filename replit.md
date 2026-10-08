# Trust Community Fund

## Overview
A web application for managing a community fund/trust. Originally designed for Vercel deployment, adapted to run on Replit with Express.js serving static files and API routes.

## Project Architecture
- **Frontend**: Static HTML/CSS/JS files in the project root
- **Backend**: Express.js server (`server.js`) handling API routes that were originally Vercel serverless functions
- **API Routes**:
  - `GET /api/config` - Returns Firebase and ImgBB configuration
  - `GET /api/firebase-config` - Returns Firebase configuration
  - `POST /api/send-notification` - Sends push notifications via Firebase Cloud Messaging
- **Database**: Firebase Realtime Database (external)
- **Port**: 5000 (frontend + API)

## Key Files
- `server.js` - Express server (entry point)
- `index.html` - Main landing page
- `api/` - Original Vercel serverless functions (preserved for reference)
- `*.html` - Various app pages (login, registration, calculator, etc.)
- `user-*.js/css` - Shared frontend utilities and styles

## Environment Variables Required
- `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_DATABASE_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`, `FIREBASE_MEASUREMENT_ID`
- `FIREBASE_SERVICE_ACCOUNT_KEY` (JSON string for admin SDK)
- `IMGBB_API_KEY`, `IMGBB_API_KEY_FORM`

## Recent Changes
- 2026-02-11: Adapted from Vercel deployment to Replit. Created Express server to serve static files and handle API routes.
