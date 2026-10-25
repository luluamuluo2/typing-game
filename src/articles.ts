import type { MessageKey } from "./i18n.ts"

export type Article = {
  id: string
  title: string
  mode: "pinyin" | "english"
  text: string
  noteKey: MessageKey
}

export const ARTICLES: Article[] = [
  {
    id: "hello-pinyin",
    mode: "pinyin",
    title: "你好，世界",
    noteKey: "article.note.short",
    text: "你好，世界！我喜欢学习中文，也喜欢练习打字。",
  },
  {
    id: "morning-pinyin",
    mode: "pinyin",
    title: "美好的早晨",
    noteKey: "article.note.medium",
    text: "早晨，太阳慢慢升起来。小鸟在树上唱歌，我们背着书包去学校。今天又是美好的一天，让我们一起认真学习，快乐成长。",
  },
  {
    id: "travel-pinyin",
    mode: "pinyin",
    title: "快乐的旅行",
    noteKey: "article.note.medium",
    text: "周末，我和朋友去旅行。路边的绿树随风摇动，远处的山峰连成一片。我们走过小桥，听见流水的声音，也看见了许多美丽的风景。",
  },
  {
    id: "christmas",
    mode: "english",
    title: "Christmas",
    noteKey: "article.note.short",
    text: "Christmas is coming. I wish you a merry Christmas and a happy New Year.",
  },
  {
    id: "matches",
    mode: "english",
    title: "The little match girl",
    noteKey: "article.note.medium",
    text:
      "It was terribly cold. A poor little girl walked the streets with a bundle of matches in her apron. Nobody had bought any from her the whole day. She was afraid to go home, so she sat down in a corner and struck a match to warm her frozen fingers.",
  },
  {
    id: "wind",
    mode: "english",
    title: "The wind and the sun",
    noteKey: "article.note.medium",
    text:
      "The Wind and the Sun argued about who was stronger. They saw a traveler coming down the road, and the Sun said, \"Whoever can make him take off his coat shall be the winner.\" The Wind blew with all his might, but the man only wrapped his coat tighter. Then the Sun shone warmly, and the man took off his coat.",
  },
  {
    id: "edison",
    mode: "english",
    title: "Edison's story",
    noteKey: "article.note.long",
    text:
      "Thomas Edison was born in 1847. As a boy he was full of questions, and he liked to try things with his own hands. Later he worked in a laboratory day and night. He said genius is one percent inspiration and ninety-nine percent perspiration. After many failures he gave the world the electric light, the phonograph, and many other inventions.",
  },
  {
    id: "city",
    mode: "english",
    title: "A walk in the city",
    noteKey: "article.note.punctuation",
    text:
      "Every morning I walk across the square. The fountain is already awake, and the shops open one by one. A baker calls from the corner; a yellow bicycle rings its bell. If you type without looking down, you can hear the city keep time with your fingers. Don't stop. Don't look back. The chase is already on.",
  },
]

export function normalizeArticle(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
}
