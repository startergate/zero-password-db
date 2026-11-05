# zero-password-db 기획

이 문서는 2026-11-05 기획 확인 과정에서 확정한 내용 중 db 저장소에 필요한 부분을 정리한 것이다.
표시가 없는 항목은 확정되어 구현된 내용이다.
**[계획]** 표시는 하기로 정했지만 아직 구현하지 않은 항목이다.
**[제안]** 표시는 아직 정하지 않은 후보안이다. 하기로 정하면 이 문서를 고친 뒤 구현한다.

---

## 1. 개요

- 0Password는 비밀번호를 저장하지 않고, 사이트별 비밀번호 **규칙**만 모아 두었다가 로그인 화면에서 보여주는 서비스다. 사용자가 그 사이트용으로 바꿔 쓴 비밀번호를 떠올리게 돕는 것이 목적이다.
- 세 저장소는 한 방향으로 이어진다: 규칙 데이터(db, 이 저장소) → API 서버(`zero-password-api`) → 크롬 익스텐션(`zero-password-chrome`). 1.0 완성 기준은 크롬 웹스토어 출시다.
- 이 저장소는 규칙 **데이터**(`databases/<도메인>/rule.json`)와 그 데이터를 다루는 **공용 코드**를 npm 패키지 `zero-password`로 배포한다.

### 1.1 맡는 일

- 규칙 데이터와 `Rule` 스키마, 스키마 검증.
- 도메인 정규화와 매칭(어떤 호스트가 어떤 규칙 항목을 쓰는지).
- 비밀번호가 규칙을 만족하는지 로컬에서 검사하는 `checkPassword`.
- 두 배포판: full(데이터 포함, api용)과 lite(데이터 없이 API 조회, 익스텐션용).
- 규칙 추가·수정 요청 받기(이슈 폼 → PR 자동 생성)와 npm 배포.

### 1.2 맡지 않는 일

- HTTP 서빙, 캐시 헤더, 랜딩·개인정보처리방침 페이지 → api 저장소 참고.
- 비밀번호 입력란 판별, 규칙 표시 UI, 팝업, 제보하기 버튼 → chrome 저장소 참고.
- 비밀번호를 어떤 형태로도 받거나 저장·전송하지 않는다. `checkPassword`는 호출한 쪽(페이지 안)에서만 돈다.

## 2. 배포판과 진입점

| 진입점 | 배포판 | 데이터 | 누가 쓰나 |
|---|---|---|---|
| `zero-password` | full | `databases/` 포함, `node:fs`로 읽음 | zero-password-api |
| `zero-password/lite` (browser, default 조건) | lite | 없음, API에서 받아 캐시 | zero-password-chrome |
| `zero-password/lite` (node, bun, deno 조건) | lite | 없음, API에서 받아 파일에 캐시 | 브라우저 밖 사용자 |

- 두 배포판의 조회 함수 이름은 `findRule` / `getRule`로 같다. full은 동기, lite는 `Promise`를 돌려준다.
  - `findRule(domain)` → `{ domain, rule } | null`. `domain`은 실제로 매칭된 데이터 항목이다.
  - `getRule(domain)` → `Rule | null`.
- 두 배포판 모두 `Rule` 등 타입, `normalizeDomain`, `candidateDomains`, `checkPassword`, `CHARACTER_CLASSES`, `characterClassOf`를 내보낸다.
- 브라우저 번들(lite browser 진입점)에는 `node:fs`가 들어가지 않는다. `package.json`의 `exports` 조건으로 나눈다.

### 2.1 lite 동작

- API: `GET {apiBaseUrl}/api/{domain}` → `200 { domain, rule }` 또는 `404 { error: "not_found" }`. 기본 주소는 `https://0password.startergate.dev`.
- API가 상위 도메인 매칭과 `$ref`를 처리하므로, lite는 호스트 이름 하나당 요청 한 번만 한다.
- 캐시
  - 유효 기간 기본 하루(`maxAge`). 규칙 없음(404)도 캐시한다.
  - 네트워크 오류와 5xx는 캐시하지 않고 `ZeroPasswordApiError`로 던진다. 다음 호출이 다시 시도한다.
  - 저장소는 반영구여야 한다(브라우저를 껐다 켜도 남음). 기본값 순서: browser 진입점은 `chrome.storage.local` → `localStorage` → 메모리, node 진입점은 `chrome.storage.local` → `localStorage` → 파일(`$XDG_CACHE_HOME/zero-password` 또는 `~/.cache/zero-password`).
  - 키 접두사는 `zero-password:rule:`.
- 옵션은 `createLiteClient({ apiBaseUrl, storage, maxAge, fetch })`로 바꾼다. 기본 옵션 클라이언트는 `findRule` / `getRule`로 바로 쓸 수 있다.

