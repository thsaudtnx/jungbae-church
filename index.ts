import express from 'express';
import path from 'path';
import session from 'express-session';
import multer from 'multer';
import { db, bucket } from './db';
import fs from 'fs';

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'jungbae-secret-key', // In production, use environment variable
    resave: false,
    saveUninitialized: true
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));

// Static files
app.use(express.static(path.join(process.cwd(), 'public')));

// Multer setup for file uploads (Memory storage for Firebase)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Helper function to upload to Firebase Storage
async function uploadToFirebase(file: any): Promise<string> {
    if (!bucket) {
        throw new Error('Firebase Storage bucket not initialized');
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileName = `uploads/${uniqueSuffix}${path.extname(file.originalname)}`;
    const blob = bucket.file(fileName);

    const blobStream = blob.createWriteStream({
        metadata: {
            contentType: file.mimetype
        },
        resumable: false
    });

    return new Promise((resolve, reject) => {
        blobStream.on('error', (error: any) => reject(error));
        blobStream.on('finish', async () => {
            // Make the file public
            await blob.makePublic();
            // Construct the public URL
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
            resolve(publicUrl);
        });
        blobStream.end(file.buffer);
    });
}

// Helper functions for Data (Firestore)
async function getCollection(collectionName: string) {
    if (!db) return [];
    try {
        const snapshot = await db.collection(collectionName).get();
        // Since we don't have a guaranteed 'date' field or consistent date format in all collections yet, 
        // we map it simply. We can improve sorting later.
        let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

        // Sort by 'order' ASC if exists, then by 'date' DESC
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

        return items;
    } catch (err) {
        console.error(`Error reading ${collectionName}:`, err);
        return [];
    }
}

async function getItem(collectionName: string, id: string) {
    if (!db) return null;
    try {
        const doc = await db.collection(collectionName).doc(id).get();
        if (doc.exists) return { id: doc.id, ...doc.data() };
        return null;
    } catch (err) {
        console.error(`Error reading item ${collectionName}/${id}:`, err);
        return null;
    }
}

// Make user info available to all views
app.use((req, res, next) => {
    res.locals.user = (req.session as any).user || null;
    next();
});

// Schemas for different content types
const SCHEMAS: any = {
    sermons: [
        { name: 'title', label: '설교 제목' },
        { name: 'date', label: '날짜', type: 'date' },
        { name: 'preacher', label: '설교자' },
        { name: 'content', label: '설교 원고', type: 'textarea' },
        { name: 'videoId', label: '유튜브 영상 ID (선택사항)' }
    ],
    meditations: [
        { name: 'title', label: '제목' },
        { name: 'date', label: '날짜', type: 'date' },
        { name: 'summary', label: '내용 요약', type: 'textarea' }
    ],
    diaries: [
        { name: 'title', label: '제목' },
        { name: 'date', label: '날짜', type: 'date' },
        { name: 'content', label: '내용', type: 'textarea' }
    ],
    notices: [
        { name: 'title', label: '제목' },
        { name: 'date', label: '날짜', type: 'date' },
        { name: 'views', label: '조회수', type: 'number' }
    ],
    bulletins: [
        { name: 'title', label: '주보 제목' },
        { name: 'date', label: '날짜', type: 'date' }
    ],
    galleryItems: [
        { name: 'title', label: '제목' },
        { name: 'date', label: '날짜', type: 'date' },
        { name: 'image', label: '이미지 파일명' }
    ],
    philosophies: [
        { name: 'content', label: '내용', type: 'textarea' }
    ],
    pastorProfiles: [
        { name: 'image', label: '목사님 사진', type: 'file' },
        { name: 'name', label: '이름명' },
        { name: 'description', label: '소개글', type: 'textarea' }
    ],
    worshipServices: [
        { name: 'name', label: '예배명' },
        { name: 'time', label: '시간' },
        { name: 'place', label: '장소' }
    ],
    staffMembers: [
        { name: 'role', label: '직분' },
        { name: 'name', label: '이름' }
    ]
};

// Routes

// Login & Admin
app.get('/login', (req, res) => {
    res.render('login', { title: '관리자 로그인 - 정배교회' });
});

app.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === 'jungbae1234') {
        (req.session as any).user = { isAdmin: true };
        res.redirect('/');
    } else {
        res.send('<script>alert("비밀번호가 틀렸습니다."); history.back();</script>');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// Home
app.get('/', (req, res) => {
    res.render('index', { title: '정배교회', page: 'home' });
});

// Church Section
app.get('/church/philosophy', async (req, res) => {
    const items = await getCollection('philosophies');
    const philosophy = items.length > 0 ? items[0] : { title: '목회철학', content: '' };
    res.render('church/philosophy', { title: '목회철학 - 정배교회', page: 'church-philosophy', philosophy });
});
app.get('/church/pastor', async (req, res) => {
    const items = await getCollection('pastorProfiles');
    const pastor = items.length > 0 ? items[0] : { name: '', role: '', description: '' };
    res.render('church/pastor', { title: '담임목사 소개 - 정배교회', page: 'church-pastor', pastor });
});
app.get('/church/worship', async (req, res) => {
    const services = await getCollection('worshipServices');
    const staff = await getCollection('staffMembers');
    res.render('church/worship', { title: '예배 안내 - 정배교회', page: 'church-worship', services, staff });
});
app.get('/church/location', (req, res) => {
    res.render('church/location', { title: '오시는 길 - 정배교회', page: 'church-location' });
});

// Word Section
app.get('/word/sermons', async (req, res) => {
    const sermons = await getCollection('sermons');
    res.render('word/sermons', { title: '주일설교 - 정배교회', page: 'word-sermons', sermons });
});
app.get('/word/sermons/:id', async (req, res) => {
    const sermon = await getItem('sermons', req.params.id);
    if (!sermon) return res.status(404).send('Sermon not found');
    res.render('word/sermon-view', { title: (sermon as any).title + ' - 정배교회', page: 'word-sermons', sermon });
});
app.get('/word/meditation', async (req, res) => {
    const meditations = await getCollection('meditations');
    res.render('word/meditation', { title: '새벽묵상 - 정배교회', page: 'word-meditation', meditations });
});
app.get('/word/diary', async (req, res) => {
    const diaries = await getCollection('diaries');
    res.render('word/diary', { title: '목회일기 - 정배교회', page: 'word-diary', diaries });
});

// Sharing Section
app.get('/sharing/notices', async (req, res) => {
    const notices = await getCollection('notices');
    res.render('sharing/notices', { title: '공지사항 - 정배교회', page: 'sharing-notices', notices });
});
app.get('/sharing/bulletin', async (req, res) => {
    const bulletins = await getCollection('bulletins');
    res.render('sharing/bulletin', { title: '주보 - 정배교회', page: 'sharing-bulletin', bulletins });
});
app.get('/sharing/gallery', async (req, res) => {
    const galleryItems = await getCollection('galleryItems');
    res.render('sharing/gallery', { title: '교회앨범 - 정배교회', page: 'sharing-gallery', galleryItems });
});

// Admin Routes

// Create Page
app.get('/admin/write/:type', (req, res) => {
    if (!(req.session as any).user?.isAdmin) return res.redirect('/login');
    const { type } = req.params;
    const schema = SCHEMAS[type];
    if (!schema) return res.status(404).send('Invalid Type');

    res.render('admin/write', {
        title: '글 작성',
        action: 'create',
        type,
        fields: schema,
        item: null
    });
});

// Edit Page
app.get('/admin/edit/:type/:id', async (req, res) => {
    if (!(req.session as any).user?.isAdmin) return res.redirect('/login');
    const { type, id } = req.params;
    const schema = SCHEMAS[type];
    const item = await getItem(type, id);

    if (!item) return res.status(404).send('Item not found');

    res.render('admin/write', {
        title: '글 수정',
        action: 'update',
        type,
        fields: schema,
        item
    });
});

// Create Logic
app.post('/admin/create/:type', upload.any(), async (req, res) => {
    if (!(req.session as any).user?.isAdmin) return res.sendStatus(403);
    const { type } = req.params;
    const items = { ...req.body };

    // Handle uploaded files to Firebase Storage
    if (req.files && Array.isArray(req.files)) {
        for (const file of req.files as any[]) {
            const publicUrl = await uploadToFirebase(file);
            items[file.fieldname] = publicUrl;
        }
    }

    if (db) {
        // Handle potential array inputs if multiple items (not typical for this form, but good to be safe)
        // Or normally it is just req.body for a single document
        await db.collection(type).add(items);
    }

    // Redirect logic mapping
    const urlMap: any = {
        sermons: '/word/sermons',
        meditations: '/word/meditation',
        diaries: '/word/diary',
        notices: '/sharing/notices',
        bulletins: '/sharing/bulletin',
        galleryItems: '/sharing/gallery',
        philosophies: '/church/philosophy',
        pastorProfiles: '/church/pastor',
        worshipServices: '/church/worship'
    };
    const listUrl = urlMap[type] || '/';
    res.redirect(listUrl);
});

// Update Logic
app.post('/admin/update/:type', upload.any(), async (req, res) => {
    if (!(req.session as any).user?.isAdmin) return res.sendStatus(403);
    const { type } = req.params;
    const { id, ...updates } = req.body;

    // Handle uploaded files to Firebase Storage
    if (req.files && Array.isArray(req.files)) {
        for (const file of req.files as any[]) {
            const publicUrl = await uploadToFirebase(file);
            updates[file.fieldname] = publicUrl;
        }
    }

    if (db) {
        await db.collection(type).doc(id).update(updates);
    }

    // Redirect logic
    const urlMap: any = {
        sermons: '/word/sermons',
        meditations: '/word/meditation',
        diaries: '/word/diary',
        notices: '/sharing/notices',
        bulletins: '/sharing/bulletin',
        galleryItems: '/sharing/gallery',
        philosophies: '/church/philosophy',
        pastorProfiles: '/church/pastor',
        worshipServices: '/church/worship'
    };
    const listUrl = urlMap[type] || '/';
    res.redirect(listUrl);
});

// Delete Logic
app.get('/admin/delete/:type/:id', async (req, res) => {
    if (!(req.session as any).user?.isAdmin) return res.sendStatus(403);
    const { type, id } = req.params;

    if (db) {
        await db.collection(type).doc(id).delete();
    }

    res.redirect('back');
});


export default app;

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running at http://localhost:${PORT}`);
    });
}
