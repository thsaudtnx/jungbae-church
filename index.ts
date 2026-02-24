import express from 'express';
import path from 'path';
import session from 'express-session';
import { Firestore } from '@google-cloud/firestore';
const FirestoreStore = require('@google-cloud/connect-firestore').FirestoreStore;
import multer from 'multer';
import { db, bucket } from './db';
import bcrypt from 'bcrypt';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Proxy (Essential for session cookies on Vercel/Render)
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup Firestore Session Store
app.use(session({
    store: new FirestoreStore({
        dataset: db as any,
        kind: 'sessions', // Collection name in Firestore
    }),
    secret: 'jungbae-secret-key',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    }
}));

// Make user session available in all views
app.use((req, res, next) => {
    // Debug log
    if (req.path !== '/favicon.ico' && !req.path.startsWith('/images') && !req.path.startsWith('/css')) {
        const sessUser = (req.session as any).user;
        console.log(`[${req.method}] ${req.path} - Session User:`, sessUser ? `Admin Logged In` : 'None');
    }

    res.locals.user = (req.session as any).user || null;
    next();
});

// Prevent browser from caching pages (Fixes back-button showing logged-in state after logout)
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    next();
});

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

// Helper function to extract YouTube video ID from URL or Iframe
function extractYouTubeId(url: string): string {
    if (!url) return '';
    const trimmed = url.trim();

    // 1. <iframe> 소스코드에서 추출 시도
    if (trimmed.includes('<iframe')) {
        const srcMatch = trimmed.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
        if (srcMatch) return srcMatch[1];
    }

    // 2. 주소창 주소에서 추출 시도
    try {
        if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
            // URL 객체를 사용하여 쿼리 파라미터(v=) 추출
            if (trimmed.includes('?')) {
                const searchParams = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`).searchParams;
                const v = searchParams.get('v');
                if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
            }
        }
    } catch (e) { }

    // 3. 정규식으로 모든 패턴에서 11자리 ID 검색
    const patterns = [
        /(?:v=|v\/|embed\/|youtu\.be\/|live\/)([a-zA-Z0-9_-]{11})/,
        /^[a-zA-Z0-9_-]{11}$/
    ];

    for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) return match[1] || match[0];
    }

    return ''; // 찾지 못하면 빈 값 반환 (잘못된 영상 출력 방지)
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


// Schemas for different content types
const SCHEMAS: any = {
    sermons: [
        { name: 'title', label: '설교 제목' },
        { name: 'date', label: '날짜', type: 'date' },
        { name: 'preacher', label: '설교자' },
        { name: 'content', label: '설교 원고', type: 'textarea' },
        { name: 'videoId', label: '유튜브 영상 (URL 또는 ID)' }
    ],
    meditations: [
        { name: 'title', label: '제목' },
        { name: 'date', label: '날짜', type: 'date' },
        { name: 'summary', label: '내용', type: 'textarea' }
    ],
    diaries: [
        { name: 'title', label: '제목' },
        { name: 'date', label: '날짜', type: 'date' },
        { name: 'content', label: '내용', type: 'textarea' }
    ],
    notices: [
        { name: 'title', label: '제목' },
        { name: 'date', label: '날짜', type: 'date' },
        { name: 'content', label: '내용', type: 'textarea' },
        { name: 'file', label: '첨부파일', type: 'file' }
    ],
    bulletins: [
        { name: 'title', label: '주보 제목' },
        { name: 'date', label: '날짜', type: 'date' },
        { name: 'file', label: '주보 파일', type: 'file' }
    ],
    galleryItems: [
        { name: 'title', label: '제목' },
        { name: 'date', label: '날짜', type: 'date' },
        { name: 'images', label: '이미지 선택(여러 개 가능)', type: 'file', multiple: true }
    ],
    philosophies: [
        { name: 'content', label: '내용', type: 'textarea' }
    ],
    pastorProfiles: [
        { name: 'image', label: '목사님 사진', type: 'file' },
        { name: 'name', label: '이름' },
        { name: 'role', label: '직격 (예: 담임목사)' },
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
    ],
    worshipGuides: [
        { name: 'title', label: '제목' },
        { name: 'content', label: '설명 내용', type: 'textarea' }
    ],
    histories: [
        { name: 'yearRange', label: '연도 범위 (예: 2020 ~ 현재)' },
        { name: 'date', label: '상세 날짜 (예: 2023. 02)' },
        { name: 'content', label: '연혁 내용', type: 'textarea' },
        { name: 'order', label: '정렬 순서 (숫자가 작을수록 위로)', type: 'number' }
    ],
    bibleStudies: [
        { name: 'title', label: '제목' },
        { name: 'date', label: '날짜', type: 'date' },
        { name: 'videoId', label: '유튜브 영상 (URL 또는 ID)' },
        { name: 'content', label: '내용', type: 'textarea' }
    ]
};

// Routes

// Login & Admin
app.get('/login', (req, res) => {
    res.render('login', { title: '관리자 로그인 - 정배교회' });
});

app.post('/login', async (req, res) => {
    const { password } = req.body;

    if (!db) {
        return res.send('<script>alert("데이터베이스 연결 실패"); history.back();</script>');
    }

    try {
        const adminDoc = await db.collection('settings').doc('admin').get();
        let isMatch = false;

        if (adminDoc.exists) {
            const adminData = adminDoc.data();
            isMatch = await bcrypt.compare(password, adminData?.password);
        } else {
            // Fallback for first-time setup or if initialization fails
            isMatch = (password === 'jungbae1234');
        }

        if (isMatch) {
            (req.session as any).user = { id: 'admin', isAdmin: true };
            res.redirect('/');
        } else {
            res.send('<script>alert("비밀번호가 틀렸습니다."); history.back();</script>');
        }
    } catch (err) {
        console.error('Login error:', err);
        res.send('<script>alert("로그인 중 오류가 발생했습니다."); history.back();</script>');
    }
});

// Admin Dashboard
app.get('/admin/dashboard', async (req, res) => {
    if (!(req.session as any).user?.isAdmin) return res.redirect('/login');

    // Fetch all collections for statistics
    const sermons = await getCollection('sermons');
    const meditations = await getCollection('meditations');
    const diaries = await getCollection('diaries');
    const notices = await getCollection('notices');
    const bulletins = await getCollection('bulletins');
    const galleryItems = await getCollection('galleryItems');

    // Statistics
    const stats = {
        sermons: sermons.length,
        meditations: meditations.length,
        diaries: diaries.length,
        notices: notices.length,
        bulletins: bulletins.length,
        gallery: galleryItems.length
    };

    // Recent content (latest 5 from each)
    const recentContent = {
        sermons: sermons.slice(0, 5),
        notices: notices.slice(0, 5),
        bulletins: bulletins.slice(0, 3)
    };

    res.render('admin/dashboard', {
        title: '관리자 대시보드 - 정배교회',
        page: 'admin-dashboard',
        stats,
        recentContent
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid'); // Clear the session cookie
        res.redirect('/');
    });
});

app.get('/admin/change-password', (req, res) => {
    if (!(req.session as any).user?.isAdmin) return res.redirect('/login');
    res.render('admin/change-password', { title: '비밀번호 변경 - 정배교회' });
});

app.post('/admin/change-password', async (req, res) => {
    if (!(req.session as any).user?.isAdmin) return res.sendStatus(403);
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
        return res.send('<script>alert("새 비밀번호와 확인 비밀번호가 일치하지 않습니다."); history.back();</script>');
    }

    if (!db) return res.send('<script>alert("데이터베이스 연결 실패"); history.back();</script>');

    try {
        const adminDoc = await db.collection('settings').doc('admin').get();
        if (adminDoc.exists) {
            const adminData = adminDoc.data();
            const isMatch = await bcrypt.compare(currentPassword, adminData?.password);

            if (isMatch) {
                const hashedNewPassword = await bcrypt.hash(newPassword, 10);
                await db.collection('settings').doc('admin').update({
                    password: hashedNewPassword,
                    updatedAt: new Date()
                });
                res.send('<script>alert("비밀번호가 성공적으로 변경되었습니다. 다시 로그인해주세요."); location.href="/logout";</script>');
            } else {
                res.send('<script>alert("현재 비밀번호가 틀렸습니다."); history.back();</script>');
            }
        } else {
            res.send('<script>alert("관리자 정보를 찾을 수 없습니다."); history.back();</script>');
        }
    } catch (err) {
        console.error('Password change error:', err);
        res.send('<script>alert("비밀번호 변경 중 오류가 발생했습니다."); history.back();</script>');
    }
});

// Search
app.get('/search', async (req, res) => {
    const keyword = (req.query.q as string || '').trim();
    if (!keyword) return res.render('search-results', { title: '검색 - 정배교회', page: 'search', results: [], keyword });

    const collections = [
        { id: 'sermons', label: '주일설교', link: '/word/sermons' },
        { id: 'meditations', label: '새벽묵상', link: '/word/meditation' },
        { id: 'diaries', label: '목회일기', link: '/word/diary' },
        { id: 'notices', label: '공지사항', link: '/sharing/notices' },
        { id: 'bulletins', label: '주보', link: '/sharing/bulletin' },
        { id: 'galleryItems', label: '교회앨범', link: '/sharing/gallery' }
    ];

    const searchResults: any[] = [];

    try {
        for (const col of collections) {
            const items = await getCollection(col.id);
            const filtered = items.filter((item: any) => {
                const searchIn = [item.title, item.content, item.preacher].join(' ').toLowerCase();
                return searchIn.includes(keyword.toLowerCase());
            });

            if (filtered.length > 0) {
                searchResults.push({
                    category: col.label,
                    baseUrl: col.link,
                    items: filtered.map(item => ({
                        id: item.id,
                        title: item.title,
                        date: item.date,
                        link: col.id === 'galleryItems' || col.id === 'bulletins' ? col.link : `${col.link}/${item.id}`
                    }))
                });
            }
        }
        res.render('search-results', { title: `"${keyword}" 검색 결과 - 정배교회`, page: 'search', results: searchResults, keyword });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).send('Search error');
    }
});

// Home
app.get('/', async (req, res) => {
    // Simplified Home route to show home page for everyone


    // Fetch latest 3 sermons
    const allSermons = await getCollection('sermons');
    const latestSermons = allSermons.slice(0, 3);

    // Fetch latest 3 notices
    const allNotices = await getCollection('notices');
    const latestNotices = allNotices.slice(0, 3);

    // Fetch latest bulletin
    const allBulletins = await getCollection('bulletins');
    const latestBulletin = allBulletins.length > 0 ? allBulletins[0] : null;

    // Fetch latest 3 meditations
    const allMeditations = await getCollection('meditations');
    const latestMeditations = allMeditations.slice(0, 3);

    res.render('index', {
        title: '정배교회',
        page: 'home',
        latestSermons,
        latestNotices,
        latestBulletin,
        latestMeditations
    });
});

// Church Section
app.get('/church/philosophy', async (req, res) => {
    const items = await getCollection('philosophies');
    const philosophy = items.length > 0 ? items[0] : { title: '목회철학', content: '' };
    res.render('church/philosophy', { title: '목회철학 - 정배교회', page: 'church-philosophy', philosophy });
});
app.get('/church/history', async (req, res) => {
    const histories = await getCollection('histories');

    // Group by yearRange while maintaining order
    const yearRanges: string[] = [];
    const groupedHistories: { [key: string]: any[] } = {};

    histories.forEach((item: any) => {
        if (!groupedHistories[item.yearRange]) {
            yearRanges.push(item.yearRange);
            groupedHistories[item.yearRange] = [];
        }
        groupedHistories[item.yearRange].push(item);
    });

    res.render('church/history', {
        title: '교회 연혁 - 정배교회',
        page: 'church-history',
        yearRanges,
        groupedHistories
    });
});
app.get('/church/pastor', async (req, res) => {
    const items = await getCollection('pastorProfiles');
    const pastor = items.length > 0 ? items[0] : { name: '', role: '', description: '' };
    res.render('church/pastor', { title: '담임목사 소개 - 정배교회', page: 'church-pastor', pastor });
});
app.get('/church/worship', async (req, res) => {
    const services = await getCollection('worshipServices');
    const staff = await getCollection('staffMembers');
    const guides = await getCollection('worshipGuides');
    res.render('church/worship', { title: '예배 안내 - 정배교회', page: 'church-worship', services, staff, guides });
});
app.get('/church/location', (req, res) => {
    res.render('church/location', { title: '오시는 길 - 정배교회', page: 'church-location' });
});

// Word Section
app.get('/word/sermons', async (req, res) => {
    let allSermons = await getCollection('sermons');

    // Sort by date (descending)
    allSermons.sort((a, b) => (a.date < b.date ? 1 : -1));

    // Year Filter
    const year = req.query.year as string;
    if (year) {
        allSermons = allSermons.filter(s => s.date.startsWith(year));
    }

    // Get available years for filter
    const currentYear = new Date().getFullYear();
    const availableYears = [];
    for (let y = currentYear; y >= 2024; y--) {
        availableYears.push(y);
    }
    // Also check actual data years
    // This part assumes sermons have a valid date format YYYY-MM-DD

    const page = parseInt(req.query.page as string) || 1;
    const itemsPerPage = 15;
    const totalPages = Math.ceil(allSermons.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const sermons = allSermons.slice(startIndex, endIndex);

    res.render('word/sermons', {
        title: '주일설교 - 정배교회',
        page: 'word-sermons',
        sermons,
        currentPage: page,
        totalPages,
        totalSermons: allSermons.length,
        currentYear: year || 'all',
        availableYears
    });
});
app.get('/word/sermons/:id', async (req, res) => {
    const sermon = await getItem('sermons', req.params.id);
    if (!sermon) return res.status(404).send('Sermon not found');

    // Fetch recent sermons for bottom list
    const allSermons = await getCollection('sermons');
    const recentSermons = allSermons.slice(0, 10);

    // OG Data
    const title = (sermon as any).title;
    const ogImage = (sermon as any).videoId
        ? `https://img.youtube.com/vi/${(sermon as any).videoId}/maxresdefault.jpg`
        : 'https://jungbae-church.vercel.app/images/main-logo.png';

    res.render('word/sermon-view', {
        title: title + ' - 정배교회',
        page: 'word-sermons',
        sermon,
        recentItems: recentSermons,
        ogTitle: title,
        ogDescription: `${(sermon as any).date} | ${(sermon as any).preacher}`,
        ogImage: ogImage,
        ogUrl: `https://jungbae-church.vercel.app/word/sermons/${req.params.id}`
    });
});
app.get('/word/meditation', async (req, res) => {
    let allMeditations = await getCollection('meditations');

    // Sort by date (descending)
    allMeditations.sort((a, b) => (a.date < b.date ? 1 : -1));

    const page = parseInt(req.query.page as string) || 1;
    const itemsPerPage = 15;
    const totalPages = Math.ceil(allMeditations.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const meditations = allMeditations.slice(startIndex, endIndex);

    res.render('word/meditation', {
        title: '새벽묵상 - 정배교회',
        page: 'word-meditation',
        meditations,
        currentPage: page,
        totalPages,
        totalMeditations: allMeditations.length
    });
});
app.get('/word/meditation/:id', async (req, res) => {
    const meditation = await getItem('meditations', req.params.id);
    if (!meditation) return res.status(404).send('Meditation not found');

    // Fetch recent meditations for bottom list
    const allMeditations = await getCollection('meditations');
    const recentMeditations = allMeditations.slice(0, 10);

    const title = (meditation as any).title;

    res.render('word/meditation-view', {
        title: title + ' - 정배교회',
        page: 'word-meditation',
        meditation,
        recentItems: recentMeditations,
        ogTitle: title,
        ogDescription: `${(meditation as any).date} 새벽묵상`,
        ogUrl: `https://jungbae-church.vercel.app/word/meditation/${req.params.id}`
    });
});
app.get('/word/bible-study', async (req, res) => {
    const bibleStudies = await getCollection('bibleStudies');
    res.render('word/bible-study', { title: '수요 성경공부 - 정배교회', page: 'word-bible-study', bibleStudies });
});
app.get('/word/bible-study/:id', async (req, res) => {
    const study = await getItem('bibleStudies', req.params.id);
    if (!study) return res.status(404).send('Bible Study not found');

    const allStudies = await getCollection('bibleStudies');
    const recentItems = allStudies.slice(0, 10);

    const title = (study as any).title;

    res.render('word/bible-study-view', {
        title: title + ' - 정배교회',
        page: 'word-bible-study',
        study,
        recentItems,
        ogTitle: title,
        ogDescription: `${(study as any).date} 수요 성경공부`,
        ogUrl: `https://jungbae-church.vercel.app/word/bible-study/${req.params.id}`
    });
});
app.get('/word/diary', async (req, res) => {
    let allDiaries = await getCollection('diaries');

    // Sort by date (descending)
    allDiaries.sort((a, b) => (a.date < b.date ? 1 : -1));

    const page = parseInt(req.query.page as string) || 1;
    const itemsPerPage = 15;
    const totalPages = Math.ceil(allDiaries.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const diaries = allDiaries.slice(startIndex, endIndex);

    res.render('word/diary', {
        title: '목양일기 - 정배교회',
        page: 'word-diary',
        diaries,
        currentPage: page,
        totalPages,
        totalDiaries: allDiaries.length
    });
});
app.get('/word/diary/:id', async (req, res) => {
    const diary = await getItem('diaries', req.params.id);
    if (!diary) return res.status(404).send('Diary not found');

    // Fetch recent diaries
    const allDiaries = await getCollection('diaries');
    const recentDiaries = allDiaries.slice(0, 10);

    res.render('word/diary-view', {
        title: (diary as any).title + ' - 정배교회',
        page: 'word-diary',
        diary,
        recentItems: recentDiaries
    });
});

// Sharing Section
app.get('/sharing/notices', async (req, res) => {
    const allNotices = await getCollection('notices');
    const page = parseInt(req.query.page as string) || 1;
    const itemsPerPage = 15;
    const totalPages = Math.ceil(allNotices.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const notices = allNotices.slice(startIndex, endIndex);

    res.render('sharing/notices', {
        title: '공지사항 - 정배교회',
        page: 'sharing-notices',
        notices,
        currentPage: page,
        totalPages,
        totalNotices: allNotices.length
    });
});
app.get('/sharing/notices/:id', async (req, res) => {
    const notice = await getItem('notices', req.params.id);
    if (!notice) return res.status(404).send('Notice not found');

    // Fetch recent notices
    const allNotices = await getCollection('notices');
    const recentNotices = allNotices.slice(0, 10);

    res.render('sharing/notice-view', {
        title: (notice as any).title + ' - 정배교회',
        page: 'sharing-notices',
        notice,
        recentItems: recentNotices
    });
});
app.get('/sharing/bulletin', async (req, res) => {
    let allBulletins = await getCollection('bulletins');

    // Sort by date (descending)
    allBulletins.sort((a, b) => (a.date < b.date ? 1 : -1));

    const page = parseInt(req.query.page as string) || 1;
    const itemsPerPage = 15;
    const totalPages = Math.ceil(allBulletins.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const bulletins = allBulletins.slice(startIndex, endIndex);

    res.render('sharing/bulletin', {
        title: '주보 - 정배교회',
        page: 'sharing-bulletin',
        bulletins,
        currentPage: page,
        totalPages,
        totalBulletins: allBulletins.length
    });
});
app.get('/sharing/bulletin/:id', async (req, res) => {
    const bulletin = await getItem('bulletins', req.params.id);
    if (!bulletin) return res.status(404).send('Bulletin not found');

    const allBulletins = await getCollection('bulletins');
    const recentItems = allBulletins.slice(0, 10);

    res.render('sharing/bulletin-view', {
        title: (bulletin as any).title + ' - 정배교회',
        page: 'sharing-bulletin',
        bulletin,
        recentItems
    });
});
app.get('/sharing/gallery', async (req, res) => {
    let allGalleryItems = await getCollection('galleryItems');

    // Sort by date or createdAt if available
    allGalleryItems.sort((a, b) => (new Date(b.createdAt || b.date) as any) - (new Date(a.createdAt || a.date) as any));

    const page = parseInt(req.query.page as string) || 1;
    const itemsPerPage = 12; // 3x4 grid fits better
    const totalPages = Math.ceil(allGalleryItems.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const galleryItems = allGalleryItems.slice(startIndex, endIndex);

    res.render('sharing/gallery', {
        title: '교회앨범 - 정배교회',
        page: 'sharing-gallery',
        galleryItems,
        currentPage: page,
        totalPages,
        totalItems: allGalleryItems.length
    });
});

// Admin Routes

// Create Page
app.get('/admin/write/:type', (req, res) => {
    if (!(req.session as any).user?.isAdmin) return res.redirect('/login');
    const { type } = req.params;
    const schema = SCHEMAS[type];
    if (!schema) return res.status(404).send('Invalid Type');

    const layout = req.query.layout || 'default';

    res.render('admin/write', {
        title: '글 작성',
        action: 'create',
        type,
        fields: schema,
        item: null,
        layout
    });
});

// Edit Page
app.get('/admin/edit/:type/:id', async (req, res) => {
    if (!(req.session as any).user?.isAdmin) return res.redirect('/login');
    const { type, id } = req.params;
    const schema = SCHEMAS[type];
    const item = await getItem(type, id);

    const layout = req.query.layout || 'default';

    if (!item) return res.status(404).send('Item not found');

    res.render('admin/write', {
        title: '글 수정',
        action: 'update',
        type,
        fields: schema,
        item,
        layout
    });
});

// Create Logic
app.post('/admin/create/:type', upload.any(), async (req, res) => {
    if (!(req.session as any).user?.isAdmin) return res.sendStatus(403);
    const { type } = req.params;
    const items = { ...req.body };

    try {
        // Handle uploaded files to Firebase Storage
        if (req.files && Array.isArray(req.files)) {
            for (const file of req.files as any[]) {
                console.log(`Uploading file: ${file.originalname} for ${type}`);
                const publicUrl = await uploadToFirebase(file);
                if (items[file.fieldname]) {
                    if (Array.isArray(items[file.fieldname])) {
                        items[file.fieldname].push(publicUrl);
                    } else {
                        items[file.fieldname] = [items[file.fieldname], publicUrl];
                    }
                } else {
                    items[file.fieldname] = publicUrl;
                }
            }
        }

        // Extract YouTube video ID if videoId field exists
        if (items.videoId) {
            items.videoId = extractYouTubeId(items.videoId);
        }

        let docRef;
        if (db) {
            console.log(`Adding document to ${type}:`, items);
            docRef = await db.collection(type).add(items);
        }

        // Redirect logic mapping
        // Logic: if redirectUrl contains :id, replace it with docRef.id
        const urlMap: any = {
            sermons: '/word/sermons/:id',
            meditations: '/word/meditation/:id',
            diaries: '/word/diary/:id',
            notices: '/sharing/notices/:id',
            bulletins: '/sharing/bulletin',
            galleryItems: '/sharing/gallery',
            philosophies: '/church/philosophy',
            pastorProfiles: '/church/pastor',
            worshipServices: '/church/worship',
            worshipGuides: '/church/worship',
            histories: '/church/history',
            bibleStudies: '/word/bible-study/:id'
        };

        let targetUrl = urlMap[type] || '/';
        if (docRef && targetUrl.includes(':id')) {
            targetUrl = targetUrl.replace(':id', docRef.id);
        } else if (targetUrl.includes(':id')) {
            // Fallback if docRef is missing (shouldn't happen with db)
            targetUrl = targetUrl.replace('/:id', '');
        }

        if (req.query.layout === 'iframe') {
            // For iframe, we want to redirect the parent window to the new post
            res.send(`<script>window.parent.location.href = "${targetUrl}";</script>`);
        } else {
            res.redirect(targetUrl);
        }
    } catch (err) {
        console.error(`Create error in ${type}:`, err);
        res.status(500).send(`Internal Server Error: ${err instanceof Error ? err.message : String(err)}`);
    }
});

// Update Logic
app.post('/admin/update/:type', upload.any(), async (req, res) => {
    if (!(req.session as any).user?.isAdmin) return res.sendStatus(403);
    const { type } = req.params;
    const { id, ...updates } = req.body;

    try {
        // Handle uploaded files to Firebase Storage
        if (req.files && Array.isArray(req.files)) {
            for (const file of req.files as any[]) {
                console.log(`Updating file: ${file.originalname} for ${type}`);
                const publicUrl = await uploadToFirebase(file);
                if (updates[file.fieldname]) {
                    if (Array.isArray(updates[file.fieldname])) {
                        updates[file.fieldname].push(publicUrl);
                    } else {
                        updates[file.fieldname] = [updates[file.fieldname], publicUrl];
                    }
                } else {
                    updates[file.fieldname] = publicUrl;
                }
            }
        }

        // Extract YouTube video ID if videoId field exists
        if (updates.videoId) {
            updates.videoId = extractYouTubeId(updates.videoId);
        }

        if (db) {
            console.log(`Updating document ${id} in ${type}:`, updates);
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
            worshipServices: '/church/worship',
            worshipGuides: '/church/worship',
            histories: '/church/history',
            bibleStudies: '/word/bible-study'
        };
        const listUrl = urlMap[type] || '/';

        if (req.query.layout === 'iframe') {
            res.send('<script>window.parent.location.reload();</script>');
        } else {
            res.redirect(listUrl);
        }
    } catch (err) {
        console.error(`Update error in ${type}:`, err);
        res.status(500).send(`Internal Server Error: ${err instanceof Error ? err.message : String(err)}`);
    }
});

// Delete Logic
app.get('/admin/delete/:type/:id', async (req, res) => {
    console.log(`Delete request recived: Type=${req.params.type}, ID=${req.params.id}`);
    if (!(req.session as any).user?.isAdmin) {
        console.log('Access denied: Not an admin');
        return res.sendStatus(403);
    }
    const { type, id } = req.params;

    if (db) {
        try {
            await db.collection(type).doc(id).delete();
            console.log(`Successfully deleted ${id} from ${type}`);
        } catch (err) {
            console.error('Delete error:', err);
            return res.status(500).send('Delete failed');
        }
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
        worshipServices: '/church/worship',
        worshipGuides: '/church/worship'
    };

    const listUrl = urlMap[type] || '/';
    console.log(`Redirecting to: ${listUrl}`);
    res.redirect(listUrl);
});


export default app;

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running at http://localhost:${PORT}`);
    });
}
