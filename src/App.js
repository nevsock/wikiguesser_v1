import {
  AlertCircle,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Eye,
  ExternalLink,
  History,
  RefreshCw,
  Search,
  Tags,
  XCircle,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

const WIKI_API_URL = 'https://ja.wikipedia.org/w/api.php';
const WIKI_BASE_URL = 'https://ja.wikipedia.org/wiki/';
const MAX_CARDS = 5;
const MAX_CARD_USAGE = 3;
const INITIAL_LIVES = 3;
const MAX_ARTICLE_ATTEMPTS = 20;
const ANIME_LIST_PAGES = [
  '日本のテレビアニメ作品一覧 (1950年代-1960年代)',
  '日本のテレビアニメ作品一覧 (1970年代)',
  '日本のテレビアニメ作品一覧 (1980年代)',
  '日本のテレビアニメ作品一覧 (1990年代)',
  '日本のテレビアニメ作品一覧 (2000年代 前半)',
  '日本のテレビアニメ作品一覧 (2000年代 後半)',
  '日本のテレビアニメ作品一覧 (2010年代 前半)',
  '日本のテレビアニメ作品一覧 (2010年代 後半)',
  '日本のテレビアニメ作品一覧 (2020年代 前半)',
  '日本のテレビアニメ作品一覧 (2020年代 後半)',
];

const EXCLUDED_SECTIONS = [
  '脚注',
  '出典',
  '参考文献',
  '関連項目',
  '外部リンク',
  '注釈',
  'ギャラリー',
];

const GENRE_OPTIONS = [
  { id: 'all', label: '全ジャンル', category: null, description: '完全ランダムで記事を取得' },
  { id: 'history', label: '歴史', category: '歴史' },
  { id: 'science', label: '科学', category: '科学' },
  { id: 'geography', label: '地理', category: '地理' },
  { id: 'culture', label: '文化', category: '文化' },
  { id: 'people', label: '人物', category: '人物' },
  { id: 'sports', label: 'スポーツ', category: 'スポーツ' },
  {
    id: 'anime',
    label: '日本のテレビアニメ',
    category: null,
    description: '年代別の日本テレビアニメ一覧から抽選',
  },
];

const redactText = (text, title) => {
  if (!text || !title) return '';
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapedTitle, 'gi');
  return text.replace(regex, '█'.repeat(title.length));
};

const normalize = (str) => str.trim().toLowerCase();

const getCardIcon = (type) => {
  switch (type) {
    case 'HINT_SECTION':
      return <BookOpen size={20} />;
    case 'HINT_CATEGORY':
      return <Tags size={20} />;
    case 'HINT_INFOBOX':
      return <BrainCircuit size={20} />;
    case 'ABILITY_REVEAL':
      return <Eye size={20} />;
    default:
      return <RefreshCw size={20} />;
  }
};

const getCardColor = (type) => {
  if (type === 'ABILITY_REVEAL')
    return 'bg-yellow-50 border-yellow-300 text-yellow-800 hover:bg-yellow-100';
  if (type === 'HINT_SECTION')
    return 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100';
  if (type === 'HINT_INFOBOX')
    return 'bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100';
  return 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100';
};

const getCardLabel = (card) => {
  switch (card.type) {
    case 'HINT_SECTION':
      return `セクション:\n${card.metadata ? card.metadata.sectionName : '不明'}\n(約${card.metadata?.textLength || 0}文字)`;
    case 'HINT_CATEGORY':
      return 'カテゴリ一覧';
    case 'HINT_INFOBOX':
      return 'インフォボックス';
    case 'ABILITY_REVEAL':
      return '一文字開示';
    default:
      return '不明なカード';
  }
};

const useDomParser = () => {
  const parserRef = useRef(null);
  return useCallback(() => {
    if (!parserRef.current) {
      parserRef.current = new DOMParser();
    }
    return parserRef.current;
  }, []);
};

