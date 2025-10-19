/**
 * Simple Luau obfuscator (educational / IP-protection).
 * WARNING: Do NOT use to hide malware, cheats, or bypass protections.
 * Header: ---Moz Obsfucator
 *
 * Usage (browser):
 *   const out = obfuscateLuau(inputCode);
 *   // show out in your UI
 */

function randId(len = 8) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return "_" + s;
}

function base64Encode(str) {
  // browser-friendly btoa/atob are fine for ASCII; for safety we handle UTF-8
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch (e) {
    // fallback
    return Buffer ? Buffer.from(str, "utf8").toString("base64") : str;
  }
}

function base64DecodeRuntimeName() {
  // name for runtime decoder to avoid collision
  return "__moz_b64_decode";
}

// Basic patterns to find identifiers to rename.
// This is heuristic-based: looks for "local <id>", "function <id>", usage of those ids later.
const localPattern = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g;
const funcPattern = /\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)/g;
const nameUsePattern = (name) => new RegExp("\\b" + name + "\\b", "g");

// Find string literals (single or double quotes, including escaped quotes).
const stringLiteralPattern = /(["'])(?:\\.|(?!\1).)*\1/gms;

// Remove simple single-line comments and block comments (basic)
function stripComments(code) {
  // remove --[[ ... ]] block comments
  code = code.replace(/--\[\[[\s\S]*?\]\]/g, "");
  // remove -- until end of line
  code = code.replace(/--.*$/gm, "");
  return code;
}

function obfuscateLuau(input) {
  if (typeof input !== "string") return input;
  let code = input;

  // 1) Strip comments (basic)
  code = stripComments(code);

  // 2) Extract strings and replace with placeholders, store encoded forms
  let strings = [];
  code = code.replace(stringLiteralPattern, (m) => {
    // m includes quotes; remove outer quotes
    const quote = m[0];
    const inner = m.slice(1, -1);
    const encoded = base64Encode(inner);
    const placeholder = `__STR_${strings.length}__`;
    strings.push({ encoded, quote });
    return placeholder;
  });

  // 3) Find local and function identifiers to rename
  let idMap = {};
  const collect = (pat) => {
    let m;
    while ((m = pat.exec(code)) !== null) {
      const name = m[1];
      if (!idMap[name]) idMap[name] = randId(10);
    }
  };
  collect(localPattern);
  collect(funcPattern);

  // 4) Replace identifier usages (careful to not replace inside placeholders)
  // We'll protect placeholders by temporarily replacing them with tokens unlikely to match identifiers
  let placeholderTokenPrefix = "__MOZ_PLACE_";
  strings.forEach((s, i) => {
    code = code.replace(`__STR_${i}__`, `${placeholderTokenPrefix}${i}__`);
  });

  // Now replace identifier names globally
  for (const orig in idMap) {
    const repl = idMap[orig];
    code = code.replace(nameUsePattern(orig), repl);
  }

  // Restore placeholders into something that the runtime decoder will replace back to strings.
  // We'll replace placeholder tokens with a lua expression call that decodes base64 at runtime:
  // e.g., (__moz_b64_decode("encoded_value"))
  const decoderName = base64DecodeRuntimeName();
  strings.forEach((s, i) => {
    // use the original quote style for concatenation safety; we'll produce: (__moz_b64_decode("..."))
    const token = `${placeholderTokenPrefix}${i}__`;
    // We'll embed the base64 string as a lua literal in double quotes (base64 is safe ASCII)
    const luaExpr = `(${decoderName}("${s.encoded}"))`;
    code = code.replace(token, luaExpr);
  });

  // 5) Minify whitespace a bit (collapse multiple blank lines, trim)
  code = code.replace(/\r\n/g, "\n");
  code = code.replace(/[ \t]+$/gm, "");
  code = code.replace(/\n{2,}/g, "\n");
  code = code.trim();

  // 6) Build header, runtime decoder and final obfuscated code
  // runtime decoder (Lua): local function __moz_b64_decode(s) return (require)?? can't require; implement simple base64 decode in Luau.
  // We'll include a small base64 decoder in Lua (pure Lua version)
  const luaBase64Decoder = `
--// 🌀 Moz Obsfucator
---Moz Obsfucator
--// runtime base64 decoder
local function ${decoderName}(b64)
  local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  b = b .. '='
  b64 = string.gsub(b64, '[^'..b..']', '')
  local t = {}
  for i = 1, #b64, 4 do
    local a = string.find(b, b64:sub(i,i)) - 1
    local b1 = string.find(b, b64:sub(i+1,i+1)) - 1
    local c = string.find(b, b64:sub(i+2,i+2)) - 1
    local d = string.find(b, b64:sub(i+3,i+3)) - 1
    local n = a * 262144 + b1 * 4096 + ( (c >= 0 and c) or 0) * 64 + ( (d >= 0 and d) or 0 )
    local byte1 = math.floor(n / 65536) % 256
    local byte2 = math.floor(n / 256) % 256
    local byte3 = n % 256
    table.insert(t, string.char(byte1))
    if c and c ~= 64 then table.insert(t, string.char(byte2)) end
    if d and d ~= 64 then table.insert(t, string.char(byte3)) end
  end
  return table.concat(t)
end

`;

  // combine
  const final = luaBase64Decoder + "\n" + code;

  return final;
}

// Export for Node / Browser usage
if (typeof module !== "undefined" && module.exports) {
  module.exports = { obfuscateLuau };
}