## 3. 규칙 데이터

### 3.1 저장 위치와 항목 이름

- 한 사이트 = `databases/<호스트>/rule.json` 하나.
- 폴더 이름은 비밀번호를 정하는 화면(가입·비밀번호 변경)의 호스트 이름이다. 소문자, 끝 점 없음, 포트·경로 없음. 테스트가 정규화 여부를 검사한다.
- 사이트 전체가 계정 하나를 쓰면 등록 도메인이나 `www.` 이름을 쓴다. 계정이 별도 호스트에 있고 규칙이 다르면 그 호스트를 쓴다(`accounts.google.com`, `nid.naver.com`).

### 3.2 `Rule` 스키마

모든 필드는 선택이다. 빠진 필드는 "사이트가 제한하지 않음"을 뜻한다. 문자는 ASCII만 다룬다: 영문 A–Z, a–z, 숫자 0–9, 나머지 출력 가능 문자(`!`~`~`)는 특수문자. 공백과 비 ASCII 문자는 항상 허용하지 않는 것으로 본다.

| 필드 | 형태 | 뜻 |
|---|---|---|
| `alphabet` | `{ require, uppercase?, lowercase? }` | `require` = 대소문자 무관 영문 1자 이상. `uppercase` / `lowercase`는 문자 집합 규칙 |
| `number`, `specialCharacter` | `{ allow, require, usable? }` | 문자 집합 규칙. `usable`은 그 종류에서 허용되는 문자만 나열 |
| `combination` | `{ min, of? }` | `of` 중 `min`가지 이상 사용. `of` 기본값은 대문자·소문자·숫자·특수문자, `alphabet`은 영문을 한 종류로 셈 |
| `forbidden` | `{ characters?, maxRepeat?, maxSequence?, id? }` | 금지 문자, 같은 문자 연속 최대 개수, 연속 문자(`abc`, `321`) 최대 길이, 아이디 포함 금지 |
| `length` | `{ min?, max? }` | 글자 수 |

- 타입 정의는 `src/types.ts`, 런타임 검증은 `src/validate.ts`(`validateRule`).
- 사이트가 실제로 적어 둔 것만 쓴다. 적혀 있지 않은 제한을 추측해 넣지 않는다.
- 스키마는 확장 가능하게 두고, 하위 호환을 항상 지킨다(2026-11-05 확정). API는 항상 최신 규칙을 주지만 설치된 익스텐션은 늦게 업데이트되기 때문이다.
  - 새 조건은 새 선택 필드로 추가한다. 기존 필드의 뜻을 바꾸거나 지우지 않는다.
  - 소비하는 쪽(`checkPassword`, 문구 함수, chrome)은 모르는 필드를 무시하고 아는 필드만으로 동작한다.
  - `validateRule`이 모르는 키를 거부하는 것은 이 저장소의 데이터 검사용이다. 스키마를 넓힐 때 함께 고친다.

### 3.3 `$ref`

- `{ "$ref": "<다른 항목>" }`으로 다른 항목의 규칙을 그대로 쓴다(예: `daum.net` → `accounts.kakao.com`).
- 한 단계만 따라간다. `$ref`가 다시 `$ref`를 가리키면 규칙 없음으로 본다. 테스트가 대상 존재와 중첩 여부를 검사한다.

### 3.4 도메인 매칭

페이지의 호스트를 아래 순서로 찾아 처음 있는 항목을 쓴다.

1. 호스트 그대로 (`login.coupang.com`)
2. 상위 도메인, 등록 도메인까지 (`coupang.com`). `co.kr` 같은 다단계 공개 접미사는 넘지 않는다.
3. `www.` + 등록 도메인 (`www.coupang.com`)

- 다단계 접미사 목록은 공개 접미사 목록(PSL) 전체가 아니라 대상 사이트에 필요한 일부만 `src/domain.ts`에 둔다.
- IP 주소, 단일 라벨(`localhost`), 비 ASCII 입력은 매칭하지 않는다.

### 3.5 수록 대상

