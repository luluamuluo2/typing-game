import type { MessageKey } from "./i18n.ts"

export type Article = {
  id: string
  title: string
  text: string
  noteKey: MessageKey
}

export const ARTICLES: Article[] = [
  {
    id: "christmas",
    title: "Christmas",
    noteKey: "article.note.short",
    text: "Christmas is coming. I wish you a merry Christmas and a happy New Year.",
  },
  {
    id: "matches",
    title: "The little match girl",
    noteKey: "article.note.medium",
    text:
      "It was terribly cold. A poor little girl walked the streets with a bundle of matches in her apron. Nobody had bought any from her the whole day. She was afraid to go home, so she sat down in a corner and struck a match to warm her frozen fingers.",
  },
  {
    id: "wind",
    title: "The wind and the sun",
    noteKey: "article.note.medium",
    text:
      "The Wind and the Sun argued about who was stronger. They saw a traveler coming down the road, and the Sun said, \"Whoever can make him take off his coat shall be the winner.\" The Wind blew with all his might, but the man only wrapped his coat tighter. Then the Sun shone warmly, and the man took off his coat.",
  },
  {
    id: "edison",
    title: "Edison's story",
    noteKey: "article.note.long",
    text:
      "Thomas Edison was born in 1847. As a boy he was full of questions, and he liked to try things with his own hands. Later he worked in a laboratory day and night. He said genius is one percent inspiration and ninety-nine percent perspiration. After many failures he gave the world the electric light, the phonograph, and many other inventions.",
  },
  {
    id: "city",
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
