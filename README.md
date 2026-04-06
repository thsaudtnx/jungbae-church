# 정배교회 웹사이트

## 🚀 시작하기

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 변수 설정
`.env` 파일을 생성하고 다음 내용을 추가하세요:
```env
PORT=3000
FIREBASE_SERVICE_ACCOUNT=./serviceAccountKey.json
```

### 3. 개발 서버 실행
```bash
npm run dev
```

## 📂 프로젝트 구조

```
jungbae-church/
├── views/                  # EJS 템플릿
│   ├── admin/              # 관리자 페이지
│   ├── sharing/            # 나눔 마당
│   ├── word/               # 말씀 광장
│   └── church/             # 교회 소개
├── public/                 # 정적 파일
│   ├── css/
│   ├── js/
│   └── images/
├── index.ts                # 메인 서버 파일
├── firebase.ts             # Firebase 설정
└── package.json
```

## 🛠️ 기술 스택

- **프레임워크**: Express.js
- **템플릿 엔진**: EJS
- **데이터베이스**: Firebase Firestore
- **인증**: Firebase Authentication
- **파일 저장**: Firebase Storage
- **배포**: Firebase App Hosting

## 📝 주요 기능

### 말씀 광장
- 설교, 묵상, 성경공부 게시판
- 파일 업로드 및 미리보기 지원
- 관리자용 에디터

### 나눔 마당
- 공지사항, 주보, 갤러리
- 파일 다운로드 및 미리보기
- 관리자용 에디터

### 교회 소개
- 교회 철학, 담임목사, 예배 안내, 연혁
- 관리자용 에디터

### 관리자 페이지
- 모든 게시판 콘텐츠 관리
- 파일 업로드 및 삭제
- 사용자 관리

## 🔐 보안

- Firebase Authentication으로 관리자 인증
- Firestore 보안 규칙으로 데이터 접근 제어
- 파일 업로드 시 public-read ACL 설정

## 🚀 배포

### Firebase CLI 설치
```bash
npm install -g firebase-tools
```

### 로그인
```bash
npm run login
```

### 배포
```bash
npm run deploy
```
