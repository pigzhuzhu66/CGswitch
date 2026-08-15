import { readFileSync, writeFileSync } from "node:fs";

const version = readFileSync(new URL("../VERSION", import.meta.url), "utf8").trim();
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`VERSION 必须是 SemVer 版本号，当前为：${version}`);
}

function update(path, transform) {
  const file = new URL(path, import.meta.url);
  const before = readFileSync(file, "utf8");
  const after = transform(before);
  if (after !== before) writeFileSync(file, after);
}

update("../package.json", (text) => {
  const manifest = JSON.parse(text);
  manifest.version = version;
  return `${JSON.stringify(manifest, null, 2)}\n`;
});

update("../src-tauri/Cargo.toml", (text) => text.replace(/^version = ".*"$/m, `version = "${version}"`));

update("../src-tauri/tauri.conf.json", (text) => {
  const config = JSON.parse(text);
  config.version = version;
  return `${JSON.stringify(config, null, 2)}\n`;
});
