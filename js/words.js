/* words.js — the catalogue. Data only, no logic.
 *
 * 60 core words + 15 reserve words, each with labels in three languages.
 *
 * LABELS ARE FOR PARENTS ONLY. Nothing in this file is ever rendered in kid
 * mode. There is no code path that draws a label on her screen.
 *
 * Every language carries `roman` — the spelling you actually read, because
 * neither parent reads Gujarati script. Native script is kept alongside it
 * because it is what the audio files were generated from.
 *
 * Sindhi was dropped: iOS ships no Sindhi voice and no usable Sindhi audio
 * source exists, so the only alternatives were an Urdu or Hindi voice
 * approximating it - teaching her a subtly wrong word every time - or leaving
 * it out.
 *
 * `id` is permanent. It is the image filename, the audio filename and the
 * database key. Changing an id orphans everything attached to it.
 */

var WORDS = [

  /* ---------- kitchen & food ---------- */
  { id:"water",  emoji:"💧", tier:"core", tags:["kitchen","drink"], labels:{
    en:{ text:"water",   roman:"water",   tts:"water",  ttsLang:"en-IN" },
    hi:{ text:"पानी",     roman:"paani",   tts:"पानी",    ttsLang:"hi-IN" },
    gu:{ text:"પાણી",     roman:"paani" } } },

  { id:"milk",   emoji:"🥛", tier:"core", tags:["kitchen","drink"], labels:{
    en:{ text:"milk",    roman:"milk",    tts:"milk",   ttsLang:"en-IN" },
    hi:{ text:"दूध",      roman:"doodh",   tts:"दूध",     ttsLang:"hi-IN" },
    gu:{ text:"દૂધ",      roman:"doodh" } } },

  { id:"banana", emoji:"🍌", tier:"core", tags:["kitchen","fruit"], labels:{
    en:{ text:"banana",  roman:"banana",  tts:"banana", ttsLang:"en-IN" },
    hi:{ text:"केला",     roman:"kela",    tts:"केला",    ttsLang:"hi-IN" },
    gu:{ text:"કેળું",     roman:"kelu" } } },

  { id:"apple",  emoji:"🍎", tier:"core", tags:["kitchen","fruit"], labels:{
    en:{ text:"apple",   roman:"apple",   tts:"apple",  ttsLang:"en-IN" },
    hi:{ text:"सेब",      roman:"seb",     tts:"सेब",     ttsLang:"hi-IN" },
    gu:{ text:"સફરજન",   roman:"safarjan" } } },

  { id:"bread",  emoji:"🍞", tier:"core", tags:["kitchen","food"], labels:{
    en:{ text:"bread",   roman:"bread",   tts:"bread",  ttsLang:"en-IN" },
    hi:{ text:"ब्रेड",     roman:"bread",   tts:"ब्रेड",    ttsLang:"hi-IN" },
    gu:{ text:"બ્રેડ",     roman:"bread" } } },

  { id:"rice",   emoji:"🍚", tier:"core", tags:["kitchen","food"], labels:{
    en:{ text:"rice",    roman:"rice",    tts:"rice",   ttsLang:"en-IN" },
    hi:{ text:"चावल",     roman:"chaawal", tts:"चावल",    ttsLang:"hi-IN" },
    gu:{ text:"ભાત",      roman:"bhaat" } } },

  { id:"carrot", emoji:"🥕", tier:"core", tags:["kitchen","food"], labels:{
    en:{ text:"carrot",  roman:"carrot",  tts:"carrot", ttsLang:"en-IN" },
    hi:{ text:"गाजर",     roman:"gaajar",  tts:"गाजर",    ttsLang:"hi-IN" },
    gu:{ text:"ગાજર",     roman:"gaajar" } } },

  { id:"cookie", emoji:"🍪", tier:"core", tags:["kitchen","food"], labels:{
    en:{ text:"cookie",  roman:"cookie",  tts:"cookie", ttsLang:"en-IN" },
    hi:{ text:"बिस्कुट",   roman:"biskut",  tts:"बिस्कुट",  ttsLang:"hi-IN" },
    gu:{ text:"બિસ્કિટ",   roman:"biskit" } } },

  { id:"spoon",  emoji:"🥄", tier:"core", tags:["kitchen"], labels:{
    en:{ text:"spoon",   roman:"spoon",   tts:"spoon",  ttsLang:"en-IN" },
    hi:{ text:"चम्मच",    roman:"chammach",tts:"चम्मच",   ttsLang:"hi-IN" },
    gu:{ text:"ચમચી",     roman:"chamchi" } } },

  { id:"cup",    emoji:"☕", tier:"core", tags:["kitchen"], labels:{
    en:{ text:"cup",     roman:"cup",     tts:"cup",    ttsLang:"en-IN" },
    hi:{ text:"कप",       roman:"kap",     tts:"कप",      ttsLang:"hi-IN" },
    gu:{ text:"કપ",       roman:"kap" } } },

  /* ---------- around the house ---------- */
  { id:"door",   emoji:"🚪", tier:"core", tags:["house"], labels:{
    en:{ text:"door",    roman:"door",    tts:"door",   ttsLang:"en-IN" },
    hi:{ text:"दरवाज़ा",   roman:"darwaaza",tts:"दरवाज़ा",  ttsLang:"hi-IN" },
    gu:{ text:"બારણું",    roman:"baarnu" } } },

  { id:"chair",  emoji:"🪑", tier:"core", tags:["house"], labels:{
    en:{ text:"chair",   roman:"chair",   tts:"chair",  ttsLang:"en-IN" },
    hi:{ text:"कुर्सी",    roman:"kursi",   tts:"कुर्सी",   ttsLang:"hi-IN" },
    gu:{ text:"ખુરશી",    roman:"khurshi" } } },

  { id:"bed",    emoji:"🛏️", tier:"core", tags:["house"], labels:{
    en:{ text:"bed",     roman:"bed",     tts:"bed",    ttsLang:"en-IN" },
    hi:{ text:"पलंग",     roman:"palang",  tts:"पलंग",    ttsLang:"hi-IN" },
    gu:{ text:"પલંગ",     roman:"palang" } } },

  { id:"table",  emoji:"🍴", tier:"core", tags:["house"], labels:{
    en:{ text:"table",   roman:"table",   tts:"table",  ttsLang:"en-IN" },
    hi:{ text:"मेज़",      roman:"mez",     tts:"मेज़",     ttsLang:"hi-IN" },
    gu:{ text:"ટેબલ",     roman:"tebal" } } },

  { id:"pillow", emoji:"🛌", tier:"core", tags:["house"], labels:{
    en:{ text:"pillow",  roman:"pillow",  tts:"pillow", ttsLang:"en-IN" },
    hi:{ text:"तकिया",    roman:"takiya",  tts:"तकिया",   ttsLang:"hi-IN" },
    gu:{ text:"ઓશીકું",    roman:"oshiku" } } },

  { id:"blanket",emoji:"🧣", tier:"core", tags:["house"], labels:{
    en:{ text:"blanket", roman:"blanket", tts:"blanket",ttsLang:"en-IN" },
    hi:{ text:"कंबल",     roman:"kambal",  tts:"कंबल",    ttsLang:"hi-IN" },
    gu:{ text:"ધાબળો",    roman:"dhaablo" } } },

  { id:"light",  emoji:"💡", tier:"core", tags:["house"], labels:{
    en:{ text:"light",   roman:"light",   tts:"light",  ttsLang:"en-IN" },
    hi:{ text:"बत्ती",     roman:"batti",   tts:"बत्ती",    ttsLang:"hi-IN" },
    gu:{ text:"બત્તી",     roman:"batti" } } },

  { id:"window", emoji:"🪟", tier:"core", tags:["house"], labels:{
    en:{ text:"window",  roman:"window",  tts:"window", ttsLang:"en-IN" },
    hi:{ text:"खिड़की",    roman:"khidki",  tts:"खिड़की",   ttsLang:"hi-IN" },
    gu:{ text:"બારી",     roman:"baari" } } },

  { id:"key",    emoji:"🔑", tier:"core", tags:["house"], labels:{
    en:{ text:"key",     roman:"key",     tts:"key",    ttsLang:"en-IN" },
    hi:{ text:"चाबी",     roman:"chaabi",  tts:"चाबी",    ttsLang:"hi-IN" },
    gu:{ text:"ચાવી",     roman:"chaavi" } } },

  { id:"clock",  emoji:"🕐", tier:"core", tags:["house"], labels:{
    en:{ text:"clock",   roman:"clock",   tts:"clock",  ttsLang:"en-IN" },
    hi:{ text:"घड़ी",      roman:"ghadi",   tts:"घड़ी",     ttsLang:"hi-IN" },
    gu:{ text:"ઘડિયાળ",   roman:"ghadiyaal" } } },

  /* ---------- body & bathroom ---------- */
  { id:"teeth",  emoji:"🦷", tier:"core", tags:["body","bath"], labels:{
    en:{ text:"teeth",   roman:"teeth",   tts:"teeth",  ttsLang:"en-IN" },
    hi:{ text:"दाँत",     roman:"daant",   tts:"दाँत",    ttsLang:"hi-IN" },
    gu:{ text:"દાંત",     roman:"daant" } } },

  { id:"soap",   emoji:"🧼", tier:"core", tags:["bath"], labels:{
    en:{ text:"soap",    roman:"soap",    tts:"soap",   ttsLang:"en-IN" },
    hi:{ text:"साबुन",    roman:"saabun",  tts:"साबुन",   ttsLang:"hi-IN" },
    gu:{ text:"સાબુ",     roman:"saabu" } } },

  { id:"towel",  emoji:"🧻", tier:"core", tags:["bath"], labels:{
    en:{ text:"towel",   roman:"towel",   tts:"towel",  ttsLang:"en-IN" },
    hi:{ text:"तौलिया",   roman:"tauliya", tts:"तौलिया",  ttsLang:"hi-IN" },
    gu:{ text:"ટુવાલ",    roman:"tuvaal" } } },

  { id:"toothbrush", emoji:"🪥", tier:"core", tags:["bath"], labels:{
    en:{ text:"toothbrush", roman:"toothbrush", tts:"toothbrush", ttsLang:"en-IN" },
    hi:{ text:"ब्रश",      roman:"brush",   tts:"ब्रश",     ttsLang:"hi-IN" },
    gu:{ text:"બ્રશ",      roman:"brush" } } },

  { id:"hair",   emoji:"💇", tier:"core", tags:["body"], labels:{
    en:{ text:"hair",    roman:"hair",    tts:"hair",   ttsLang:"en-IN" },
    hi:{ text:"बाल",      roman:"baal",    tts:"बाल",     ttsLang:"hi-IN" },
    gu:{ text:"વાળ",      roman:"vaal" } } },

  { id:"hand",   emoji:"✋", tier:"core", tags:["body"], labels:{
    en:{ text:"hand",    roman:"hand",    tts:"hand",   ttsLang:"en-IN" },
    hi:{ text:"हाथ",      roman:"haath",   tts:"हाथ",     ttsLang:"hi-IN" },
    gu:{ text:"હાથ",      roman:"haath" } } },

  { id:"foot",   emoji:"🦶", tier:"core", tags:["body"], labels:{
    en:{ text:"foot",    roman:"foot",    tts:"foot",   ttsLang:"en-IN" },
    hi:{ text:"पैर",      roman:"pair",    tts:"पैर",     ttsLang:"hi-IN" },
    gu:{ text:"પગ",       roman:"pag" } } },

  { id:"eye",    emoji:"👁️", tier:"core", tags:["body"], labels:{
    en:{ text:"eye",     roman:"eye",     tts:"eye",    ttsLang:"en-IN" },
    hi:{ text:"आँख",      roman:"aankh",   tts:"आँख",     ttsLang:"hi-IN" },
    gu:{ text:"આંખ",      roman:"aankh" } } },

  { id:"nose",   emoji:"👃", tier:"core", tags:["body"], labels:{
    en:{ text:"nose",    roman:"nose",    tts:"nose",   ttsLang:"en-IN" },
    hi:{ text:"नाक",      roman:"naak",    tts:"नाक",     ttsLang:"hi-IN" },
    gu:{ text:"નાક",      roman:"naak" } } },

  { id:"ear",    emoji:"👂", tier:"core", tags:["body"], labels:{
    en:{ text:"ear",     roman:"ear",     tts:"ear",    ttsLang:"en-IN" },
    hi:{ text:"कान",      roman:"kaan",    tts:"कान",     ttsLang:"hi-IN" },
    gu:{ text:"કાન",      roman:"kaan" } } },

  /* ---------- clothes ---------- */
  { id:"shoes",  emoji:"👟", tier:"core", tags:["clothes"], labels:{
    en:{ text:"shoes",   roman:"shoes",   tts:"shoes",  ttsLang:"en-IN" },
    hi:{ text:"जूते",     roman:"joote",   tts:"जूते",    ttsLang:"hi-IN" },
    gu:{ text:"બૂટ",      roman:"boot" } } },

  { id:"socks",  emoji:"🧦", tier:"core", tags:["clothes"], labels:{
    en:{ text:"socks",   roman:"socks",   tts:"socks",  ttsLang:"en-IN" },
    hi:{ text:"मोज़े",     roman:"moze",    tts:"मोज़े",    ttsLang:"hi-IN" },
    gu:{ text:"મોજાં",     roman:"mojaa" } } },

  { id:"hat",    emoji:"🧢", tier:"core", tags:["clothes"], labels:{
    en:{ text:"hat",     roman:"hat",     tts:"hat",    ttsLang:"en-IN" },
    hi:{ text:"टोपी",     roman:"topi",    tts:"टोपी",    ttsLang:"hi-IN" },
    gu:{ text:"ટોપી",     roman:"topi" } } },

  { id:"shirt",  emoji:"👕", tier:"core", tags:["clothes"], labels:{
    en:{ text:"shirt",   roman:"shirt",   tts:"shirt",  ttsLang:"en-IN" },
    hi:{ text:"कमीज़",     roman:"kameez",  tts:"कमीज़",    ttsLang:"hi-IN" },
    gu:{ text:"શર્ટ",     roman:"shirt" } } },

  { id:"bag",    emoji:"🎒", tier:"core", tags:["clothes","nursery"], labels:{
    en:{ text:"bag",     roman:"bag",     tts:"bag",    ttsLang:"en-IN" },
    hi:{ text:"बैग",      roman:"baig",    tts:"बैग",     ttsLang:"hi-IN" },
    gu:{ text:"થેલી",     roman:"theli" } } },

  { id:"umbrella",emoji:"☂️", tier:"core", tags:["clothes","outside"], labels:{
    en:{ text:"umbrella",roman:"umbrella",tts:"umbrella",ttsLang:"en-IN" },
    hi:{ text:"छाता",     roman:"chhaata", tts:"छाता",    ttsLang:"hi-IN" },
    gu:{ text:"છત્રી",    roman:"chhatri" } } },

  /* ---------- toys & play ---------- */
  { id:"ball",   emoji:"⚽", tier:"core", tags:["toys"], labels:{
    en:{ text:"ball",    roman:"ball",    tts:"ball",   ttsLang:"en-IN" },
    hi:{ text:"गेंद",     roman:"gend",    tts:"गेंद",    ttsLang:"hi-IN" },
    gu:{ text:"દડો",      roman:"dado" } } },

  { id:"book",   emoji:"📖", tier:"core", tags:["toys","nursery"], labels:{
    en:{ text:"book",    roman:"book",    tts:"book",   ttsLang:"en-IN" },
    hi:{ text:"किताब",    roman:"kitaab",  tts:"किताब",   ttsLang:"hi-IN" },
    gu:{ text:"ચોપડી",    roman:"chopdi" } } },

  { id:"doll",   emoji:"🪆", tier:"core", tags:["toys"], labels:{
    en:{ text:"doll",    roman:"doll",    tts:"doll",   ttsLang:"en-IN" },
    hi:{ text:"गुड़िया",   roman:"gudiya",  tts:"गुड़िया",  ttsLang:"hi-IN" },
    gu:{ text:"ઢીંગલી",   roman:"dhingli" } } },

  { id:"car",    emoji:"🚗", tier:"core", tags:["toys","outside"], labels:{
    en:{ text:"car",     roman:"car",     tts:"car",    ttsLang:"en-IN" },
    hi:{ text:"गाड़ी",     roman:"gaadi",   tts:"गाड़ी",    ttsLang:"hi-IN" },
    gu:{ text:"ગાડી",     roman:"gaadi" } } },

  { id:"blocks", emoji:"🧱", tier:"core", tags:["toys","nursery"], labels:{
    en:{ text:"blocks",  roman:"blocks",  tts:"blocks", ttsLang:"en-IN" },
    hi:{ text:"ब्लॉक",     roman:"block",   tts:"ब्लॉक",    ttsLang:"hi-IN" },
    gu:{ text:"બ્લોક",     roman:"block" } } },

  { id:"balloon",emoji:"🎈", tier:"core", tags:["toys"], labels:{
    en:{ text:"balloon", roman:"balloon", tts:"balloon",ttsLang:"en-IN" },
    hi:{ text:"गुब्बारा",  roman:"gubbaara",tts:"गुब्बारा", ttsLang:"hi-IN" },
    gu:{ text:"ફુગ્ગો",    roman:"fuggo" } } },

  { id:"crayon", emoji:"🖍️", tier:"core", tags:["toys","nursery"], labels:{
    en:{ text:"crayon",  roman:"crayon",  tts:"crayon", ttsLang:"en-IN" },
    hi:{ text:"क्रेयॉन",    roman:"crayon",  tts:"क्रेयॉन",   ttsLang:"hi-IN" },
    gu:{ text:"ક્રેયોન",   roman:"crayon" } } },

  /* ---------- animals ---------- */
  { id:"dog",    emoji:"🐕", tier:"core", tags:["animals"], labels:{
    en:{ text:"dog",     roman:"dog",     tts:"dog",    ttsLang:"en-IN" },
    hi:{ text:"कुत्ता",    roman:"kutta",   tts:"कुत्ता",   ttsLang:"hi-IN" },
    gu:{ text:"કૂતરો",    roman:"kutro" } } },

  { id:"cat",    emoji:"🐈", tier:"core", tags:["animals"], labels:{
    en:{ text:"cat",     roman:"cat",     tts:"cat",    ttsLang:"en-IN" },
    hi:{ text:"बिल्ली",    roman:"billi",   tts:"बिल्ली",   ttsLang:"hi-IN" },
    gu:{ text:"બિલાડી",   roman:"bilaadi" } } },

  { id:"bird",   emoji:"🐦", tier:"core", tags:["animals","outside"], labels:{
    en:{ text:"bird",    roman:"bird",    tts:"bird",   ttsLang:"en-IN" },
    hi:{ text:"चिड़िया",   roman:"chidiya", tts:"चिड़िया",  ttsLang:"hi-IN" },
    gu:{ text:"ચકલી",     roman:"chakli" } } },

  { id:"cow",    emoji:"🐄", tier:"core", tags:["animals","outside"], labels:{
    en:{ text:"cow",     roman:"cow",     tts:"cow",    ttsLang:"en-IN" },
    hi:{ text:"गाय",      roman:"gaay",    tts:"गाय",     ttsLang:"hi-IN" },
    gu:{ text:"ગાય",      roman:"gaay" } } },

  { id:"fish",   emoji:"🐟", tier:"core", tags:["animals"], labels:{
    en:{ text:"fish",    roman:"fish",    tts:"fish",   ttsLang:"en-IN" },
    hi:{ text:"मछली",     roman:"machhli", tts:"मछली",    ttsLang:"hi-IN" },
    gu:{ text:"માછલી",    roman:"maachhli" } } },

  { id:"butterfly",emoji:"🦋", tier:"core", tags:["animals","outside"], labels:{
    en:{ text:"butterfly",roman:"butterfly",tts:"butterfly",ttsLang:"en-IN" },
    hi:{ text:"तितली",    roman:"titli",   tts:"तितली",   ttsLang:"hi-IN" },
    gu:{ text:"પતંગિયું",  roman:"patangiyu" } } },

  { id:"ant",    emoji:"🐜", tier:"core", tags:["animals","outside"], labels:{
    en:{ text:"ant",     roman:"ant",     tts:"ant",    ttsLang:"en-IN" },
    hi:{ text:"चींटी",     roman:"cheenti", tts:"चींटी",    ttsLang:"hi-IN" },
    gu:{ text:"કીડી",     roman:"kidi" } } },

  /* ---------- outside ---------- */
  { id:"tree",   emoji:"🌳", tier:"core", tags:["outside"], labels:{
    en:{ text:"tree",    roman:"tree",    tts:"tree",   ttsLang:"en-IN" },
    hi:{ text:"पेड़",      roman:"ped",     tts:"पेड़",     ttsLang:"hi-IN" },
    gu:{ text:"ઝાડ",      roman:"jhaad" } } },

  { id:"flower", emoji:"🌸", tier:"core", tags:["outside"], labels:{
    en:{ text:"flower",  roman:"flower",  tts:"flower", ttsLang:"en-IN" },
    hi:{ text:"फूल",      roman:"phool",   tts:"फूल",     ttsLang:"hi-IN" },
    gu:{ text:"ફૂલ",      roman:"phool" } } },

  { id:"leaf",   emoji:"🍃", tier:"core", tags:["outside"], labels:{
    en:{ text:"leaf",    roman:"leaf",    tts:"leaf",   ttsLang:"en-IN" },
    hi:{ text:"पत्ता",     roman:"patta",   tts:"पत्ता",    ttsLang:"hi-IN" },
    gu:{ text:"પાન",      roman:"paan" } } },

  { id:"rain",   emoji:"🌧️", tier:"core", tags:["outside"], labels:{
    en:{ text:"rain",    roman:"rain",    tts:"rain",   ttsLang:"en-IN" },
    hi:{ text:"बारिश",    roman:"baarish", tts:"बारिश",   ttsLang:"hi-IN" },
    gu:{ text:"વરસાદ",    roman:"varsaad" } } },

  { id:"sun",    emoji:"☀️", tier:"core", tags:["outside"], labels:{
    en:{ text:"sun",     roman:"sun",     tts:"sun",    ttsLang:"en-IN" },
    hi:{ text:"सूरज",     roman:"sooraj",  tts:"सूरज",    ttsLang:"hi-IN" },
    gu:{ text:"સૂરજ",     roman:"sooraj" } } },

  { id:"moon",   emoji:"🌙", tier:"core", tags:["outside"], labels:{
    en:{ text:"moon",    roman:"moon",    tts:"moon",   ttsLang:"en-IN" },
    hi:{ text:"चाँद",     roman:"chaand",  tts:"चाँद",    ttsLang:"hi-IN" },
    gu:{ text:"ચાંદો",     roman:"chaando" } } },

  { id:"star",   emoji:"⭐", tier:"core", tags:["outside"], labels:{
    en:{ text:"star",    roman:"star",    tts:"star",   ttsLang:"en-IN" },
    hi:{ text:"तारा",     roman:"taara",   tts:"तारा",    ttsLang:"hi-IN" },
    gu:{ text:"તારો",     roman:"taaro" } } },

  { id:"bus",    emoji:"🚌", tier:"core", tags:["outside"], labels:{
    en:{ text:"bus",     roman:"bus",     tts:"bus",    ttsLang:"en-IN" },
    hi:{ text:"बस",       roman:"bas",     tts:"बस",      ttsLang:"hi-IN" },
    gu:{ text:"બસ",       roman:"bas" } } },

  { id:"road",   emoji:"🛣️", tier:"core", tags:["outside"], labels:{
    en:{ text:"road",    roman:"road",    tts:"road",   ttsLang:"en-IN" },
    hi:{ text:"सड़क",      roman:"sadak",   tts:"सड़क",     ttsLang:"hi-IN" },
    gu:{ text:"રસ્તો",    roman:"rasto" } } },

  { id:"stone",  emoji:"🪨", tier:"core", tags:["outside"], labels:{
    en:{ text:"stone",   roman:"stone",   tts:"stone",  ttsLang:"en-IN" },
    hi:{ text:"पत्थर",    roman:"patthar", tts:"पत्थर",   ttsLang:"hi-IN" },
    gu:{ text:"પથ્થર",    roman:"paththar" } } },

  /* =======================================================================
     RESERVE — easier, shorter, more familiar. Never scheduled normally.
     Pulled in only when a word is retired after three days of misses, and
     only for the language it was retired in.
     ======================================================================= */

  { id:"roti",   emoji:"🫓", tier:"reserve", tags:["kitchen","food"], labels:{
    en:{ text:"roti",    roman:"roti",    tts:"roti",   ttsLang:"en-IN" },
    hi:{ text:"रोटी",     roman:"roti",    tts:"रोटी",    ttsLang:"hi-IN" },
    gu:{ text:"રોટલી",    roman:"rotli" } } },

  { id:"mango",  emoji:"🥭", tier:"reserve", tags:["kitchen","fruit"], labels:{
    en:{ text:"mango",   roman:"mango",   tts:"mango",  ttsLang:"en-IN" },
    hi:{ text:"आम",       roman:"aam",     tts:"आम",      ttsLang:"hi-IN" },
    gu:{ text:"કેરી",     roman:"keri" } } },

  { id:"grapes", emoji:"🍇", tier:"reserve", tags:["kitchen","fruit"], labels:{
    en:{ text:"grapes",  roman:"grapes",  tts:"grapes", ttsLang:"en-IN" },
    hi:{ text:"अंगूर",    roman:"angoor",  tts:"अंगूर",   ttsLang:"hi-IN" },
    gu:{ text:"દ્રાક્ષ",   roman:"draaksh" } } },

  { id:"chocolate",emoji:"🍫", tier:"reserve", tags:["kitchen","food"], labels:{
    en:{ text:"chocolate",roman:"chocolate",tts:"chocolate",ttsLang:"en-IN" },
    hi:{ text:"चॉकलेट",   roman:"chocolate",tts:"चॉकलेट",  ttsLang:"hi-IN" },
    gu:{ text:"ચોકલેટ",   roman:"chocolate" } } },

  { id:"fan",    emoji:"🌀", tier:"reserve", tags:["house"], labels:{
    en:{ text:"fan",     roman:"fan",     tts:"fan",    ttsLang:"en-IN" },
    hi:{ text:"पंखा",     roman:"pankha",  tts:"पंखा",    ttsLang:"hi-IN" },
    gu:{ text:"પંખો",     roman:"pankho" } } },

  { id:"comb",   emoji:"🪮", tier:"reserve", tags:["bath","body"], labels:{
    en:{ text:"comb",    roman:"comb",    tts:"comb",   ttsLang:"en-IN" },
    hi:{ text:"कंघी",     roman:"kanghi",  tts:"कंघी",    ttsLang:"hi-IN" },
    gu:{ text:"કાંસકો",   roman:"kaansko" } } },

  { id:"mirror", emoji:"🪞", tier:"reserve", tags:["house","bath"], labels:{
    en:{ text:"mirror",  roman:"mirror",  tts:"mirror", ttsLang:"en-IN" },
    hi:{ text:"शीशा",     roman:"sheesha", tts:"शीशा",    ttsLang:"hi-IN" },
    gu:{ text:"અરીસો",    roman:"ariso" } } },

  { id:"bucket", emoji:"🪣", tier:"reserve", tags:["bath","house"], labels:{
    en:{ text:"bucket",  roman:"bucket",  tts:"bucket", ttsLang:"en-IN" },
    hi:{ text:"बाल्टी",    roman:"baalti",  tts:"बाल्टी",   ttsLang:"hi-IN" },
    gu:{ text:"ડોલ",      roman:"dol" } } },

  { id:"slipper",emoji:"🩴", tier:"reserve", tags:["clothes"], labels:{
    en:{ text:"slipper", roman:"slipper", tts:"slipper",ttsLang:"en-IN" },
    hi:{ text:"चप्पल",    roman:"chappal", tts:"चप्पल",   ttsLang:"hi-IN" },
    gu:{ text:"ચંપલ",     roman:"champal" } } },

  { id:"plate",  emoji:"🍽️", tier:"reserve", tags:["kitchen"], labels:{
    en:{ text:"plate",   roman:"plate",   tts:"plate",  ttsLang:"en-IN" },
    hi:{ text:"थाली",     roman:"thaali",  tts:"थाली",    ttsLang:"hi-IN" },
    gu:{ text:"થાળી",     roman:"thaali" } } },

  { id:"phone",  emoji:"📱", tier:"reserve", tags:["house"], labels:{
    en:{ text:"phone",   roman:"phone",   tts:"phone",  ttsLang:"en-IN" },
    hi:{ text:"फ़ोन",      roman:"phone",   tts:"फ़ोन",     ttsLang:"hi-IN" },
    gu:{ text:"ફોન",      roman:"phone" } } },

  { id:"teddy",  emoji:"🧸", tier:"reserve", tags:["toys"], labels:{
    en:{ text:"teddy",   roman:"teddy",   tts:"teddy",  ttsLang:"en-IN" },
    hi:{ text:"टेडी",     roman:"teddy",   tts:"टेडी",    ttsLang:"hi-IN" },
    gu:{ text:"ટેડી",     roman:"teddy" } } },

  { id:"duck",   emoji:"🦆", tier:"reserve", tags:["animals"], labels:{
    en:{ text:"duck",    roman:"duck",    tts:"duck",   ttsLang:"en-IN" },
    hi:{ text:"बत्तख़",    roman:"battakh", tts:"बत्तख़",   ttsLang:"hi-IN" },
    gu:{ text:"બતક",      roman:"batak" } } },

  { id:"bottle", emoji:"🍼", tier:"reserve", tags:["kitchen"], labels:{
    en:{ text:"bottle",  roman:"bottle",  tts:"bottle", ttsLang:"en-IN" },
    hi:{ text:"बोतल",     roman:"botal",   tts:"बोतल",    ttsLang:"hi-IN" },
    gu:{ text:"બોટલ",     roman:"botal" } } },

  { id:"elephant",emoji:"🐘", tier:"reserve", tags:["animals","toys"], labels:{
    en:{ text:"elephant",roman:"elephant",tts:"elephant",ttsLang:"en-IN" },
    hi:{ text:"हाथी",     roman:"haathi",  tts:"हाथी",    ttsLang:"hi-IN" },
    gu:{ text:"હાથી",     roman:"haathi" } } }
];

/* The three languages, in rotation order. Colours are the background she sees;
 * the chime frequencies are what plays when the language changes. */
var LANGS = [
  { code:"en", name:"English",  bg:"#f6e2bd", ink:"#3b2f1a", chime:[523.25, 659.25] },
  { code:"hi", name:"Hindi",    bg:"#d8ecd2", ink:"#1f3320", chime:[587.33, 739.99] },
  { code:"gu", name:"Gujarati", bg:"#f7d6ce", ink:"#3f211a", chime:[659.25, 830.61] }
];

/* Every word now ships a real audio file for every language, so nothing depends
 * on which voices a given iPhone happens to have. This list is only the
 * last-resort fallback if an audio file ever fails to load. */
var TTS_LANGS = ["en", "hi"];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { WORDS: WORDS, LANGS: LANGS, TTS_LANGS: TTS_LANGS };
}