const extractSectionContent = (doc, sectionName, sectionLevel, options = {}) => {
  const { includeHtml = false } = options;
  const headlines = doc.querySelectorAll(`h${sectionLevel}`);
  let targetHeadline = null;
  headlines.forEach((headline) => {
    if (headline.textContent.includes(sectionName)) targetHeadline = headline;
  });

  if (!targetHeadline) return { text: null, length: 0, found: false };

  let currentNode = targetHeadline.parentElement
    ? targetHeadline.parentElement.nextElementSibling
    : null;
  if (!currentNode) currentNode = targetHeadline.nextElementSibling;

  const textBuffer = [];
  const htmlBuffer = [];
  let limit = 0;

  while (currentNode && limit < 50) {
    const tag = currentNode.tagName;
    if (tag && /^H[1-6]$/.test(tag)) break;

    if (['P', 'UL', 'OL', 'DIV', 'BLOCKQUOTE', 'TABLE', 'DL'].includes(tag)) {
      textBuffer.push(currentNode.textContent);
    }

    if (includeHtml && tag && !['SCRIPT', 'STYLE'].includes(tag)) {
      htmlBuffer.push(currentNode.outerHTML || '');
    }

    currentNode = currentNode.nextElementSibling;
    limit += 1;
  }

  const rawText = textBuffer.join('').replace(/\s+/g, ' ').trim();
  const rawHtml = includeHtml ? htmlBuffer.join('') : null;
  return { text: rawText, length: rawText.length, found: true, html: rawHtml };
};

