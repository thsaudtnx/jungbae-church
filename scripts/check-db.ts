import { db } from './db';

async function check() {
    try {
        const snapshot = await db.collection('meditations').get();
        console.log('Meditation count:', snapshot.size);
        snapshot.docs.forEach(doc => {
            console.log('ID:', doc.id, 'Data:', doc.data());
        });
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

check();
