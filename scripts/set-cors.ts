import { bucket } from '../db';
async function run() {
    try {
        if (!bucket) throw new Error("No bucket");
        await bucket.setCorsConfiguration([
            {
                method: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                origin: ['*'],
                responseHeader: ['*'],
                maxAgeSeconds: 3600
            }
        ]);
        console.log("CORS updated successfully!");
        process.exit(0);
    } catch (e) {
        console.error("CORS SET ERROR:", e);
        process.exit(1);
    }
}
run();
