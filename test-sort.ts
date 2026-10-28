import { db } from './db';
async function test() {
    const s = await db.collection('sermons').get();
    let items = s.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
    items.sort((a, b) => {
        const orderA = a.order !== undefined ? Number(a.order) : Infinity;
        const orderB = b.order !== undefined ? Number(b.order) : Infinity;

        if (orderA !== orderB) {
            return orderA - orderB;
        }
        if (a.date && b.date) {
            return a.date < b.date ? 1 : -1;
        }
        return 0;
    });
    console.log("From getCollection:", items.map(i => i.date).slice(0, 5));

    let allSermons = [...items];
    allSermons.sort((a, b) => (a.date < b.date ? 1 : -1));
    console.log("From individual page:", allSermons.map(i => i.date).slice(0, 5));

    process.exit(0);
}
test();
