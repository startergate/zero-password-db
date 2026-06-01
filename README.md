# 0Password: Password "rule" manager

This library provides password rules from websites across the internet.

Since this system does not save your password in any form, you can prevent every kind of password leak unless you leak it.

This library is provided in two form, full and lite version. Full version includes complete database of password rules. Lite version does not includes any rule data in the source. It retrieves a rule data from the API server when needed.

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run src/index.ts
```

This project was created using `bun init` in bun v1.3.13. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
