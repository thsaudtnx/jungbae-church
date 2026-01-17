import admin from 'firebase-admin';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Check if serviceAccountKey.json exists
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

let db: admin.firestore.Firestore;

try {
    if (fs.existsSync(serviceAccountPath)) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath)
        });
        db = admin.firestore();
        console.log("Firebase initialized successfully.");
    } else {
        console.warn("Warning: serviceAccountKey.json not found. Firebase is NOT initialized.");
        // We might want to allow the app to start without DB for debugging, but typically we need it.
        // For now, we'll instantiate a dummy or throw error when used.
    }
} catch (error) {
    console.error("Error initializing Firebase:", error);
}

export { db, admin };
