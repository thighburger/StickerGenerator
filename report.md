# 스티커 생성 서비스 작업 보고서

## 1. 프로젝트 개요

프로젝트 이름: 스티커 생성 서비스

프로젝트 목적: 사용자가 반려동물 사진을 업로드하면 배경을 제거하고, A6 사이즈 스티커 시안 PNG를 자동으로 생성하는 웹 서비스 MVP를 구현한다. 결제 시스템까지 붙이기 전 단계에서는 카카오톡 오픈채팅을 통해 주문 문의와 입금 확인을 수동으로 처리한다.

GitHub 주소: https://github.com/thighburger/StickerGenerator

## 2. 소프트웨어 주요 기능

- 반려동물 사진 업로드
- 최대 5장 이미지 선택
- remove.bg API를 이용한 배경 제거
- 배경 제거 이미지 기반 A6 스티커 시안 자동 생성
- 10개 스티커 자동 배치
- 흰색 스티커 테두리 적용
- 실시간 캔버스 미리보기
- 고화질 PNG 시안 다운로드
- 구매하기 버튼 클릭 시 주문번호 생성
- 배송정보 입력
- 원본 사진과 생성 시안 로컬 저장
- 주문 상태 `payment_pending` 기록
- 관리자 주문 확인 페이지
- 관리자 주문 상태 변경
- 주문번호와 문의 문구 클립보드 복사
- 카카오톡 오픈채팅방 연결

## 3. 실행 환경

사용 OS 및 버전: macOS, Windows 11 환경에서 실행 가능

Git 버전: git 2.43.0 이상 권장

Node.js 환경: Next.js 14 기반

주요 기술:

- Next.js
- React
- TypeScript
- CSS Modules
- Canvas API
- remove.bg API

## 4. 전체 DevOps 파이프라인 구조

현재 파이프라인은 MVP 개발 흐름 중심으로 구성되어 있다.

```text
로컬 개발
-> Git 커밋
-> GitHub 원격 저장소 push
-> GitHub Actions CI에서 타입 검사 및 빌드 검증
-> Vercel 배포
-> 브라우저에서 서비스 실행
```

현재 커밋 기준으로 로컬 브랜치 `feature/pet-sticker-mvp`는 원격 브랜치 `origin/feature/pet-sticker-mvp`와 같은 커밋까지 push되어 있다.

## 5. Git 기반 개발 과정

개발 흐름:

- 기능 단위로 Next.js 앱을 구현했다.
- 먼저 Python MVP 구조를 정리하고, 이후 실제 사용자 UI는 `pet-sticker-next`에 구현했다.
- 배경 제거 API, 캔버스 스티커 생성, UI 개선, 구매 흐름을 순서대로 추가했다.
- 주요 변경 후 Git으로 커밋하고 GitHub 원격 저장소에 push했다.

커밋 전략:

- `feat(next): ...` 형식으로 새 기능을 기록했다.
- `fix(next): ...` 형식으로 UI 수정, 레이아웃 조정, 오류 수정 내용을 기록했다.
- `.env`, API 키, 생성 이미지, 캐시 파일은 커밋하지 않도록 관리했다.

최근 원격 반영 커밋:

```text
c9e1e89 fix(next): remove order progress bar
```

## 6. CI

GitHub Actions 기반 CI를 구성했다.

CI 파일 위치:

```text
.github/workflows/ci.yml
```

실행 조건:

- `push`
- `pull_request`

수행 작업:

- GitHub 저장소 checkout
- Node.js 20 설정
- npm 캐시 설정
- `npm ci`로 의존성 설치
- `npm run typecheck`로 TypeScript 검사
- `npm run build`로 Next.js 빌드 검증

Workflow 주요 내용:

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  next:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: pet-sticker-next
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: pet-sticker-next/package-lock.json
      - name: Install dependencies
        run: npm ci
      - name: Typecheck
        run: npm run typecheck
      - name: Build
        run: npm run build