- "국내 사이트"가 아니라 **한국에서 주로 쓰는 사이트**를 우선한다. 해외 서비스도 포함한다(예: `accounts.google.com`).
- 현재 18곳: 네이버, 카카오(+다음), 구글, 네이트, 쿠팡, 11번가, G마켓, SSG, 롯데온, 인터파크, 예스24, 마켓컬리, 무신사, 올리브영, 배민, 멜론, 페칭.
- 18곳을 실제 가입·비밀번호 변경 화면과 대조하는 작업(#5)은 1.0 출시 전에 하지 않는다. 틀린 규칙은 제보로 고친다.

## 4. 비밀번호 검사

- `checkPassword(rule, password, { id? })`는 규칙에서 어긴 부분의 목록(`RuleViolation[]`)을 돌려준다. 빈 배열이면 만족.
- 위반 코드는 규칙 경로와 같다: `alphabet.require`, `number.allow`, `specialCharacter.usable`, `combination`, `forbidden.maxRepeat`, `length.min` 등, 그리고 ASCII 밖 문자에 대한 `unsupportedCharacter`.
- chrome은 이 결과로 규칙별 한 줄마다 충족 여부를 표시한다. 그래서 위반 코드는 화면에 보이는 한 줄과 1:1로 대응할 수 있어야 한다.
- `forbidden.id`는 아이디를 넘겨받았을 때만 검사한다. 로그인 화면에서 아이디를 넘길지는 chrome 기획에서 정한다.
- **[계획]** 규칙 한 줄 문구(예: "8~16자", "영문·숫자·특수문자 중 2가지 이상")를 db가 제공한다(2026-11-05 확정). 각 줄에는 대응하는 위반 코드를 붙여, chrome은 `checkPassword` 결과와 맞춰 표시만 한다.
  - 문구는 db가 언어별로 내장한다(2026-11-05 확정). 예: `describeRule(rule, { locale: 'ko' | 'en' })`가 완성된 문장을 돌려준다. 없는 언어는 영어로 대체한다.
  - 크롬 밖의 클라이언트를 만들 때 같은 문구를 다시 개발하지 않으려는 것이다. 함수 이름과 반환 형태는 구현 전에 확인한다.

## 5. 규칙 추가·제보

### 5.1 지금 흐름

1. 누구나 db 저장소의 **Password rule request** 이슈 폼(`.github/ISSUE_TEMPLATE/rule-request.yml`)을 채운다. 항목: 도메인, 요청 종류(추가/수정), 사이트 안내 문구, 확인한 페이지 URL, 스크린샷(선택), 규칙 JSON.
2. `.github/workflows/rule-request.yml`이 이슈 내용으로 `rule.json`을 쓰고 `src/rules.test.ts`를 돌린 뒤 `feature/rule-request-<이슈 번호>` 브랜치로 `develop` 대상 PR을 연다. 이슈를 고치면 PR도 갱신된다. 문제가 있으면 이슈에 댓글로 알린다.
3. 관리자(호승)가 PR을 검토해 머지한다.
4. 직접 PR을 여는 방법도 있다. 방법은 `CONTRIBUTING.md`.

### 5.2 항목 입력식 이슈 폼 **[계획]**

지금 폼은 제보자가 규칙 JSON을 직접 써야 한다. 이를 바꾼다(2026-11-05 확정).

- 제보자는 폼의 항목(길이, 문자 종류, 조합, 금지 조건 등)에 값을 채운다. JSON은 workflow가 항목 값으로 만든다.
- 익스텐션 팝업의 "제보하기" 버튼은 이 폼을 도메인을 미리 채워 연다: `https://github.com/startergate/zero-password-db/issues/new?template=rule-request.yml&domain=<호스트>`. GitHub 이슈 폼은 필드 id로 쿼리 값을 미리 채울 수 있다.
- 제보에는 GitHub 계정이 필요하다. 계정 없는 사용자를 위한 별도 창구는 1.0에서 두지 않는다.
- 항목 구성(2026-11-05 확정). 규칙 항목은 모두 선택이고, 빈칸은 제한 없음으로 본다.

| 묶음 | 항목 | 입력 방식 | `Rule` 필드 |
|---|---|---|---|
| 기본 | 도메인, 요청 종류(추가/수정), 사이트 안내 문구, 확인한 페이지 URL, 스크린샷 | 입력란·드롭다운 | (JSON 밖) |
| 길이 | 최소 글자 수, 최대 글자 수 | 입력란 | `length.min`, `length.max` |
| 문자 종류 | 영문 대문자, 영문 소문자, 숫자, 특수문자 | 드롭다운: 사용 불가 / 사용 가능 / 반드시 포함 | `alphabet.uppercase`, `alphabet.lowercase`, `number`, `specialCharacter`의 `allow`, `require` |
| 사용 가능한 문자 | 위 네 종류 각각, 허용되는 문자만 나열 | 입력란 | 각 종류의 `usable` |
| 영문 필수 | 대소문자 상관없이 영문 1자 이상 | 체크박스 | `alphabet.require` |
| 조합 | 몇 가지 이상, 셀 종류(영문, 대문자, 소문자, 숫자, 특수문자) | 숫자 입력란(1부터 셀 종류 개수까지), 체크박스 | `combination.min`, `combination.of` |
| 금지 | 같은 문자 연속 최대 개수, 연속 문자 최대 길이, 아이디 포함 금지, 금지 문자 | 입력란·체크박스 | `forbidden.maxRepeat`, `forbidden.maxSequence`, `forbidden.id`, `forbidden.characters` |
| 참조 | 다른 항목 규칙 그대로 쓰기 | 입력란(도메인). 채우면 다른 규칙 항목은 비워야 함 | `$ref` |

- 항목 값이 스키마 검증(`validateRule`)을 통과하지 못하면 지금처럼 PR을 열지 않고 문제를 이슈 댓글로 알린다.
- 폼 문구(제목, 항목 이름, 설명)는 영어로 쓴다(2026-11-05 확정). 위 표의 항목 이름은 이 문서용 한국어 설명이다.

## 6. 배포

### 6.1 지금

- npmjs에만 배포한다(GitHub Packages는 쓰지 않음). 패키지 이름 `zero-password`, 현재 0.1.0.
- `bun run deploy` = 테스트 → 빌드(`tsc`) → `bun publish`. 호승 맥에서 npm 로그인으로 실행한다.
- npm 배포 뒤 api의 의존성을 올려 Vercel에 재배포해야 API가 새 규칙을 준다.

### 6.2 하루 1회 자동 배포 **[계획]**

- 하루 한 번 GitHub Actions 예약 실행. **지난 배포 뒤 `databases/`가 바뀌었을 때만** 동작한다(규칙마다 배포는 너무 잦음).
- 동작: 패치 버전 올림 → 테스트·빌드 → npm 배포 → api 재배포 트리거. api 쪽 작업은 api #5에서 다룬다.
- 버전 규칙: 규칙 데이터만 바뀌면 패치. 코드·스키마 변경은 지금처럼 사람이 직접 마이너 버전으로 배포한다.
- 인증은 npm Trusted Publishing(OIDC)으로 한다(2026-11-05 확정). 저장하는 토큰이 없다. npmjs 패키지 설정에 이 저장소의 배포 workflow를 한 번 등록해야 한다(호승).
  - Trusted Publishing은 npm CLI로 배포할 때 동작하므로, 자동 배포의 publish 단계는 `bun publish` 대신 `npm publish`를 쓴다. 구현 전에 다시 확인한다.
- 브랜치(2026-11-05 확정): 규칙 PR은 `develop`으로 받는다. 바뀐 규칙이 있으면 자동 배포가 `develop`을 `main`에 머지한 뒤 `main`에서 npm 배포한다. `main`은 늘 배포된 상태와 같다.
  - `develop`에 머지된 코드 변경도 함께 나가므로, 배포하면 안 되는 코드 변경은 `develop`에 머지하지 않고 `feature/*`에 둔다.

## 7. 저장소 운영

- git flow: `main`, `develop`, `feature/*`, `fix/*`, `hotfix/*`. release 브랜치는 쓰지 않는다.
- PR 제목은 conventional 형식(`feat: ...`, `fix: ...`), 대상은 `develop`.
- 테스트(`bun test`)
  - `src/rules.test.ts`: 모든 `rule.json`이 스키마를 만족하고, 폴더 이름이 정규화되어 있고, `$ref` 대상이 있고, 규칙을 만족하는 비밀번호가 하나는 존재하는지.
  - 매칭, 검사, lite(캐시·오류 처리), 이슈 폼 파싱 테스트.
- 남은 작업은 GitHub 이슈로 관리한다.

## 8. 결정 기록 (2026-11-05)

- Q1. 규칙 한 줄 문구를 누가 만드나 → db가 제공, 현지화 고려 (§4).
- Q1-1. 문구 현지화 방식 → db가 언어별 문구를 내장 (§4).
- Q2. 제보 폼 → JSON 입력 대신 항목 입력식 폼, JSON은 자동 생성.
- Q2-1. 폼 항목 구성 → §5.2 표대로.
- Q3. 이슈 폼 언어 → 영어 유지.
- Q4. 자동 배포 기준 브랜치 → `develop` → `main` 머지까지 자동, `main`에서 배포.
- Q5. npm 인증 → npm Trusted Publishing.
- Q6. 스키마 호환 → 확장 가능하게, 하위 호환 항상 유지.

## 9. 1.0까지 남은 일

| 할 일 | 상태 | 관련 |
|---|---|---|
| 하루 1회 자동 배포 workflow | [계획] | §6.2, api #5 |
| 항목 입력식 이슈 폼과 JSON 자동 생성 | [계획] | §5.2, chrome #7 |
| 규칙 한 줄 문구 함수(현지화) | [계획] | §4, chrome #3·#4 |
| README·CONTRIBUTING을 이 문서와 맞추기 | [계획] | |
| 18곳 실제 대조 | 1.0 이후 | #5 |
