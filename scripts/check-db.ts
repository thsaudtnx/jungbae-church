import { db } from '../db';

async function check() {
    try {
        if (!db) throw new Error('DB not initialized');
        const snapshot = await db.collection('meditations').get();
        console.log('Meditation count:', snapshot.size);
        snapshot.docs.forEach((doc: any) => {
            console.log('ID:', doc.id, 'Data:', doc.data());
        });
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

check();