```

로컬 검증 결과:

- `./node_modules/.bin/tsc --noEmit --incremental false --pretty false` 통과
- `npm run build`는 현재 macOS dataless 파일 감지로 로컬에서는 preflight 단계에서 중단될 수 있다. GitHub Actions는 Ubuntu 환경이므로 해당 macOS 전용 검사에 걸리지 않는다.

## 7. Docker 기반 환경 구성

Docker 기반 실행 환경을 구성했다.

추가한 파일:

```text
pet-sticker-next/Dockerfile
pet-sticker-next/.dockerignore
pet-sticker-next/public/.gitkeep
```

Dockerfile 구조:

- `deps` 단계: `npm ci`로 의존성 설치
- `builder` 단계: Next.js 앱 빌드
- `runner` 단계: production 환경에서 `npm run start` 실행

Docker 빌드:

```bash
cd pet-sticker-next
docker build -t pet-sticker-next .
```

Docker 실행:

```bash
docker run --rm -p 3000:3000 -e REMOVE_BG_API_KEY=your_key pet-sticker-next
```

로컬 확인 결과:

- Docker Desktop 실행 후 `docker build -t pet-sticker-next:codex-check .` 명령으로 이미지 빌드에 성공했다.
- 생성된 이미지 크기는 약 168MB이다.
- Dockerfile 검증용으로 `docker run -d --name pet-sticker-next-codex-check -p 3101:3000 -e REMOVE_BG_API_KEY=dummy pet-sticker-next:codex-check`를 실행했다.
- 검증용 컨테이너에 `curl -I http://localhost:3101` 요청을 보내 `HTTP/1.1 200 OK` 응답을 확인했다.

환경 변수:

```env
REMOVE_BG_API_KEY=...
```

로컬 개발 서버 실행은 기존처럼 Node.js로도 가능하다.

```bash
cd pet-sticker-next
npm install
cp .env.example .env.local
npm run dev
```

## 8. 배포 및 실행

배포 방법:

- Vercel 배포를 기준으로 한다.
- Vercel 프로젝트 루트는 `pet-sticker-next/`로 설정한다.
- Vercel 환경 변수에 `REMOVE_BG_API_KEY`를 등록한다.
- Vercel은 서버 로컬 파일 시스템을 영구 저장소로 사용할 수 없으므로 주문 파일은 배포 환경에서 임시 저장소(`/tmp/pet-sticker-orders`)에만 저장된다.
- 실제 운영에서 원본 사진과 생성 시안을 저장하려면 Supabase Storage 같은 외부 스토리지를 연결해야 한다.

Node.js 로컬 개발 서버 실행:

```bash
cd pet-sticker-next
npm run dev
```

접속 주소:

```text
http://localhost:3000
```

현재 서비스 흐름:

1. 사용자가 사진을 업로드한다.
2. `시안 생성하기`를 누른다.
3. remove.bg API로 배경을 제거한다.
4. 브라우저 Canvas에서 A6 스티커 시안을 생성한다.
5. 사용자가 `구매하기`를 누른다.
6. 이름, 연락처, 배송주소를 확인한다.
7. 원본 사진과 고화질 PNG 시안이 `orders/{주문번호}/`에 저장된다.
8. 고화질 PNG 시안이 사용자 기기에 다운로드된다.
9. 주문번호가 생성되고 클립보드에 복사된다.
10. 카카오톡 오픈채팅방으로 이동한다.
11. 사용자가 주문번호를 채팅방에 붙여넣어 전송한다.
12. 운영자가 입금과 배송 정보를 확인하고 수동 제작을 진행한다.

관리자 주문 확인:

```text
http://localhost:3000/admin/orders
```

관리자는 위 페이지에서 저장된 주문번호, 이름, 연락처, 배송주소, 요청사항, 주문 상태, 파일 위치를 확인할 수 있다. 또한 주문 상태를 `결제대기`, `제작중`, `배송완료`로 변경할 수 있다.

카카오톡 오픈채팅 링크:

```text
https://open.kakao.com/o/s7CYBeti
```

## 9. 전체 파이프라인 동작 흐름

코드 수정 이후 흐름:

```text
코드 수정
-> 로컬 실행 및 빌드 확인
-> Git 변경사항 확인
-> 커밋
-> GitHub 원격 저장소 push
-> GitHub Actions CI 실행
-> typecheck/build 성공 확인
-> Vercel 배포
-> 사용자 접속 및 주문 진행
```

사용자 주문 흐름:

```text
사진 업로드
-> 배경 제거
-> 시안 생성
-> 배송정보 입력
-> 구매하기
-> 원본 사진/시안 로컬 저장
-> PNG 다운로드
-> 주문번호 복사
-> 카카오톡 오픈채팅 연결
-> 입금 확인
-> 제작 및 배송
```

