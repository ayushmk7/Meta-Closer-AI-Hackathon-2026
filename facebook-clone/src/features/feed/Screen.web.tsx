import { homeSections } from '../../extensions/registry';
import { useDemo } from '../../core/store';
import { Composer, PostCard, Stories } from './Components.web';
export default function FeedScreen() {
  const { posts } = useDemo();
  return (
    <div className="feed-column">
      <Composer />
      {homeSections.map(({ id, Component }) => (
        <Component key={id} />
      ))}
      <Stories />
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      <footer className="feed-end">
        <p>You’re all caught up · You’ve seen every post in your feed.</p>
        <button
          className="text-button"
          onClick={() =>
            window.scrollTo({
              top: 0,
              behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'auto'
                : 'smooth',
            })
          }
        >
          Back to top
        </button>
      </footer>
    </div>
  );
}
