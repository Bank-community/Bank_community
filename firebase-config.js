// firebase-config.js

// Firebase v9 se zaroori functions import karein.
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// Yeh function Vercel se aapka configuration laayega.
// Aapko '/api/firebase-config' ko apne sahi API endpoint se badalna pad sakta hai.
const response = await fetch('/api/firebase-config');
const firebaseConfig = await response.json();

// Firebase App ko initialize karein.
const app = initializeApp(firebaseConfig);

// Authentication aur Realtime Database services ko prapt karein.
const auth = getAuth(app);
const database = getDatabase(app);

// In services ko export karein taaki dusri files inka upyog kar sakein.
export { auth, database };

