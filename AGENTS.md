# zero-password-db — 작업 지침

0Password(사이트별 비밀번호 규칙을 로그인 화면에 보여주는 서비스)의 규칙 데이터와 공용 코드. npm 패키지 `zero-password`로 배포하고, `zero-password-api`(full)와 `zero-password-chrome`(lite)이 쓴다.
기획 상세는 `docs/spec.md`에 있다. 작업 전에 해당 절을 먼저 읽는다.

## 기본 규칙

- 사용자와의 대화, 커밋 메시지 본문 설명, PR 설명은 한국어로 쓴다. 코드 식별자, 주석, `rule.json`은 영어.
- `docs/spec.md`와 코드가 다르면 spec이 우선이다. spec이 다루지 않는 결정(스키마, 공개 함수 시그니처, API 형태)은 임의로 정하지 말고 먼저 물어본다. **[제안]** 항목은 확정된 뒤 spec을 고치고 구현한다.
- 커밋·푸시는 변경을 보여주고 허락받은 뒤에 한다.
- git flow: `main`, `develop`, `feature/*`(새 기능), `fix/*`(잘못 구현한 것 고치기), `hotfix/*`. release 브랜치는 쓰지 않는다. PR 대상은 `develop`, 제목은 conventional 형식(`feat: ...`, `fix: ...`).
- 규칙 데이터는 사이트가 실제로 적어 둔 것만 쓴다. 비밀번호 실제 값은 어디에도(이슈, PR, 테스트, 규칙) 넣지 않는다.
- 끝나면 `bun test`와 `bun run build`가 통과하는지 확인한다.

## 스택과 배포

- Bun + TypeScript. Node.js 대신 Bun을 쓴다: `bun <file>`, `bun test`, `bun install`, `bun run <script>`, `bunx`. `.env`는 Bun이 자동으로 읽으므로 dotenv를 쓰지 않는다.
- 런타임 의존성은 두지 않는다. lite browser 진입점에는 `node:*` 모듈을 넣지 않는다(브라우저 번들 가능해야 함).
- 배포는 npmjs만(GitHub Packages 안 씀). `bun run deploy` = 테스트 → 빌드 → publish. 하루 1회 자동 배포 계획은 spec §6.

## 핵심 구조 (상세는 spec §2~§5)

- `databases/<호스트>/rule.json`: 사이트 하나의 규칙, 또는 `{ "$ref": "<다른 항목>" }`.
- `src/types.ts`: `Rule` 스키마. `src/validate.ts`: 런타임 검증.
- `src/domain.ts`: 정규화와 매칭 순서(호스트 → 상위 도메인 → `www.` + 등록 도메인).
- `src/check.ts`: `checkPassword`.
- `src/index.ts`: full(`zero-password`). `src/lite.ts` / `src/lite.node.ts` / `src/lite-core.ts` / `src/file-storage.ts`: lite(`zero-password/lite`).
- `.github/ISSUE_TEMPLATE/rule-request.yml` + `.github/workflows/rule-request.yml` + `scripts/rule-request.ts`: 이슈 폼으로 받은 규칙을 PR로 연다.
- 공개 함수 이름은 full/lite 모두 `findRule` / `getRule`.

## 참고 위치

- 기획: `docs/spec.md`
- 규칙 쓰는 법: `CONTRIBUTING.md`, 필드 설명: `README.md`
- API 계약: `GET https://0password.startergate.dev/api/{domain}` → `200 { domain, rule }` / `404 { error: "not_found" }` (zero-password-api)
