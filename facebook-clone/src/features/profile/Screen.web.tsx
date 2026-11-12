import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useDemo } from '../../core/store';
import { imageUri } from '../../data/media';
import { pickPhoto } from '../../platform/photo';
import { Avatar, Empty, Icon, IconButton, Modal, Nav } from '../../ui/Controls.web';
import { Composer, PostCard } from '../feed/index.web';
export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { seed, person, friends, posts, state, actions, conversationFor } = useDemo();
  const profile = person(id || seed.viewerId),
    own = profile.id === seed.viewerId;
  const [tab, setTab] = useState('Posts'),
    [editor, setEditor] = useState(false),
    [more, setMore] = useState(false),
    [preview, setPreview] = useState(false),
    [error, setError] = useState('');
  const [bio, setBio] = useState(profile.bio),
    [location, setLocation] = useState(profile.location);
  const cover = profile.cover || seed.stories[0].image;
  const authored = posts.filter(
    (p) => p.authorId === profile.id && (!preview || p.audience === 'Public'),
  );
  const photos = [cover, ...authored.flatMap((post) => post.photos)];
  function openEditor() {
    setBio(profile.bio);
    setLocation(profile.location);
    setEditor(true);
  }
  async function updatePhoto(field: 'avatar' | 'cover') {
    try {
      const photo = await pickPhoto();
      if (photo) actions.updateProfile({ [field]: photo });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Photo unavailable');
    }
  }
  if (id && !seed.people.some((p) => p.id === id))
    return (
      <Empty
        title="Profile not found"
        text="Choose a person from your friends or search results."
        icon="friends"
      />
    );
  return (
    <div className="profile-page">
      {preview && (
        <div className="preview-banner">
          <Icon name="globe" />
          <span>This is how your public profile looks.</span>
          <button className="button neutral" onClick={() => setPreview(false)}>
            Exit View As
          </button>
        </div>
      )}
      <div className="profile-top">
        <div className="profile-cover">
          <img src={imageUri(cover)} alt={`${profile.name}'s cover`} />
          {own && !preview && (
            <button className="button neutral edit-cover" onClick={() => void updatePhoto('cover')}>
              <Icon name="photo" size={18} />
              Edit cover photo
            </button>
          )}
        </div>
        <div className="profile-identity">
          <div className="profile-avatar">
            <Avatar person={profile} size={168} />
            {own && !preview && (
              <IconButton
                icon="photo"
                label="Edit profile picture"
                onClick={() => void updatePhoto('avatar')}
              />
            )}
          </div>
          <div className="profile-name">
            <h1>{profile.name}</h1>
            <span>{friends.length} friends</span>
            <div className="friend-avatar-stack">
              {friends.slice(0, 7).map((friend) => (
                <Nav href={`/profile/${friend.id}`} key={friend.id}>
                  <Avatar person={friend} size={30} />
                </Nav>
              ))}
            </div>
          </div>
          <div className="profile-buttons">
            {own ? (
              !preview && (
                <>
                  <button className="button primary" onClick={openEditor}>
                    <Icon name="edit" size={18} />
                    Edit profile
                  </button>
                  <button className="button neutral" onClick={() => setPreview(true)}>
                    <Icon name="globe" size={18} />
                    View As
                  </button>
                </>
              )
            ) : (
              <>
                <button
                  className="button primary"
                  onClick={() => actions.requestFriend(profile.id)}
                  disabled={
                    friends.some((f) => f.id === profile.id) ||
                    state.sentRequestIds.includes(profile.id)
                  }
                >
                  <Icon name="friends" size={18} />
                  {friends.some((f) => f.id === profile.id)
                    ? 'Friends'
                    : state.sentRequestIds.includes(profile.id)
                      ? 'Requested'
                      : 'Add friend'}
                </button>
                <Nav href={`/messages/${conversationFor(profile.id)}`} className="button neutral">
                  <Icon name="messenger" size={18} />
                  Message
                </Nav>
              </>
            )}
          </div>
        </div>
        {own && !preview && (
          <section className="profile-suggestions">
            <div className="section-heading">
              <h3>People you may know</h3>
              <Nav href="/friends?section=suggestions">See all</Nav>
            </div>
            <div className="suggestion-strip">
              {seed.suggestions.map((friendId) => {
                const friend = person(friendId);
                return (
                  <div className="suggestion-card" key={friend.id}>
                    <Nav href={`/profile/${friend.id}`}>
                      <img src={imageUri(friend.avatar)} alt={friend.name} />
                    </Nav>
                    <div>
                      <Nav href={`/profile/${friend.id}`}>
                        <strong>{friend.name}</strong>
                      </Nav>
                      <small>3 mutual friends</small>
                      <button
                        className="button soft-blue full"
                        disabled={
                          state.sentRequestIds.includes(friend.id) ||
                          friends.some((item) => item.id === friend.id)
                        }
                        onClick={() => actions.requestFriend(friend.id)}
                      >
                        <Icon name="friends" size={16} />
                        {friends.some((item) => item.id === friend.id)
                          ? 'Friends'
                          : state.sentRequestIds.includes(friend.id)
                            ? 'Requested'
                            : 'Add friend'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        <nav className="profile-tabs" aria-label="Profile sections">
          {['Posts', 'About', 'Friends', 'Photos'].map((label) => (
            <button
              key={label}
              className={tab === label ? 'active' : ''}
              onClick={() => setTab(label)}
            >
              {label}
            </button>
          ))}
          <div className="profile-more">
            <button onClick={() => setMore(!more)}>
              More
              <Icon name="down" size={16} />
            </button>
            {more && (
              <div className="mini-menu">
                <Nav href="/events">Events</Nav>
                <Nav href="/groups">Groups</Nav>
                {own && (
                  <button
                    onClick={() => {
                      setPreview(!preview);
                      setMore(false);
                    }}
                  >
                    View As
                  </button>
                )}
              </div>
            )}
          </div>
        </nav>
      </div>
      {error && (
        <p role="alert" className="error-text page-error">
          {error}
        </p>
      )}
      <div className="profile-body">
        {tab === 'Posts' && (
          <>
            <aside className="profile-intro">
              <section className="card padded">
                <h2>Intro</h2>
                <p className="bio">{profile.bio}</p>
                {own && !preview && (
                  <button className="button neutral full" onClick={openEditor}>
                    Edit bio
                  </button>
                )}
                <p className="detail-line">
                  <Icon name="location" size={20} />
                  <span>
                    Lives in <strong>{profile.location}</strong>
                  </span>
                </p>
                <p className="detail-line">
                  <Icon name="work" size={20} />
                  Building things, making memories
                </p>
                {own && !preview && (
                  <button className="button neutral full" onClick={openEditor}>
                    Edit details
                  </button>
                )}
              </section>
              <section className="card padded">
                <div className="section-heading">
                  <h2>Photos</h2>
                  <button className="text-button" onClick={() => setTab('Photos')}>
                    See all photos
                  </button>
                </div>
                <div className="photo-preview-grid">
                  {photos.slice(0, 6).map((photo, index) => (
                    <button key={`${photo}-${index}`} onClick={() => setTab('Photos')}>
                      <img src={imageUri(photo)} alt={`Profile photo ${index + 1}`} />
                    </button>
                  ))}
                </div>
              </section>
              <section className="card padded">
                <div className="section-heading">
                  <h2>Friends</h2>
                  <button className="text-button" onClick={() => setTab('Friends')}>
                    See all friends
                  </button>
                </div>
                <p className="muted">{friends.length} friends</p>
                <div className="friend-preview-grid">
                  {friends.slice(0, 6).map((friend) => (
                    <Nav href={`/profile/${friend.id}`} key={friend.id}>
                      <img src={imageUri(friend.avatar)} alt={friend.name} />
                      <strong>{friend.name}</strong>
                    </Nav>
                  ))}
                </div>
              </section>
            </aside>
            <div className="profile-posts">
              {own && !preview && <Composer />}
              <section className="card profile-post-title">
                <h2>Posts</h2>
                <span className="muted">{preview ? 'Public posts' : 'List view'}</span>
              </section>
              {authored.length ? (
                authored.map((post) => <PostCard key={post.id} post={post} readOnly={preview} />)
              ) : (
                <section className="card">
                  <Empty
                    title="No posts to show"
                    text={
                      preview
                        ? 'Posts shared with Public will appear here.'
                        : 'Share something to start the conversation.'
                    }
                    icon="feeds"
                  />
                </section>
              )}
            </div>
          </>
        )}
        {tab === 'About' && (
          <section className="card padded full-width">
            <h2>About {profile.name.split(' ')[0]}</h2>
            <p>{profile.bio}</p>
            <p className="detail-line">
              <Icon name="location" />
              <span>
                Lives in <strong>{profile.location}</strong>
              </span>
            </p>
            <p className="detail-line">
              <Icon name="friends" />
              <span>{friends.length} friends in this community</span>
            </p>
            {own && !preview && (
              <button className="button neutral" onClick={openEditor}>
                Edit details
              </button>
            )}
          </section>
        )}
        {tab === 'Friends' && (
          <section className="card padded full-width">
            <div className="section-heading">
              <h2>Friends</h2>
              <Nav href="/friends">Find friends</Nav>
            </div>
            <div className="profile-friends-grid">
              {friends.map((friend) => (
                <Nav
                  className="person-line friend-tile"
                  href={`/profile/${friend.id}`}
                  key={friend.id}
                >
                  <Avatar person={friend} size={80} />
                  <div>
                    <strong>{friend.name}</strong>
                    <small>{friend.location}</small>
                  </div>
                </Nav>
              ))}
            </div>
          </section>
        )}
        {tab === 'Photos' && (
          <section className="card padded full-width">
            <h2>Photos</h2>
            <div className="profile-photo-grid">
              {photos.map((photo, index) => (
                <img
                  key={`${photo}-${index}`}
                  src={imageUri(photo)}
                  alt={`Photo ${index + 1} from ${profile.name}`}
                />
              ))}
            </div>
          </section>
        )}
      </div>
      {editor && (
        <Modal title="Edit profile" onClose={() => setEditor(false)}>
          <form
            className="dialog-body form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              actions.updateProfile({ bio, location });
              setEditor(false);
            }}
          >
            <label>
              Bio
              <textarea
                aria-label="Bio"
                maxLength={180}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </label>
            <label>
              City
              <input
                aria-label="City"
                maxLength={80}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </label>
            <button className="button primary full" type="submit">
              Save
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
