import { db } from './db';

const worshipServices = [
    { name: '주일 오전 1부 예배', time: '오전 9시', place: '본당' },
    { name: '주일 오전 2부 예배', time: '오전 11시', place: '본당' },
    { name: '아동부', time: '주일 오전 11시', place: '교육관' },
    { name: '청소년부', time: '주일 오전 11시', place: '교육관' },
    { name: '주일 오후예배', time: '오후 1시 20분', place: '본당' },
    { name: '수요 기도회', time: '수요일 오후 7시 30분', place: '본당' },
    { name: '새벽기도회', time: '월~토 오전 5시 30분', place: '본당' }
];

const staffMembers = [
    { role: '원로목사', name: '류인원' },
    { role: '담임목사', name: '정대진' },
    { role: '교육전도사', name: '한순애' },
    { role: '지휘자', name: '이은숙' },
    { role: '반주자', name: '신현주, 권영민' }
];

async function updateData() {
    if (!db) {
        console.error('Database connection failed');
        return;
    }

    // Update Worship Services
    console.log('Updating worship services...');
    const servicesRef = db.collection('worshipServices');
    const existingServices = await servicesRef.get();

    // Clear existing to avoid duplicates during initial setup
    for (const doc of existingServices.docs) {
        await doc.ref.delete();
    }

    for (const service of worshipServices) {
        await servicesRef.add(service);
    }

    // Update Staff Members
    console.log('Updating staff members...');
    const staffRef = db.collection('staffMembers');
    const existingStaff = await staffRef.get();

    for (const doc of existingStaff.docs) {
        await doc.ref.delete();
    }

    for (const staff of staffMembers) {
        await staffRef.add(staff);
    }

    console.log('Update complete!');
}

updateData().catch(console.error);
