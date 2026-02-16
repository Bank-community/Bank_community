// rules.js

// 1. Firebase Imports (Path wahi rakhein jo aapke admin.html me chalta hai)
import { db } from './core/firebaseConfig.js'; 
import { ref, onValue } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// 2. DOM Elements
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

// --- 3. FETCH RULES (From admin/rules) ---
const rulesRef = ref(db, 'admin/rules');
onValue(rulesRef, (snapshot) => {
    const data = snapshot.val();
    rulesSection.innerHTML = ''; // Clear loader

    if (!data) {
        rulesSection.innerHTML = '<div class="status-msg">No rules found.</div>';
        return;
    }

    const list = Object.values(data);
    list.forEach(rule => {
        const div = document.createElement('div');
        div.className = 'rule-card';
        div.innerHTML = `
            <img src="${rule.imageUrl}" alt="Rule" class="rule-img" loading="lazy">
            <div class="rule-footer">${rule.title || 'Rule'}</div>
        `;
        rulesSection.appendChild(div);
    });
});

// --- 4. FETCH VIDEOS (From admin/videos) ---
// Screenshot ke hisab se data 'admin/videos' mein hai
const videosRef = ref(db, 'admin/videos');
onValue(videosRef, (snapshot) => {
    const data = snapshot.val();
    videosSection.innerHTML = ''; // Clear loader

    if (!data) {
        videosSection.innerHTML = '<div class="status-msg">No videos found.</div>';
        // Debugging ke liye console me print karega
        console.log("Videos path checked: admin/videos (Data is empty or null)");
        return;
    }

    const list = Object.values(data);
    list.forEach(video => {
        const videoId = getYouTubeID(video.url);
        if(videoId) {
            const div = document.createElement('div');
            div.className = 'video-card';
            div.innerHTML = `
                <div class="video-wrapper">
                    <iframe src="https://www.youtube.com/embed/${videoId}" allowfullscreen></iframe>
                </div>
                <div class="video-title">${video.title || 'Video Tutorial'}</div>
            `;
            videosSection.appendChild(div);
        }
    });
}, (error) => {
    // Agar permission error aaye to yahan dikhega
    videosSection.innerHTML = `<div class="status-msg" style="color:red;">Error: ${error.message}</div>`;
    console.error("Firebase Error:", error);
});

// --- 5. BUTTON CLICK LOGIC (Toggle) ---

btnRules.addEventListener('click', () => {
    // Style update
    btnRules.classList.add('active');
    btnVideos.classList.remove('active');
    
    // View update
    rulesSection.classList.remove('hidden');
    videosSection.classList.add('hidden');
});

btnVideos.addEventListener('click', () => {
    // Style update
    btnVideos.classList.add('active');
    btnRules.classList.remove('active');
    
    // View update
    videosSection.classList.remove('hidden');
    rulesSection.classList.add('hidden');
});
