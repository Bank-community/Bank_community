// File Path: /api/imgbb-key.js

export default function handler(request, response) {
  // This securely accesses the key from Vercel's environment variables
  const apiKey = process.env.IMGBB_API_KEY;

  if (!apiKey) {
    return response.status(500).json({ error: 'IMGBB API key is not configured on the server.' });
  }

  // Send the key to the frontend
  response.status(200).json({ key: apiKey });
}

