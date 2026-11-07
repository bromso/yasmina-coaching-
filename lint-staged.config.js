/** @type {import('lint-staged').Config} */
module.exports = {
  "*.{js,jsx,ts,tsx}": ["biome check --write --no-errors-on-unmatched"],
  "*.json": ["biome format --write --no-errors-on-unmatched"],
}