## 10. 문제 해결 경험

문제 1: Next.js 개발 서버 캐시 문제

- 증상: 개발 서버 실행 중 `.next/server` 관련 chunk 오류가 발생하거나, macOS Desktop/iCloud 환경에서 Next.js가 파일을 읽는 동안 멈출 수 있었다.
- 원인: 이전 빌드 캐시가 남아 있거나, iCloud 최적화로 일부 파일이 로컬에 완전히 내려받아지지 않은 dataless 상태가 될 수 있다.
- 해결: 개발 실행 전 필수 파일과 macOS dataless 파일을 점검하는 preflight 스크립트를 추가했다. dataless 파일이 감지되면 프로젝트를 클라우드 최적화가 걸리지 않는 위치로 옮기거나 파일을 로컬에 복원한 뒤 다시 실행해야 한다.

문제 2: 스티커 간격과 배치 품질

- 증상: 단순 반복 배치만 사용할 경우 스티커가 겹치거나 A6 지면을 효율적으로 채우지 못했다.
- 원인: 이미지 비율과 회전값이 서로 달라 고정 그리드만으로는 자연스러운 배치가 어려웠다.
- 해결: 스티커별 마스크를 만들고, 점유 영역을 계산하여 겹침을 줄이는 배치 로직을 적용했다. 실패 시 fallback layout을 사용하도록 구성했다.

문제 3: 결제 시스템 미구현 상태에서 구매 흐름 필요

- 증상: 실제 결제 API를 붙이기에는 시간이 오래 걸리지만 사용자는 구매 문의를 할 수 있어야 했다.
- 원인: MVP 단계에서 PG 연동, 주문 DB, 관리자 페이지를 모두 구현하면 범위가 커진다.
- 해결: `구매하기` 버튼을 누르면 배송정보와 파일을 로컬 주문 폴더에 저장하고, 고화질 PNG를 다운로드하며, 주문번호를 생성해 클립보드에 복사한 뒤 카카오톡 오픈채팅으로 연결하는 수동 주문 흐름을 구현했다.

문제 4: 원본 이미지와 생성 시안 보관 필요

- 증상: 카카오톡 오픈채팅만 사용하면 사용자가 원본 사진과 시안을 직접 다시 보내야 한다.
- 원인: 일반 웹사이트에서 카카오 오픈채팅방으로 파일을 자동 첨부 전송하기 어렵다.
- 해결: `/api/orders` 라우트를 추가하여 원본 사진, 생성된 A6 PNG 시안, 배송정보, 주문 상태를 서버 로컬 폴더에 저장하도록 했다. 운영자는 `pet-sticker-next/orders/{주문번호}/`에서 주문 파일을 확인할 수 있다.

문제 5: 저장된 주문을 운영자가 확인할 화면 필요

- 증상: 파일이 저장되어도 주문 폴더를 직접 열어 확인하면 운영 흐름이 불편하다.
- 원인: MVP 초기에는 관리자 페이지가 없었다.
- 해결: `/admin/orders` 페이지를 추가해 로컬에 저장된 주문 메타데이터를 최신순으로 확인하고, 주문 상태를 변경할 수 있게 했다.

## 11. 현재 남은 작업

- 운영 환경에서도 안전하게 보관되는 외부 스토리지 연동
- 결제 API 연동
- 운영 환경 배포 및 실제 사용자 테스트

## 12. 개선 방향

가장 먼저 Supabase 연동을 추가하는 것이 좋다.

- Supabase Storage에 원본 사진과 생성된 PNG 시안을 고화질 그대로 저장한다.
- Supabase Database에 주문번호, 파일 URL, 배송정보, 주문 상태를 저장한다.
- 관리자는 Supabase 테이블에서 주문을 확인한다.
- 결제는 초기에는 계좌이체 또는 카카오페이 송금으로 수동 확인한다.
- 이후 토스페이먼츠, 포트원, 카카오페이 결제 API 중 하나를 붙여 자동 결제로 확장한다.

현재 MVP는 결제를 자동화하지는 않았지만, 사용자가 시안을 생성하고 배송정보와 원본 파일을 저장한 뒤 운영자가 관리자 화면에서 주문을 확인하고 상태를 변경하며 카카오톡으로 구매 문의를 받을 수 있는 최소 운영 흐름은 완성했다.
