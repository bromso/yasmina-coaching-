import StyleDictionary from "style-dictionary"

const config = {
  source: ["src/tokens/**/*.json"],
  platforms: {
    css: {
      transformGroup: "css",
      buildPath: "dist/css/",
      files: [
        {
          destination: "variables.css",
          format: "css/variables",
          options: {
            outputReferences: true,
          },
        },
      ],
    },
    js: {
      transformGroup: "js",
      buildPath: "dist/js/",
      files: [
        {
          destination: "tokens.js",
          format: "javascript/es6",
        },
      ],
    },
    ts: {
      transformGroup: "js",
      buildPath: "dist/ts/",
      files: [
        {
          destination: "tokens.ts",
          format: "typescript/es6-declarations",
        },
      ],
    },
    json: {
      transformGroup: "js",
      buildPath: "dist/json/",
      files: [
        {
          destination: "tokens.json",
          format: "json/nested",
        },
      ],
    },
  },
}

const sd = new StyleDictionary(config)
await sd.buildAllPlatforms()
