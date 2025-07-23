// login.js

// Firebase config se 'auth' object import karein.
import { auth } from './firebase-config.js';
// Firebase auth se zaroori function import karein.
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

const loginForm = document.getElementById('loginForm');
const errorMessageElement = document.getElementById('errorMessage');
const loginBtn = document.getElementById('loginBtn');
const loginBtnText = document.getElementById('loginBtnText');
const loader = document.getElementById('loader');

// Redirect URL ko check karein.
const urlParams = new URLSearchParams(window.location.search);
const redirectUrl = urlParams.get('redirect');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMessageElement.style.display = 'none';
    loginBtn.disabled = true;
    loginBtnText.style.display = 'none';
    loader.style.display = 'inline-block';

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const adminUid = 'hWsZo6gONzOOccP7y4GCT4oV93A2'; // Aapka Admin UID

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        if (user.uid === adminUid) {
            sessionStorage.setItem('isAdminLoggedIn', 'true');
            // Agar redirect URL hai to wahan, nahi to admin page par jayein.
            window.location.href = redirectUrl || '/admin.html'; 
        } else {
            // Regular members hamesha index.html par jayenge.
            window.location.href = '/index.html'; 
        }

    } catch (error) {
        errorMessageElement.textContent = 'Galat email ya password. Kripya punah prayas karein.';
        errorMessageElement.style.display = 'block';
        console.error("Login Error:", error);
    } finally {
        loginBtn.disabled = false;
        loginBtnText.style.display = 'inline';
        loader.style.display = 'none';
    }
});

