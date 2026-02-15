// rules.js

// Firebase Config Import (Path check kar lena agar file alag folder me hai)
import { db } from './core/firebaseConfig.js'; 
import { ref, onValue } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// --- Elements ---
const rulesContainer = document.getElementById('rules-container');
const videosContainer = document.getElementById('videos-container');
const btnRules = document.getElementById('show-rules-btn');
const btnVideos = document.getElementById('show-videos-btn');
const rulesBadge = document.getElementById('rules-badge');
const videosBadge = document.getElementById('videos-badge');

// --- Helper: Get YouTube ID from URL ---
function getYouTubeID(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// --- 1. FETCH RULES (Images) ---
const rulesRef = ref(db, 'admin/rules');
onValue(rulesRef, (snapshot) => {
    const data = snapshot.val();
    rulesContainer.innerHTML = ''; // Clear loader

    if (!data) {
        rulesContainer.innerHTML = '<div class="loader-box">No rules found.</div>';
        rulesBadge.textContent = '(0)';
        return;
    }

    const rulesList = Object.values(data);
    rulesBadge.textContent = `(${rulesList.length})`;

    rulesList.forEach(rule => {
        const div = document.createElement('div');
        div.className = 'cert-card';
        div.innerHTML = `
            <img src="${rule.imageUrl}" alt="Rule" class="cert-image" loading="lazy">
            <div class="cert-footer">
                <h3 class="cert-title">${rule.title || 'Official Rule'}</h3>
            </div>
        `;
        rulesContainer.appendChild(div);
    });
});

// --- 2. FETCH VIDEOS (YouTube) ---
// Note: Hum 'admin/videos' check kar rahe hain kyunki controller wahi save karta hai.
const videosRef = ref(db, 'admin/videos');
onValue(videosRef, (snapshot) => {
    const data = snapshot.val();
    videosContainer.innerHTML = ''; // Clear loader

    if (!data) {
        videosContainer.innerHTML = '<div class="loader-box">No videos found.<br><small>Add videos from Admin > Rules Manager</small></div>';
        videosBadge.textContent = '(0)';
        console.warn("No videos found at path: admin/videos");
        return;
    }

    const videosList = Object.values(data);
    videosBadge.textContent = `(${videosList.length})`;

    videosList.forEach(video => {
        const videoId = getYouTubeID(video.url);
        if (!videoId) return;

        const div = document.createElement('div');
        div.className = 'video-card';
        div.innerHTML = `
            <div class="video-wrapper">
                <iframe src="https://www.youtube.com/embed/${videoId}" allowfullscreen referrerpolicy="no-referrer"></iframe>
            </div>
            <div class="video-info">
                <div class="play-icon"><i class="ph-play-fill"></i></div>
                <div class="video-text">
                    <h3>${video.title || 'Tutorial Video'}</h3>
                </div>
            </div>
        `;
        videosContainer.appendChild(div);
    });
}, (error) => {
    console.error("Firebase Error:", error);
    videosContainer.innerHTML = `<div class="loader-box text-red-500">Error loading videos: ${error.message}</div>`;
});

// --- 3. TOGGLE TABS Logic ---
btnRules.addEventListener('click', () => {
    btnRules.classList.add('active');
    btnVideos.classList.remove('active');
    rulesContainer.classList.remove('hidden');
    videosContainer.classList.add('hidden');
});

btnVideos.addEventListener('click', () => {
    btnVideos.classList.add('active');
    btnRules.classList.remove('active');
    videosContainer.classList.remove('hidden');
    rulesContainer.classList.add('hidden');
});