function App() {
  const [gameState, setGameState] = useState('init');
  const [article, setArticle] = useState(null);
  const [maskedTitle, setMaskedTitle] = useState([]);
  const [cards, setCards] = useState([]);
  const [usedCardCount, setUsedCardCount] = useState(0);
  const [clues, setClues] = useState([]);
  const [lives, setLives] = useState(INITIAL_LIVES);
  const [guessHistory, setGuessHistory] = useState([]);
  const [message, setMessage] = useState(null);
  const [selectedGenres, setSelectedGenres] = useState(['all']);
  const [guessInputs, setGuessInputs] = useState([]);
  const [isGenreModalOpen, setGenreModalOpen] = useState(false);

  const inputRefs = useRef([]);
  const isComposingRef = useRef(false);

  const getParser = useDomParser();

  const getActiveGenreOptions = () =>
    GENRE_OPTIONS.filter(
      (option) => option.id !== 'all' && selectedGenres.includes(option.id),
    );

  const isAllGenreSelected = selectedGenres.includes('all') || getActiveGenreOptions().length === 0;

  const getGenreSummary = () => {
    if (isAllGenreSelected) return GENRE_OPTIONS[0].description;
    return getActiveGenreOptions()
      .map((option) => option.label)
      .join(' / ');
  };
  const getNormalizedGuessArrayState = (source = guessInputs) => {
    if (source && source.length === maskedTitle.length) return [...source];
    return Array(maskedTitle.length)
      .fill('')
      .map((_, idx) => (source ? source[idx] || '' : ''));
  };

  const getOutputChar = (value) => {
    if (!value) return '';
    const chars = Array.from(value);
    return chars[chars.length - 1] || '';
  };

  const handleGenreToggle = (id) => {
    setSelectedGenres((prev) => {
      if (id === 'all') {
        return ['all'];
      }
      const withoutAll = prev.filter((genreId) => genreId !== 'all');
      if (withoutAll.includes(id)) {
        const updated = withoutAll.filter((genreId) => genreId !== id);
        return updated.length === 0 ? ['all'] : updated;
      }
      return [...withoutAll, id];
    });
  };

const fetchGenreTitle = async (genreOption) => {
    if (!genreOption) return null;
    if (genreOption.id === 'anime') {
      return fetchAnimeTitleFromLists();
    }
    if (!genreOption.category) return null;
    const categoryTitle = genreOption.category.startsWith('Category:')
      ? genreOption.category
      : `Category:${genreOption.category}`;
    const categoryRes = await fetch(
      `${WIKI_API_URL}?action=query&list=categorymembers&cmtitle=${encodeURIComponent(
        categoryTitle,
      )}&cmnamespace=0&cmtype=page&cmlimit=50&format=json&origin=*`,
    );
    const categoryData = await categoryRes.json();
    const members = categoryData.query?.categorymembers || [];
    if (members.length === 0) return null;
    const randomMember = members[Math.floor(Math.random() * members.length)];
    return randomMember?.title || null;
  };

  const fetchAnimeTitleFromLists = async () => {
    const sourcePage =
      ANIME_LIST_PAGES[Math.floor(Math.random() * ANIME_LIST_PAGES.length)];
    try {
      const res = await fetch(
        `${WIKI_API_URL}?action=query&titles=${encodeURIComponent(
          sourcePage,
        )}&prop=links&plnamespace=0&pllimit=500&format=json&origin=*`,
      );
      const data = await res.json();
      const pages = data.query?.pages || {};
      const firstPage = Object.values(pages)[0];
      const links = firstPage?.links || [];
      const candidates = links
        .map((link) => link.title)
        .filter(
          (title) =>
            title &&
            !ANIME_LIST_PAGES.includes(title) &&
            title.length >= 5 &&
            !/一覧|category|Category/i.test(title),
        );
      if (candidates.length === 0) return null;
      return candidates[Math.floor(Math.random() * candidates.length)];
    } catch (error) {
      console.error('Failed to fetch anime list links:', error);
      return null;
    }
  };

  const fetchRandomTitle = async () => {
    const activeGenres = getActiveGenreOptions();
    if (activeGenres.length > 0) {
      const genreOption = activeGenres[Math.floor(Math.random() * activeGenres.length)];
      const genreTitle = await fetchGenreTitle(genreOption);
      if (genreTitle) return genreTitle;
    }
    const randomRes = await fetch(
      `${WIKI_API_URL}?action=query&list=random&rnnamespace=0&rnlimit=1&format=json&origin=*`,
    );
    const randomData = await randomRes.json();
    return randomData?.query?.random?.[0]?.title || null;
  };

  const fetchArticleByTitle = async (title) => {
    if (!title) return null;
    const parseRes = await fetch(
      `${WIKI_API_URL}?action=parse&page=${encodeURIComponent(
        title,
      )}&prop=text|categories|sections&format=json&origin=*`,
    );
    const parseData = await parseRes.json();
    if (parseData.parse && parseData.parse.text) {
      return {
        title,
        html: parseData.parse.text['*'],
        categories: parseData.parse.categories || [],
        sections: parseData.parse.sections || [],
      };
    }
    return null;
  };

  const initGame = async () => {
    setGameState('loading');
    setMessage(null);
    setClues([]);
    setLives(INITIAL_LIVES);
    setUsedCardCount(0);
    setGuessHistory([]);
    setGuessInputs([]);
    inputRefs.current = [];

    try {
      let targetArticle = null;
      let attempts = 0;

      while (!targetArticle && attempts < MAX_ARTICLE_ATTEMPTS) {
        // eslint-disable-next-line no-await-in-loop
        const candidateTitle = await fetchRandomTitle();
        attempts += 1;
        if (!candidateTitle || candidateTitle.length < 5) continue;
        // eslint-disable-next-line no-await-in-loop
        const fetchedArticle = await fetchArticleByTitle(candidateTitle);
        if (fetchedArticle) {
          targetArticle = fetchedArticle;
        }
      }

      if (!targetArticle) {
        throw new Error('記事の取得に失敗しました');
      }

      setArticle(targetArticle);

      const titleChars = targetArticle.title.split('');
      const initialMask = titleChars.map((char) => ({
        char,
        revealed: Math.random() < 0.4,
      }));

      if (!initialMask.some((char) => !char.revealed)) {
        initialMask[Math.floor(Math.random() * initialMask.length)].revealed = false;
      }

      setMaskedTitle(initialMask);
      setGuessInputs(initialMask.map((mask, idx) => (mask.revealed ? titleChars[idx] : '')));
      generateCards(targetArticle);
      setGameState('playing');
    } catch (error) {
      console.error('Error initializing game:', error);
      setMessage({
        type: 'error',
        text: '記事の取得に失敗しました。リトライしてください。',
      });
      setGameState('init');
    }
  };

  const generateCards = (articleData) => {
    const parser = getParser();
    const doc = parser.parseFromString(articleData.html, 'text/html');

    const validSections = (articleData.sections || [])
      .filter(
        (section) =>
          !EXCLUDED_SECTIONS.includes(section.line) && parseInt(section.index, 10) > 0,
      )
      .map((section) => {
        const info = extractSectionContent(doc, section.line, section.level);
        return { ...section, textLength: info.length };
      })
      .filter((section) => section.textLength > 10);

    const hasInfobox =
      articleData.html.includes('infobox') || articleData.html.includes('基礎情報');
    const hasVisibleCategories = (articleData.categories || []).some(
      (category) =>
        !category['*'].includes('Hidden') && !category['*'].includes('隠しカテゴリ'),
    );

    const sectionCards = validSections.map((section) => ({
      type: 'HINT_SECTION',
      metadata: {
        sectionName: section.line,
        sectionLevel: section.level,
        textLength: section.textLength,
      },
    }));

    const candidateCards = [];
    if (hasInfobox) candidateCards.push({ type: 'HINT_INFOBOX' });
    if (hasVisibleCategories) candidateCards.push({ type: 'HINT_CATEGORY' });
    candidateCards.push({ type: 'ABILITY_REVEAL' });
    candidateCards.push(...sectionCards);

    const uniqueCards = candidateCards
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(MAX_CARDS, candidateCards.length))
      .map((card, index) => ({
        id: index,
        used: false,
        ...card,
      }));

    setCards(uniqueCards);
  };

  const handleCardUse = (card) => {
    if (!article || usedCardCount >= MAX_CARD_USAGE || card.used) return;

    const parser = getParser();
    const doc = parser.parseFromString(article.html, 'text/html');
    let clueContent = null;
    let clueTitle = '';
    let isStructuredData = false;
    let allowsHtml = false;

    switch (card.type) {
      case 'HINT_SECTION': {
        if (card.metadata) {
          const { sectionName, sectionLevel } = card.metadata;
          const { text, html, found } = extractSectionContent(
            doc,
            sectionName,
            sectionLevel,
            { includeHtml: true },
          );
          if (found && (html || text)) {
            clueTitle = `セクション: ${sectionName}`;
            if (html) {
              clueContent = redactText(html, article.title);
              allowsHtml = true;
            } else {
              clueContent = redactText(text, article.title);
            }
          } else {
            clueTitle = `セクション: ${sectionName}`;
            clueContent = '（このセクションの読み込みに失敗しました）';
          }
        } else {
          clueTitle = 'セクションエラー';
          clueContent = 'セクション情報の取得に失敗しました。';
        }
        break;
      }
      case 'HINT_CATEGORY': {
        const hiddenCats = article.categories
          .filter(
            (category) =>
              !category['*'].includes('Hidden') && !category['*'].includes('隠しカテゴリ')
          )
          .map((category) => category['*'])
          .slice(0, 5);

        clueTitle = 'カテゴリ一覧';
        clueContent = hiddenCats.length
          ? redactText(hiddenCats.join(', '), article.title)
          : 'カテゴリがありません';
        break;
      }
      case 'HINT_INFOBOX': {
        const infobox = doc.querySelector('.infobox');
        if (infobox) {
          const rows = infobox.querySelectorAll('tr');
          const extractedData = [];

          rows.forEach((row) => {
            const th = row.querySelector('th');
            const td = row.querySelector('td');
            if (th && td && extractedData.length < 8) {
              const label = th.textContent.trim();
              const value = td.textContent.replace(/\s+/g, ' ').trim();

              if (label && value) {
                extractedData.push({
                  label: redactText(label, article.title),
                  value: redactText(value, article.title),
                });
              }
            }
          });

          if (extractedData.length > 0) {
            clueTitle = 'インフォボックス情報';
            clueContent = extractedData;
            isStructuredData = true;
          } else {
            const clone = infobox.cloneNode(true);
            clone.querySelectorAll('img, style, script').forEach((el) => el.remove());
            const text = clone.textContent.replace(/\s+/g, ' ').trim().slice(0, 300);
            clueTitle = 'インフォボックス（テキスト）';
            clueContent = redactText(text, article.title);
          }
        } else {
          clueTitle = 'インフォボックス';
          clueContent = 'この記事にはインフォボックスがありません。';
        }
        break;
      }
      case 'ABILITY_REVEAL': {
        const unrevealedIndices = maskedTitle
          .map((item, idx) => (item.revealed ? null : idx))
          .filter((idx) => idx !== null);

        if (unrevealedIndices.length > 0) {
          const randomIndex =
            unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
          const newMask = [...maskedTitle];
          newMask[randomIndex].revealed = true;
          setMaskedTitle(newMask);
          setGuessInputs((prev) => {
            const base = getNormalizedGuessArrayState(prev);
            base[randomIndex] = article.title[randomIndex];
            return base;
          });
          clueTitle = 'アビリティ発動';
          clueContent = `${randomIndex + 1}文字目「${article.title[randomIndex]}」を開示しました。`;
        } else {
          clueTitle = 'アビリティ不発';
          clueContent = '既に全ての文字が開示されています。';
        }
        break;
      }
      default:
        break;
    }

    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, used: true } : c)));
    setUsedCardCount((prev) => prev + 1);

    if (clueContent) {
      setClues((prev) => [
        {
          title: clueTitle,
          content: clueContent,
          type: card.type,
          isStructured: isStructuredData,
          allowHtml: allowsHtml,
        },
        ...prev,
      ]);
    }
  };

  const handleGuess = (event) => {
    if (event && event.preventDefault) {
      event.preventDefault();
    }
    if (!article) return;

    const normalizedInputs = getNormalizedGuessArrayState();
    if (normalizedInputs.length === 0) return;

    const guessString = normalizedInputs
      .map((value, idx) => (maskedTitle[idx]?.revealed ? article.title[idx] : getOutputChar(value)))
      .join('');

    if (!guessString.trim()) return;

    const userGuess = normalize(guessString);
    const actualTitle = normalize(article.title);

    if (userGuess === actualTitle) {
      setGameState('won');
      setMaskedTitle((prev) => prev.map((item) => ({ ...item, revealed: true })));
      setGuessInputs(article.title.split(''));
      setMessage(null);
      return;
    }

    const newMask = [...maskedTitle];
    let matchedCount = 0;

    for (let i = 0; i < Math.min(userGuess.length, actualTitle.length); i += 1) {
      if (userGuess[i] === actualTitle[i] && !newMask[i].revealed) {
        newMask[i].revealed = true;
        matchedCount += 1;
      }
    }

    setGuessInputs((prev) => {
      const base = getNormalizedGuessArrayState(prev);
      for (let i = 0; i < newMask.length; i += 1) {
        if (newMask[i].revealed) {
          base[i] = article.title[i];
        }
      }
      return base;
    });
    setGuessHistory((prev) => [{ word: guessString, matches: matchedCount }, ...prev]);

    const newLives = lives - 1;
    setLives(newLives);

    if (newLives <= 0) {
      setGameState('lost');
      setMaskedTitle(newMask.map((item) => ({ ...item, revealed: true })));
      setGuessInputs(article.title.split(''));
    } else {
      setMaskedTitle(newMask);
      setMessage({
        type: matchedCount > 0 ? 'success' : 'warning',
        text:
          matchedCount > 0
            ? `不正解ですが、${matchedCount}文字が一致し開示されました！`
            : '不正解です。一致する文字はありませんでした。',
      });
    }
  };

  const handleGiveUp = () => {
    if (!article) return;
    setGameState('gaveup');
    setMaskedTitle((prev) => prev.map((item) => ({ ...item, revealed: true })));
    setGuessInputs(article.title.split(''));
  };

  const focusInput = (index) => {
    const target = inputRefs.current[index];
    if (target) {
      target.focus();
      target.select();
    }
  };

  const findNextEditableIndex = (start) => {
    for (let i = start + 1; i < maskedTitle.length; i += 1) {
      if (!maskedTitle[i]?.revealed) return i;
    }
    return null;
  };

  const findPrevEditableIndex = (start) => {
    for (let i = start - 1; i >= 0; i -= 1) {
      if (!maskedTitle[i]?.revealed) return i;
    }
    return null;
  };

  const moveToPrevInput = (currentIndex) => {
    const prevIndex = findPrevEditableIndex(currentIndex);
    if (prevIndex !== null) focusInput(prevIndex);
  };

  const handleInputChange = (index, value) => {
    if (!article || maskedTitle[index]?.revealed) return;
    setGuessInputs((prev) => {
      const base = getNormalizedGuessArrayState(prev);
      base[index] = value || '';
      return base;
    });
  };

  const handleInputKeyDown = (event, index) => {
    if (maskedTitle[index]?.revealed) {
      event.preventDefault();
      return;
    }

    if ((event.key === 'Enter' || event.key === 'ArrowRight') && !isComposingRef.current) {
      event.preventDefault();
      let lastFilledIndex = index;
      setGuessInputs((prev) => {
        const base = getNormalizedGuessArrayState(prev);
        const chars = Array.from(base[index] || '');
        if (chars.length === 0) {
          return base;
        }
        let charPtr = 0;
        for (let i = index; i < maskedTitle.length && charPtr < chars.length; i += 1) {
          if (maskedTitle[i]?.revealed) continue;
          if (i !== index && base[i]) break;
          base[i] = chars[charPtr];
          lastFilledIndex = i;
          charPtr += 1;
        }
        return base;
      });

      const nextIndex = findNextEditableIndex(lastFilledIndex);
      if (nextIndex !== null) {
        focusInput(nextIndex);
      } else if (!isSubmitDisabled) {
        handleGuess();
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveToPrevInput(index);
    } else if (
      event.key === 'Backspace' &&
      !isComposingRef.current &&
      (!guessInputs[index] || guessInputs[index].length === 0)
    ) {
      moveToPrevInput(index);
    }
  };

  const renderClueContent = (clue) => {
    if (clue.isStructured) {
      return (
        <div className="grid grid-cols-1 gap-2">
          {clue.content.map((row, idx) => (
            <div
              key={`${row.label}-${idx.toString()}`}
              className="flex border-b border-slate-200 last:border-0 pb-1 last:pb-0 text-xs md:text-sm"
            >
              <span className="w-1/3 font-bold text-slate-500 pr-2">{row.label}</span>
              <span className="w-2/3 text-slate-800">{row.value}</span>
            </div>
          ))}
        </div>
      );
    }
    if (clue.allowHtml) {
      return (
        <div
          className="wiki-section-content max-h-72 overflow-y-auto pr-2 text-sm text-slate-700 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: clue.content }}
        />
      );
    }
    return clue.content;
  };

  const guessArray =
    article && maskedTitle.length > 0
      ? maskedTitle.map((mask, idx) =>
          mask.revealed ? article.title[idx] : getOutputChar(guessInputs[idx]),
        )
      : [];
  const guessString = guessArray.join('');
  const isSubmitDisabled = !guessString.trim();

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-800 font-sans selection:bg-indigo-200">
      <div className="max-w-3xl grow mx-auto p-4 pb-4">
        <header className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 flex-wrap">
            <Search className="text-indigo-600" />
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              WikiGuesser
            </h1>
            <button
              type="button"
              onClick={() => setGenreModalOpen(true)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition"
            >
              ジャンル設定
            </button>
            <span className="hidden sm:block text-[11px] text-slate-400 max-w-[200px] truncate">
              {getGenreSummary()}
            </span>
          </div>
          {gameState === 'playing' && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-sm font-medium text-slate-600">
              <span>使用カード:</span>
              <span className={usedCardCount >= MAX_CARD_USAGE ? 'text-red-500' : 'text-indigo-600'}>
                {usedCardCount}/{MAX_CARD_USAGE}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {[...Array(INITIAL_LIVES)].map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full ${i < lives ? 'bg-red-500' : 'bg-slate-300'}`}
                />
              ))}
            </div>
          </div>
        )}
        </header>

        {isGenreModalOpen && (
          <div
            className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/50 px-4"
            onClick={() => setGenreModalOpen(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">ジャンルを選択</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    複数ジャンルをチェックすると、それらのカテゴリから記事を抽選します。プレイ中に変更した場合は次回ゲームから反映されます。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setGenreModalOpen(false)}
                  className="text-slate-500 hover:text-slate-800 transition text-sm font-semibold"
                >
                  閉じる
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {GENRE_OPTIONS.map((option) => (
                  <label
                    key={option.id}
                    className={`flex items-center gap-2 border rounded-xl px-3 py-2 text-sm cursor-pointer ${
                      selectedGenres.includes(option.id)
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-800'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="form-checkbox h-4 w-4 text-indigo-600 rounded"
                      checked={selectedGenres.includes(option.id)}
                      onChange={() => handleGenreToggle(option.id)}
                    />
                    <div className="flex flex-col">
                      <span className="font-semibold">{option.label}</span>
                      {option.description && (
                        <span className="text-[11px] text-slate-500">{option.description}</span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
              {gameState === 'playing' && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  現在プレイ中です。設定の変更は「もう一度遊ぶ」で次のゲームを開始した際に反映されます。
                </p>
              )}
            </div>
          </div>
        )}

        {gameState === 'init' && (
          <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-slate-200">
            <BookOpen size={64} className="mx-auto text-indigo-200 mb-4" />
            <h2 className="text-2xl font-bold mb-2 text-slate-800">Wikipedia記事当てゲーム</h2>
            <p className="text-slate-500 mb-8 max-w-md mx-auto">
              虫食いになった記事タイトルを、ヒントカードを使って推測してください。
              <br />
              各カードはセクションやカテゴリなどの情報を提供します。
            </p>
            <button
              type="button"
              onClick={initGame}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-full font-bold transition shadow-lg shadow-indigo-200 flex items-center gap-2 mx-auto"
            >
              <Search size={20} />
              ゲームスタート
            </button>
          </div>
        )}

        {gameState === 'loading' && (
          <div className="text-center py-20">
            <RefreshCw className="animate-spin mx-auto text-indigo-600 mb-4" size={32} />
            <p className="text-slate-600">ランダムな記事を探しています...</p>
          </div>
        )}

        {(gameState === 'playing' ||
          gameState === 'won' ||
          gameState === 'lost' ||
          gameState === 'gaveup') &&
          article && (
          <main className="space-y-6">
            <section className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-indigo-600 opacity-10" />
              <h2 className="text-sm text-slate-400 font-bold tracking-widest uppercase mb-4">
                Target Article
              </h2>

              <div className="flex flex-wrap justify-center gap-2 mb-2">
                {maskedTitle.map((item, idx) => (
                  <div
                    key={`${item.char}-${idx.toString()}`}
                    className={`w-10 h-12 md:w-12 md:h-14 flex items-center justify-center text-xl md:text-2xl font-bold rounded-md border-b-4 transition-all duration-300 ${
                      item.revealed
                        ? 'bg-white border-slate-200 text-slate-800 shadow-inner'
                        : 'bg-slate-800 border-slate-900 text-transparent'
                    } ${
                      (gameState === 'won' || gameState === 'lost') && !item.revealed ? 'opacity-50' : ''
                    }`}
                  >
                    {item.char}
                  </div>
                ))}
              </div>

              {gameState === 'won' && (
                <div className="mt-4 flex flex-col items-center gap-3">
                  <div className="inline-flex items-center gap-2 text-green-600 font-bold bg-green-50 px-4 py-2 rounded-full">
                    <CheckCircle2 size={20} />
                    正解！おめでとうございます！
                  </div>
                  <a
                    href={`${WIKI_BASE_URL}${encodeURIComponent(article.title)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 text-sm"
                  >
                    <ExternalLink size={14} />
                    実際の記事を読む
                  </a>
                </div>
              )}

                {gameState === 'lost' && (
                  <div className="mt-4 flex flex-col items-center gap-3">
                    <div className="inline-flex items-center gap-2 text-red-600 font-bold bg-red-50 px-4 py-2 rounded-full">
                      <XCircle size={20} />
                      残念！正解は「{article.title}」でした。
                  </div>
                  <a
                    href={`${WIKI_BASE_URL}${encodeURIComponent(article.title)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 text-sm"
                  >
                    <ExternalLink size={14} />
                    実際の記事を読む
                    </a>
                  </div>
                )}

                {gameState === 'gaveup' && (
                  <div className="mt-4 flex flex-col items-center gap-3">
                    <div className="inline-flex items-center gap-2 text-slate-700 font-bold bg-slate-100 px-4 py-2 rounded-full">
                      <AlertCircle size={20} />
                      ギブアップ！正解は「{article.title}」でした。
                    </div>
                    <a
                      href={`${WIKI_BASE_URL}${encodeURIComponent(article.title)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 text-sm"
                    >
                      <ExternalLink size={14} />
                      実際の記事を読む
                    </a>
                  </div>
                )}

              {gameState === 'playing' && message && (
                <div
                  className={`mt-4 inline-flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-full ${
                    message.type === 'success'
                      ? 'bg-green-50 text-green-600'
                      : 'bg-red-50 text-red-600'
                  }`}
                >
                  {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  {message.text}
                </div>
              )}
            </section>

            {gameState === 'playing' && (
              <section>
                <div className="flex justify-between items-end mb-2 px-1">
                  <h3 className="text-sm font-bold text-slate-500">
                    アクションカード (残り {MAX_CARD_USAGE - usedCardCount}回)
                  </h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 md:gap-3">
                  {cards.map((card) => (
                    <button
                      type="button"
                      key={card.id}
                      onClick={() => handleCardUse(card)}
                      disabled={card.used || usedCardCount >= MAX_CARD_USAGE}
                      className={`relative flex flex-col items-center justify-center p-2 md:p-4 rounded-xl border-2 transition-all duration-200 h-32 ${
                        card.used
                          ? 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed scale-95'
                          : usedCardCount >= MAX_CARD_USAGE
                          ? 'bg-white border-slate-200 text-slate-300 cursor-not-allowed'
                          : `${getCardColor(card.type)} shadow-sm hover:-translate-y-1 hover:shadow-md`
                      }`}
                    >
                      <div className="mb-2">{getCardIcon(card.type)}</div>
                      <span className="text-[10px] md:text-xs font-bold text-center leading-tight whitespace-pre-wrap line-clamp-3">
                        {getCardLabel(card)}
                      </span>
                      {card.type === 'ABILITY_REVEAL' && !card.used && (
                        <div className="absolute top-1 right-1">
                          <span className="text-[9px] font-bold text-yellow-600 bg-yellow-200 px-1 rounded">
                            RARE
                          </span>
                        </div>
                      )}
                      {card.used && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/50 rounded-xl">
                          <span className="text-xs font-bold text-slate-400 transform -rotate-12 border border-slate-400 px-1 rounded">
                            USED
                          </span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-3">
              {clues.length > 0 && (
                <h3 className="text-sm font-bold text-slate-500 px-1">取得した情報</h3>
              )}
              {clues.map((clue, index) => (
                <div
                  key={`${clue.title}-${index.toString()}`}
                  className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300"
                >
                  <div className="flex items-center gap-2 mb-2 text-sm font-bold text-indigo-600">
                    {getCardIcon(clue.type)}
                    <span>{clue.title}</span>
                  </div>
                  <div
                    className={`bg-slate-50 p-3 rounded-lg text-sm text-slate-700 leading-relaxed ${
                      clue.allowHtml
                        ? 'font-sans break-words whitespace-normal'
                        : 'font-mono break-all whitespace-pre-wrap'
                    }`}
                  >
                    {renderClueContent(clue)}
                  </div>
                </div>
              ))}
            </section>

            {guessHistory.length > 0 && (
              <section className="px-1">
                <h3 className="text-sm font-bold text-slate-500 mb-2 flex items-center gap-1">
                  <History size={14} />
                  回答履歴
                </h3>
                <div className="flex flex-wrap gap-2">
                  {guessHistory.map((hist, idx) => (
                    <span
                      key={`${hist.word}-${idx.toString()}`}
                      className="text-xs px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-600 shadow-sm flex items-center gap-1"
                    >
                      {hist.word}
                      {hist.matches > 0 && (
                        <span className="bg-green-100 text-green-700 px-1 rounded font-bold">
                          +{hist.matches}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </main>
        )}
      </div>

      {gameState === 'playing' && (
        <form
          onSubmit={handleGuess}
          className="sticky bottom-0 left-0 w-full bg-white border-t border-slate-200 p-4 shadow-lg z-10"
        >
          <div className="max-w-3xl mx-auto flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {maskedTitle.map((item, idx) => {
                const isRevealed = item.revealed;
                const displayValue =
                  isRevealed && article ? article.title[idx] : guessInputs[idx] || '';
                return (
                  <input
                    key={`guess-${idx}`}
                    type="text"
                    value={displayValue}
                    disabled={isRevealed}
                    ref={(el) => {
                      inputRefs.current[idx] = el;
                    }}
                    onChange={(e) => handleInputChange(idx, e.target.value)}
                    onKeyDown={(e) => handleInputKeyDown(e, idx)}
                    onCompositionStart={() => {
                      isComposingRef.current = true;
                    }}
                    onCompositionEnd={(e) => {
                      isComposingRef.current = false;
                      handleInputChange(idx, e.target.value);
                    }}
                    className={`w-10 h-12 text-center text-lg font-semibold border-2 rounded-lg transition focus:outline-none ${
                      isRevealed
                        ? 'bg-slate-200 text-slate-500 border-slate-200 cursor-not-allowed'
                        : 'bg-white text-slate-900 border-slate-300 focus:border-indigo-500'
                    }`}
                  />
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleGiveUp}
                className="px-4 py-3 rounded-xl font-bold border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
              >
                ギブアップ
              </button>
              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="bg-indigo-600 disabled:bg-slate-300 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold transition shadow-md disabled:shadow-none"
              >
                回答
              </button>
            </div>
          </div>
        </form>
      )}

      {(gameState === 'won' || gameState === 'lost' || gameState === 'gaveup') && (
        <div className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 p-6 shadow-lg">
          <div className="max-w-3xl mx-auto text-center">
            <button
              type="button"
              onClick={initGame}
              className="bg-slate-800 hover:bg-slate-900 text-white px-8 py-3 rounded-full font-bold transition shadow-lg inline-flex items-center gap-2 mx-auto"
            >
              <RefreshCw size={20} />
              もう一度遊ぶ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
