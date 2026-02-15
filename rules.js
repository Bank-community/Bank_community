// rules.js

// Firebase Config Import karein
import { db } from './core/firebaseConfig.js'; 
import { ref, onValue } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// --- DOM Elements ---
const rulesSection = document.getElementById('rules-section');
const videosSection = document.getElementById('videos-section');
const btnShowRules = document.getElementById('btn-show-rules');
const btnShowVideos = document.getElementById('btn-show-videos');
const rulesCountEl = document.getElementById('rules-count');
const videosCountEl = document.getElementById('videos-count');

// --- Helper: Get YouTube ID ---
function getYouTubeID(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// --- 1. FETCH RULES (Images) ---
const rulesRef = ref(db, 'admin/rules');
onValue(rulesRef, (snapshot) => {
    const data = snapshot.val() || {};
    const rulesList = Object.values(data);
    
    // Update Count
    rulesCountEl.textContent = rulesList.length;

    // Render HTML
    if (rulesList.length === 0) {
        rulesSection.innerHTML = '<p class="loader-container">No rules found.</p>';
        return;
    }

    rulesSection.innerHTML = rulesList.map(rule => `
        <div class="card">
            <img src="${rule.imageUrl}" alt="Rule" class="rule-image" loading="lazy">
            <div class="card-footer">
                <h3 class="card-title">${rule.title || 'Official Rule'}</h3>
            </div>
        </div>
    `).join('');
});

// --- 2. FETCH VIDEOS (YouTube) ---
const videosRef = ref(db, 'admin/videos');
onValue(videosRef, (snapshot) => {
    const data = snapshot.val() || {};
    const videosList = Object.values(data);
    
    // Update Count
    videosCountEl.textContent = videosList.length;

    // Render HTML
    if (videosList.length === 0) {
        videosSection.innerHTML = '<p class="loader-container">No videos found.</p>';
        return;
    }

    videosSection.innerHTML = videosList.map(video => {
        const videoId = getYouTubeID(video.url);
        return `
        <div class="card">
            <div class="video-container">
                <iframe src="https://www.youtube.com/embed/${videoId}" allowfullscreen></iframe>
            </div>
            <div class="card-footer">
                <h3 class="card-title" style="font-size:14px;">${video.title || 'Tutorial Video'}</h3>
            </div>
        </div>
        `;
    }).join('');
});

// --- 3. TOGGLE TABS LOGIC ---

btnShowRules.addEventListener('click', () => {
    // Buttons styling
    btnShowRules.classList.add('active');
    btnShowVideos.classList.remove('active');
    
    // Show/Hide Sections
    rulesSection.classList.remove('hidden');
    videosSection.classList.add('hidden');
});

btnShowVideos.addEventListener('click', () => {
    // Buttons styling
    btnShowVideos.classList.add('active');
    btnShowRules.classList.remove('active');
    
    // Show/Hide Sections
    videosSection.classList.remove('hidden');
    rulesSection.classList.add('hidden');
});
