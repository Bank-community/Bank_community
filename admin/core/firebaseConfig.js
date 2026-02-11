// core/firebaseConfig.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBVCDW0Q8YaTPz_MO9FTve1FaPu42jtO2c",
    authDomain: "bank-master-data.firebaseapp.com",
    databaseURL: "https://bank-master-data-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "bank-master-data",
    storageBucket: "bank-master-data.firebasestorage.app",
    messagingSenderId: "778113641069",
    appId: "1:778113641069:web:f2d584555dee89b8ca2d64",
    measurementId: "G-JF1DCDTFJ2"
};

// App Initialize
const app = initializeApp(firebaseConfig);

// Auth aur Database ko export kar rahe hain taaki dusri files iska use kar sakein
export const auth = getAuth(app);
export const db = getDatabase(app);