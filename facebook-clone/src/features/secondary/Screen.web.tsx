import { usePathname, useLocalSearchParams } from 'expo-router';
import { useDemo } from '../../core/store';
import { imageUri } from '../../data/media';
import { Empty, Icon, Nav, PageTitle } from '../../ui/Controls.web';
import { PostCard } from '../feed/index.web';
import { ListingCard } from '../marketplace/index.web';
export default function SecondaryScreen() {
  const path = usePathname().split('/')[1],
    { group: groupId, event: eventId } = useLocalSearchParams<{ group?: string; event?: string }>();
  const { seed, posts, state } = useDemo();
  if (path === 'privacy')
    return (
      <div className="narrow-page">
        <PageTitle title="Privacy Checkup" back />
        <section className="card privacy-hero">
          <div className="privacy-illustration">
            <Icon name="shield" size={72} />
          </div>
          <h2>You’re in control of what you share</h2>
          <p>Review the choices that help you share with the people you want.</p>
          <Nav className="setting-category" href="/settings/audience">
            <Icon name="friends" />
            <span>
              <strong>Who can see what you share</strong>
              <small>Your default audience is {state.settings.audience}</small>
            </span>
            <Icon name="chevron" />
          </Nav>
          <Nav className="setting-category" href="/settings/notifications">
            <Icon name="notifications" />
            <span>
              <strong>How you hear from your community</strong>
              <small>Manage your notification preferences</small>
            </span>
            <Icon name="chevron" />
          </Nav>
          <p className="muted">This is a local demo. Your choices stay on this device.</p>
        </section>
      </div>
    );
  if (['feeds', 'memories', 'saved'].includes(path)) {
    const shown =
      path === 'saved'
        ? posts.filter((p) => state.savedPostIds.includes(p.id))
        : path === 'memories'
          ? posts.filter((p) => ['post-03', 'post-05'].includes(p.id))
          : posts;
    return (
      <div className="feed-column">
        <PageTitle
          title={path === 'saved' ? 'Saved' : path === 'memories' ? 'Memories' : 'Feeds'}
          subtitle={
            path === 'memories'
              ? 'Little moments worth remembering.'
              : path === 'feeds'
                ? state.settings.feedOrder === 'curated'
                  ? 'Curated order'
                  : 'Most recent'
                : 'Your favorite posts, all in one place.'
          }
        />
        {shown.length ? (
          shown.map((post) => <PostCard key={post.id} post={post} />)
        ) : (
          <section className="card">
            <Empty
              title="Nothing saved yet"
              text="Save a post from its menu to come back to it here."
              icon="saved"
            />
          </section>
        )}
        {path === 'saved' && state.savedListingIds.length > 0 && (
          <section className="card padded">
            <h2>Saved Marketplace listings</h2>
            <div className="saved-listings-grid">
              {seed.listings
                .filter((l) => state.savedListingIds.includes(l.id))
                .map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
            </div>
          </section>
        )}
      </div>
    );
  }
  if (path === 'groups') {
    const selected = seed.groups.find((group) => group.id === groupId);
    return (
      <div className="secondary-page">
        <PageTitle
          title={selected?.name || 'Groups'}
          subtitle={selected?.description || 'Connect with people who share your interests.'}
          back={!!selected}
        />
        {selected ? (
          <div className="group-feed">
            <img className="group-cover" src={imageUri(selected.image)} alt={selected.name} />
            {posts
              .filter((post) => selected.postIds.includes(post.id))
              .map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
          </div>
        ) : (
          <div className="community-grid">
            {seed.groups.map((group) => (
              <Nav
                href={`/groups?group=${group.id}`}
                key={group.id}
                className="card community-card"
              >
                <img src={imageUri(group.image)} alt={group.name} />
                <div>
                  <h2>{group.name}</h2>
                  <p>{group.description}</p>
                  <span className="button soft-blue full">View group</span>
                </div>
              </Nav>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (path === 'events') {
    const events = eventId ? seed.events.filter((event) => event.id === eventId) : seed.events;
    return (
      <div className="secondary-page">
        <PageTitle title="Events" subtitle="Make plans with your community." />
        {events.length ? (
          <div className="community-grid">
            {events.map((event) => (
              <article className="card community-card" key={event.id}>
                <img src={imageUri(event.image)} alt={event.title} />
                <div>
                  <span className="event-date">{event.date}</span>
                  <h2>{event.title}</h2>
                  <p>{event.description}</p>
                  <p className="muted">
                    <Icon name="location" size={16} />
                    {event.location}
                  </p>
                  <Nav className="button soft-blue full" href="/friends">
                    Find friends to go with
                  </Nav>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="Event not found"
            text="Browse Events to see plans from your community."
            icon="events"
          />
        )}
      </div>
    );
  }
  return (
    <div className="secondary-page">
      <PageTitle title="Video" subtitle="Moments from your community · local photo previews" />
      <div className="video-grid">
        {posts
          .filter((post) => post.photos.length)
          .map((post) => (
            <Nav href={`/posts/${post.id}`} className="card video-card" key={post.id}>
              <img src={imageUri(post.photos[0])} alt={post.text} />
              <div>
                <h3>{post.text}</h3>
                <span className="muted">Open photo post</span>
              </div>
            </Nav>
          ))}
      </div>
    </div>
  );
}
