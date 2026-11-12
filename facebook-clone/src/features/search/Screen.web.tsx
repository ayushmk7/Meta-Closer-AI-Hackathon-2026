import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useDemo } from '../../core/store';
import { imageUri } from '../../data/media';
import { Empty, Icon, Nav, PageTitle } from '../../ui/Controls.web';
export default function SearchScreen() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  const { search } = useDemo();
  const [query, setQuery] = useState(q || '');
  useEffect(() => setQuery(q || ''), [q]);
  const results = search(query),
    kinds = ['People', 'Posts', 'Stories', 'Marketplace', 'Events'];
  return (
    <div className="narrow-page search-page">
      <PageTitle title="Search" back />
      <label className="search-input search-large">
        <Icon name="search" />
        <input
          autoFocus
          aria-label="Search all content"
          placeholder="Search Facebook"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {!query.trim() ? (
        <Empty
          title="Find your people and interests"
          text="Search friends, posts, stories, local listings and events."
        />
      ) : !results.length ? (
        <Empty
          title="No results found"
          text={`We couldn’t find anything matching “${query}”. Try another search.`}
        />
      ) : (
        kinds
          .filter((kind) => results.some((result) => result.kind === kind))
          .map((kind) => (
            <section className="card search-section" key={kind}>
              <h2>{kind}</h2>
              {results
                .filter((result) => result.kind === kind)
                .map((result) => (
                  <Nav key={result.id} href={result.href} className="search-result">
                    {result.image ? (
                      <img
                        src={imageUri(result.image)}
                        alt=""
                        className={kind === 'People' ? 'circle' : ''}
                      />
                    ) : (
                      <span className="search-placeholder">
                        <Icon name={kind === 'Posts' ? 'feeds' : 'events'} />
                      </span>
                    )}
                    <span>
                      <strong>{result.title}</strong>
                      <small>{result.subtitle}</small>
                    </span>
                    <Icon name="chevron" size={18} />
                  </Nav>
                ))}
            </section>
          ))
      )}
    </div>
  );
}
