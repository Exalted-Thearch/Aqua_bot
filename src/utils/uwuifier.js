const faces = [
  "(・`ω´・)", ";;w;;", "owo", "UwU", ">w<", "^w^", "( ◡ ω ◡ )", "(´・ω・`)", "UωU",
  "(*^▽^*)", "(✿^‿^)", "(⋆ˆ ³ ˆ)♥", "(●´ω｀●)", "(☆▽☆)", "(*/ω＼)", "( ˘ ³˘)♥",
  "(♡μ_μ)", "(o^▽^o)", "(⌒‿⌒)", "(*°▽°*)", "(≧◡≦)", "(´｡• ᵕ •｡`)", "(*¯︶¯*)",
  "(o˘◡˘o)", "(ಡ_ಡ)", "(ง ื▿ ื)ว", "(>ᴗ<)", "(☆ω☆)", "(っ˘ω˘ς )",
  "(≥ω≤)", "υ ω υ", "(U ω U)", "( ´ ω ` )", "(U ω U✿)", "(⑅˘͈ ᵕ ˘͈ )",
  "( ˘ ³˘(◡‿◡ )", "(„• ֊ •„)", "uwu", "(˘ω˘✿)", "(^w^)", "(^・ω・^)", "(⊃✧w✧)⊃",
  "(U・x・U)", "( ˶ˆ꒳ˆ˵ )", "(๑♡⌓♡๑)", "(・ω・)", "(˘ω˘)", "(⑅‘ω‘)", "(◠‿◠)",
  "(u)(w)(u)", "_ˆwˆ_", "(✿✪‿✪｡)", "(U __ U)", "ÚwÚ", "♥(。U ω U。)", "(*u w u*)",
  "(◕‿◕✿)", "´0`", "(≥◡≤✿)", "(o･ω･o)", "(✿◕‿◕✿)", "(m..m)", "(oT-T)尸", 
  "(✿´‿`)", "(o´ω`o)", "☆w☆", "ᵘ ʷ ᵘ", "_´(uwu)`_", "(・∪・)-♡", "ᕙ(˘ω˘)ᕗ", "*•*(¦ ω ¦).*꙳."
];

const actions = [
  "*boops your nose*", "*glomps and huggles*", "*walks away*", "*tilts head*", "*blushes*", "*nuzzles*"
];

function uwuifyText(text, options = { faces: 0.1, actions: 0.05, stutters: 0.1 }) {
  let words = text.split(' ');
  for (let i = 0; i < words.length; i++) {
    // Skip URLs
    if (words[i].match(/https?:\/\/\S+/i) || words[i].includes('discord.com') || words[i].includes('tenor.com')) {
      continue;
    }

    // Apply text replacement to the specific word
    words[i] = words[i]
      .replace(/(?:r|l)/g, "w")
      .replace(/(?:R|L)/g, "W")
      .replace(/n([aeiou])/g, "ny$1")
      .replace(/N([aeiou])/g, "Ny$1")
      .replace(/N([AEIOU])/g, "NY$1")
      .replace(/ove/g, "uv");

    // 1. Roll for Stutter (only on words starting with consonants)
    if (Math.random() < options.stutters && words[i].length > 0) {
      const firstChar = words[i][0];
      if (/[b-df-hj-np-tv-z]/i.test(firstChar)) {
        words[i] = `${firstChar}-${firstChar}-${words[i]}`;
      }
    }
    
    // 2. Roll for Emoticon Face
    if (Math.random() < options.faces) {
      words.splice(i, 0, faces[Math.floor(Math.random() * faces.length)]);
      i++;
    } 
    // 3. Roll for Action (if no face was added)
    else if (Math.random() < options.actions) {
      words.splice(i, 0, actions[Math.floor(Math.random() * actions.length)]);
      i++;
    }
  }

  return words.join(' ');
}

module.exports = { uwuifyText };
