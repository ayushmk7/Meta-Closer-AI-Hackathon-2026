import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useDemo } from '../../core/store';
import { imageUri } from '../../data/media';
import { Avatar, Empty, Icon, Nav, PageTitle } from '../../ui/Controls.web';
import { PostCard } from '../feed/index.web';
const sections = [
  ['home', 'Home', 'friends'],
  ['requests', 'Friend requests', 'friends'],
  ['suggestions', 'Suggestions', 'friends'],
  ['all', 'All friends', 'friends'],
  ['birthdays', 'Birthdays', 'birthday'],
];
export default function FriendsScreen() {
  const { section: initial } = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState(initial || 'home');
  const { seed, requests, person, actions, state, friends, posts } = useDemo();
  useEffect(() => setSection(initial || 'home'), [initial]);
  return (
    <div className="section-layout">
      <aside className="section-sidebar">
        <h1>Friends</h1>
        {sections.map(([id, label, icon]) => (
          <button
            className={`section-nav-row ${section === id ? 'active' : ''}`}
            key={id}
            onClick={() => setSection(id)}
          >
            <span className="menu-icon">
              <Icon name={icon} />
            </span>
            <strong>{label}</strong>
            <Icon name="chevron" size={20} />
          </button>
        ))}
      </aside>
      <div className="section-content friends-content">
        <div className="mobile-page-heading">
          <PageTitle title="Friends" />
          <div className="chip-row">
            {sections.slice(1).map(([id, label]) => (
              <button
                className={`chip ${section === id ? 'active' : ''}`}
                key={id}
                onClick={() => setSection(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {(section === 'home' || section === 'requests') && (
          <section>
            <div className="section-heading">
              <h2>
                Friend requests <span className="request-count">{requests.length}</span>
              </h2>
              {section === 'home' && (
                <button className="text-button" onClick={() => setSection('requests')}>
                  See all
                </button>
              )}
            </div>
            {requests.length ? (
              <div className="requests-grid">
                {requests.map((request) => {
                  const friend = person(request.personId);
                  return (
                    <article className="card friend-request" key={request.id}>
                      <Nav href={`/profile/${friend.id}`}>
                        <img
                          className="request-photo"
                          src={imageUri(friend.avatar)}
                          alt={friend.name}
                        />
                      </Nav>
                      <div className="request-detail">
                        <Nav href={`/profile/${friend.id}`}>
                          <h3>{friend.name}</h3>
                        </Nav>
                        <span className="mutual">
                          <Avatar person={friends[0] || person(seed.viewerId)} size={18} />
                          {request.mutual} mutual friends
                        </span>
                        <div className="request-buttons">
                          <button
                            className="button primary full"
                            onClick={() => actions.decideRequest(request.id, 'confirmed')}
                          >
                            Confirm
                          </button>
                          <button
                            className="button neutral full"
                            onClick={() => actions.decideRequest(request.id, 'deleted')}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <section className="card">
                <Empty
                  title="No new friend requests"
                  text="You’ve responded to all of your requests."
                  icon="friends"
                />
              </section>
            )}
          </section>
        )}
        {(section === 'home' || section === 'suggestions') && (
          <section className="friends-block">
            <div className="section-heading">
              <h2>People you may know</h2>
            </div>
            <div className="requests-grid">
              {seed.suggestions.map((id) => {
                const friend = person(id);
                return (
                  <article className="card friend-request" key={id}>
                    <Nav href={`/profile/${id}`}>
                      <img
                        className="request-photo"
                        src={imageUri(friend.avatar)}
                        alt={friend.name}
                      />
                    </Nav>
                    <div className="request-detail">
                      <Nav href={`/profile/${id}`}>
                        <h3>{friend.name}</h3>
                      </Nav>
                      <span className="mutual">3 mutual friends</span>
                      <button
                        className="button soft-blue full"
                        onClick={() => actions.requestFriend(id)}
                        disabled={
                          state.sentRequestIds.includes(id) ||
                          friends.some((item) => item.id === id)
                        }
                      >
                        <Icon name="friends" size={17} />
                        {friends.some((item) => item.id === id)
                          ? 'Friends'
                          : state.sentRequestIds.includes(id)
                            ? 'Requested'
                            : 'Add friend'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
        {section === 'all' && (
          <>
            <PageTitle title="All friends" subtitle={`${friends.length} friends`} />
            <div className="all-friends-list">
              {friends.map((friend) => (
                <Nav
                  href={`/profile/${friend.id}`}
                  className="card friend-tile person-line"
                  key={friend.id}
                >
                  <Avatar person={friend} size={72} />
                  <div>
                    <strong>{friend.name}</strong>
                    <small>{friend.location}</small>
                  </div>
                  <Icon name="chevron" />
                </Nav>
              ))}
            </div>
          </>
        )}
        {section === 'birthdays' && (
          <>
            <PageTitle title="Birthdays" subtitle="Celebrate the people in your community." />
            <section className="card padded">
              <h2>Upcoming birthdays</h2>
              {friends.slice(0, 3).map((friend, index) => (
                <Nav
                  href={`/profile/${friend.id}`}
                  key={friend.id}
                  className="person-line birthday-row"
                >
                  <Avatar person={friend} size={52} />
                  <div>
                    <strong>{friend.name}</strong>
                    <small>November {18 + index * 3}</small>
                  </div>
                  <Icon name="birthday" />
                </Nav>
              ))}
            </section>
          </>
        )}
        {section === 'home' && (
          <section className="friends-activity">
            <h2>From your friends</h2>
            {posts
              .filter((p) => friends.some((f) => f.id === p.authorId))
              .slice(0, 2)
              .map((post) => (
                <PostCard post={post} key={post.id} />
              ))}
          </section>
        )}
      </div>
    </div>
  );
}
