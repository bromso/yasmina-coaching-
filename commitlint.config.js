/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 100],
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ],
    ],
    "type-case": [2, "always", "lower-case"],
    "subject-empty": [2, "never"],
    "type-empty": [2, "never"],
    // Disabled for Gitmoji (:emoji:) support
    "subject-case": [0],
  },
  parserPreset: {
    parserOpts: {
      headerPattern: /^(\w+)(?:\(([^)]+)\))?:\s*(.+)$/,
      headerCorrespondence: ["type", "scope", "subject"],
    },
  },
}
