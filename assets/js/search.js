(() => {
  const root = document.querySelector("[data-article-search]");
  if (!root) return;

  const input = root.querySelector("[data-search-input]");
  const category = root.querySelector("[data-category-filter]");
  const tag = root.querySelector("[data-tag-filter]");
  const reset = root.querySelector("[data-search-reset]");
  const count = document.querySelector("[data-result-count]");
  const list = document.querySelector("[data-article-results]");
  const empty = document.querySelector("[data-empty-state]");
  let articles = [];

  const normalized = (value) => String(value || "").toLocaleLowerCase("en").trim();

  const readFallbackArticles = () => Array.from(list.querySelectorAll("[data-article-card]"), (card) => ({
    title: card.dataset.title,
    description: card.dataset.description,
    category: card.dataset.category,
    tags: card.dataset.tags.split(",").map((item) => item.trim()),
    published: card.dataset.published,
    updated: card.dataset.updated,
    readingTime: card.dataset.readingTime,
    url: card.querySelector("a").getAttribute("href")
  }));

  const makeMetaItem = (text) => {
    const item = document.createElement("li");
    item.textContent = text;
    return item;
  };

  const makeCard = (article) => {
    const item = document.createElement("li");
    item.className = "article-card";
    item.dataset.articleCard = "";

    const content = document.createElement("div");
    const heading = document.createElement("h2");
    const link = document.createElement("a");
    link.href = article.url;
    link.textContent = article.title;
    heading.append(link);

    const description = document.createElement("p");
    description.textContent = article.description;

    const meta = document.createElement("ul");
    meta.className = "meta-list";
    meta.setAttribute("aria-label", "Article details");
    meta.append(
      makeMetaItem(article.category),
      makeMetaItem(article.readingTime),
      makeMetaItem(article.tags.join(", "))
    );

    const published = document.createElement("time");
    published.dateTime = article.published;
    published.textContent = new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    }).format(new Date(`${article.published}T12:00:00Z`));

    content.append(heading, description, meta);
    item.append(content, published);
    return item;
  };

  const render = () => {
    const query = normalized(input.value);
    const selectedCategory = normalized(category.value);
    const selectedTag = normalized(tag.value);
    const matches = articles.filter((article) => {
      const haystack = normalized([
        article.title,
        article.description,
        article.category,
        ...article.tags
      ].join(" "));
      return (!query || haystack.includes(query))
        && (!selectedCategory || normalized(article.category) === selectedCategory)
        && (!selectedTag || article.tags.some((item) => normalized(item) === selectedTag));
    });

    list.replaceChildren(...matches.map(makeCard));
    count.textContent = `${matches.length} ${matches.length === 1 ? "article" : "articles"} shown`;
    empty.hidden = matches.length !== 0;
  };

  const initialize = async () => {
    const fallback = readFallbackArticles();
    articles = fallback;
    try {
      const response = await fetch("assets/data/articles.json");
      if (!response.ok) throw new Error("Article data unavailable");
      const data = await response.json();
      if (Array.isArray(data) && data.length) articles = data;
    } catch {
      // The complete static list remains searchable if JSON is unavailable.
    }
    render();
  };

  input.addEventListener("input", render);
  category.addEventListener("change", render);
  tag.addEventListener("change", render);
  reset.addEventListener("click", () => {
    input.value = "";
    category.value = "";
    tag.value = "";
    render();
    input.focus();
  });

  initialize();
})();
