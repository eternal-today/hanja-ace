# 우리집 한자 에이스

아이가 혼자 찾아서 하는 한자 학습 웹앱입니다. 한국어문회 급수 기준이며, 수학 에이스와 같은 구조(React + Vite, GitHub Pages)입니다.

## 처음 한 번

```
npm install
npm run dev
```

브라우저에서 http://localhost:3001 을 엽니다. 부모님 모드의 처음 PIN은 1234입니다.

## GitHub Pages에 올리기

1. GitHub에서 새 저장소를 만듭니다. (예: hanja-ace)
2. 이 폴더에서 아래 명령을 실행합니다.

```
git init
git add .
git commit -m "한자 에이스 1차"
git branch -M main
git remote add origin https://github.com/<내 계정>/hanja-ace.git
git push -u origin main
```

3. 저장소의 Settings > Pages > Source를 "GitHub Actions"로 바꿉니다.
4. 이후에는 고친 뒤 `git add . && git commit -m "설명" && git push` 만 하면 자동으로 배포됩니다.

## 폴더 구성

| 위치 | 내용 |
| --- | --- |
| `src/data/hanjaData.ts` | 8급~4급 1,000자 (글자, 훈, 음, 급수, 부수, 획수)와 묶음 |
| `src/data/wordData.ts` | 낱말, 독음, 뜻풀이, 예문 (지금은 7급 범위 240개) |
| `src/engine/quiz.ts` | 출제기 (어떤 글자를 낼지, 보기와 힌트 만들기) |
| `src/engine/srs.ts` | 기억 상자 (다섯 칸 복습 규칙) |
| `src/engine/store.ts` | 저장소, 별 장부, 찬스 기본 메뉴, 뱃지 |
| `src/screens/` | 화면: 아이 홈, 문제 풀이, 도감, 찬스 가게, 부모 화면 |

급수를 넓힐 때는 `wordData.ts`에 그 급수의 낱말을 더하면 낱말 읽기 문제가 열립니다. 글자는 4급까지 이미 들어 있습니다.

## 저장

모든 기록은 기기의 브라우저에 `hanja_`로 시작하는 이름으로 저장됩니다. 수학 에이스와 같은 주소에서 써도 서로 덮어쓰지 않습니다. 기기 간 동기화는 아직 없으므로 부모 화면의 "기록 백업"을 이용하세요.

## 데이터 출처

글자 데이터는 한국어문회가 공개한 급수별 배정한자 자료의 변환본(github.com/rycont/hanja-grade-dataset)에서 가져왔고, 저작권은 한국어문회에 있습니다. 가족용으로만 쓰고, 공개 배포할 때는 확인이 필요합니다. 낱말의 뜻풀이와 예문은 새로 쓴 초안입니다.
