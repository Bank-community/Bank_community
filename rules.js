// rules.js

// IMPORTANT: Path check kar lena ki 'core' folder sahi jagah hai
import { db } from './core/firebaseConfig.js'; 
import { ref, onValue } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// DOM Elements
const btnRules = document.getElementById('btn-rules');
const btnVideos = document.getElementById('btn-videos');
const rulesSection = document.getElementById('rules-section');
const videosSection = document.getElementById('videos-section');

// --- HELPER: YouTube URL se ID nikalna ---
function getYouTubeID(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// --- 1. FETCH RULES (From admin/rules) ---
const rulesRef = ref(db, 'admin/rules');
onValue(rulesRef, (snapshot) => {
    const data = snapshot.val();
    rulesSection.innerHTML = ''; // Clear loader

    if (!data) {
        rulesSection.innerHTML = '<div class="status-msg">No rules added yet.</div>';
        return;
    }

    const list = Object.values(data);
    // Reverse to show newest first
    list.reverse().forEach(rule => {
        const div = document.createElement('div');
        div.className = 'rule-card';
        div.innerHTML = `
            <img src="${rule.imageUrl}" alt="Rule" class="rule-img" loading="lazy">
            <div class="rule-footer">${rule.title || 'Official Rule'}</div>
        `;
        rulesSection.appendChild(div);
    });
});

// --- 2. FETCH VIDEOS (From admin/videos) ---
// Screenshot confirm karta hai ki path 'admin/videos' hi hai.
const videosRef = ref(db, 'admin/videos');
onValue(videosRef, (snapshot) => {
    const data = snapshot.val();
    videosSection.innerHTML = ''; // Clear loader

    if (!data) {
        videosSection.innerHTML = '<div class="status-msg">No videos found in admin/videos.<br>Please add from Admin Panel.</div>';
        console.warn("DEBUG: No data found at admin/videos");
        return;
    }

    console.log("DEBUG: Videos Data Found", data);
    const list = Object.values(data);
    
    list.reverse().forEach(video => {
        const videoId = getYouTubeID(video.url);
        if(videoId) {
            const div = document.createElement('div');
            div.className = 'video-card';
            div.innerHTML = `
                <div class="video-wrapper">
                    <iframe src="https://www.youtube.com/embed/${videoId}" allowfullscreen title="${video.title}"></iframe>
                </div>
                <div class="video-title">${video.title || 'Video Tutorial'}</div>
            `;
            videosSection.appendChild(div);
        }
    });
}, (error) => {
    videosSection.innerHTML = `<div class="status-msg text-red-600">Error: ${error.message}</div>`;
    console.error("Firebase Error:", error);
});

// --- 3. TOGGLE BUTTONS LOGIC ---

btnRules.addEventListener('click', () => {
    // Styling
    btnRules.classList.remove('inactive');
    btnVideos.classList.add('inactive');
    btnVideos.classList.remove('active');
    
    // Visibility
    rulesSection.classList.remove('hidden');
    videosSection.classList.add('hidden');
});

btnVideos.addEventListener('click', () => {
    // Styling
    btnVideos.classList.add('active');
    btnVideos.classList.remove('inactive');
    btnRules.classList.add('inactive');
    
    // Visibility
    videosSection.classList.remove('hidden');
    rulesSection.classList.add('hidden');
});
