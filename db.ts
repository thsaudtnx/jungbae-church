import admin from 'firebase-admin';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Check if serviceAccountKey.json exists
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

let db: admin.firestore.Firestore;
let bucket: any;

try {
    const config = {
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'jungbae-church.firebasestorage.app'
    };

    if (fs.existsSync(serviceAccountPath)) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath),
            ...config
        });
        db = admin.firestore();
        bucket = admin.storage().bucket();
        console.log(`Firebase initialized from serviceAccountKey.json. Bucket: ${config.storageBucket}`);
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            ...config
        });
        db = admin.firestore();
        bucket = admin.storage().bucket();
        console.log(`Firebase initialized from environment variable. Bucket: ${config.storageBucket}`);
    } else {
        console.warn("Warning: serviceAccountKey.json not found and FIREBASE_SERVICE_ACCOUNT env var is empty.");
    }
} catch (error) {
    console.error("Error initializing Firebase:", error);
}

export { db, admin, bucket };
