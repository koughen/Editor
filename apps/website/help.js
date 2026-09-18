const query = document.getElementById('help-query');
if (query) {
  let index = [];
  let activeCategory = 'all';
  const filters = [...document.querySelectorAll('[data-filter]')];
  const results = [...document.querySelectorAll('[data-article]')];
  const groups = [...document.querySelectorAll('[data-category-group]')];
  const count = document.getElementById('result-count');
  const clear = document.getElementById('clear-search');
  let loaded = false;
  let failed = false;

  function filterArticles() {
    const words = query.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const visible = new Set(index.filter((article) => {
      const searchable = `${article.title} ${article.description} ${article.text}`.toLocaleLowerCase();
      return (activeCategory === 'all' || article.category === activeCategory) && words.every((word) => searchable.includes(word));
    }).map(({ id }) => id));
    // Until the full index arrives, category filtering still works on the visible catalog.
    let number = 0;
    results.forEach((result) => {
      const inCategory = activeCategory === 'all' || result.closest('[data-category-group]').dataset.categoryGroup === activeCategory;
      result.hidden = loaded ? !visible.has(result.dataset.article) : !inCategory || !words.every((word) => result.textContent.toLocaleLowerCase().includes(word));
      if (!result.hidden) number += 1;
    });
    groups.forEach((group) => { group.hidden = ![...group.querySelectorAll('[data-article]')].some((result) => !result.hidden); });
    count.textContent = `${number} ${number === 1 ? 'guide' : 'guides'}${words.length ? ' matching your search' : ''}.${failed ? ' Searching titles and summaries; full-text index unavailable.' : ''}`;
    document.getElementById('no-results').hidden = number > 0;
    clear.hidden = !words.length && activeCategory === 'all';
    filters.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.filter === activeCategory)));
  }
  function resetSearch() {
    query.value = '';
    activeCategory = 'all';
    filterArticles();
    query.focus();
  }
  query.addEventListener('input', filterArticles);
  filters.forEach((button) => button.addEventListener('click', () => { activeCategory = button.dataset.filter; filterArticles(); }));
  clear.addEventListener('click', resetSearch);
  document.getElementById('reset-search').addEventListener('click', resetSearch);
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) && !event.metaKey && !event.ctrlKey) {
      event.preventDefault(); query.focus();
    }
    if (event.key === 'Escape' && document.activeElement === query) resetSearch();
  });
  fetch('./search-index.json').then((response) => {
    if (!response.ok) throw new Error('Index unavailable');
    return response.json();
  }).then((data) => { index = data; loaded = true; filterArticles(); }).catch(() => { failed = true; filterArticles(); });
}
document.querySelectorAll('.print-article').forEach((button) => button.addEventListener('click', () => window.print()));
