// === Simple Fake Obfuscation Logic ===
// Replace this with your real Lua obfuscation later

const input = document.getElementById("input");
const output = document.getElementById("output");
const obfuscateBtn = document.getElementById("obfuscate");
const clearBtn = document.getElementById("clear");

obfuscateBtn.addEventListener("click", () => {
  const code = input.value.trim();
  if (!code) {
    output.value = "// ⚠️ Please paste some Luau code first!";
    return;
  }

  // Basic fake obfuscator logic
  const encoded = btoa(code)
    .split("")
    .reverse()
    .join("");

  output.value = `--// 🌀 Protected by Luau-Protector\nlocal s=[[${
    encoded
  }]]\nloadstring(string.reverse(s)):gsub(".", function(c) return c end)()`;
});

clearBtn.addEventListener("click", () => {
  input.value = "";
  output.value = "";
});
