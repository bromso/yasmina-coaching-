// Packs docker-compose.yml + template.toml into the base64 string Dokploy's "Import" accepts:
// base64(JSON.stringify({ compose, config })), the same format as the Dokploy templates catalogue.
const dir = import.meta.dir
const compose = await Bun.file(`${dir}/docker-compose.yml`).text()
const config = await Bun.file(`${dir}/template.toml`).text()
Bun.TOML.parse(config)
const b64 = Buffer.from(JSON.stringify({ compose, config }, null, 2), "utf8").toString("base64")
await Bun.write(`${dir}/import.txt`, `${b64}\n`)
console.log(`wrote ${dir}/import.txt (${b64.length} chars)`)
