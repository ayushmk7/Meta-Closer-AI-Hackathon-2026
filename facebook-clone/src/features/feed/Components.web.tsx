import { useEffect, useRef, useState } from 'react';
import { router, type Href } from 'expo-router';
import { composerActions, postActions } from '../../extensions/registry';
import { useDemo } from '../../core/store';
import type { Audience, Post, Reaction } from '../../core/types';
import { imageUri } from '../../data/media';
import { pickPhoto } from '../../platform/photo';
import { Avatar, AudienceIcon, Icon, IconButton, Modal, Nav } from '../../ui/Controls.web';

export function Composer({ onCreated }: { onCreated?: () => void }) {
  const demo = useDemo();
  const { person, seed, state, actions } = demo;
  const viewer = person(seed.viewerId);
  const [open, setOpen] = useState(false),
    [text, setText] = useState(''),
    [photo, setPhoto] = useState<string>(),
    [error, setError] = useState('');
  const [audience, setAudience] = useState<Audience>(state.settings.audience),
    [feeling, setFeeling] = useState(false),
    [info, setInfo] = useState('');
  function show() {
    setAudience(state.settings.audience);
    setOpen(true);
  }
  async function choosePhoto() {
    try {
      const chosen = await pickPhoto();
      if (chosen) setPhoto(chosen);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not open this photo.');
    }
  }
  function post() {
    const id = actions.createPost({ text, photo, audience });
    if (id) {
      setOpen(false);
      setText('');
      setPhoto(undefined);
      onCreated?.();
    }
  }
  return (
    <>
      <section className="card composer-card" aria-label="Create a post">
        <div className="composer-prompt">
          <Nav href="/profile">
            <Avatar person={viewer} />
          </Nav>
          <button className="composer-open" onClick={show}>
            What’s on your mind, {viewer.name.split(' ')[0]}?
          </button>
        </div>
        <div className="composer-shortcuts">
          {composerActions.map((action) => (
            <button
              key={action.id}
              onClick={() =>
                action.run({
                  demo,
                  navigate: (href) => router.push(href as Href),
                  notify: setInfo,
                  openComposer: show,
                  selectPhoto: () => {
                    show();
                    void choosePhoto();
                  },
                  chooseFeeling: () => {
                    show();
                    setFeeling(true);
                  },
                })
              }
            >
              <span style={{ color: action.color }}>
                <Icon name={action.icon} />
              </span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </section>
      {open && (
        <Modal title="Create post" onClose={() => setOpen(false)}>
          <div className="composer-dialog">
            <div className="person-line">
              <Avatar person={viewer} />
              <div>
                <strong>{viewer.name}</strong>
                <label className="audience-control">
                  <AudienceIcon audience={audience} />
                  <select
                    aria-label="Post audience"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value as Audience)}
                  >
                    <option>Public</option>
                    <option>Friends</option>
                    <option>Only me</option>
                  </select>
                </label>
              </div>
            </div>
            <textarea
              autoFocus
              aria-label="Post text"
              placeholder={`What’s on your mind, ${viewer.name.split(' ')[0]}?`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={5000}
            />
            {feeling && (
              <div className="feeling-options">
                {['😊 happy', '🥰 grateful', '🤩 excited', '😌 relaxed'].map((mood) => (
                  <button
                    className="chip"
                    key={mood}
                    onClick={() => {
                      setText((value) => `${value}${value ? '\n' : ''}Feeling ${mood}`);
                      setFeeling(false);
                    }}
                  >
                    {mood}
                  </button>
                ))}
              </div>
            )}
            {photo && (
              <div className="composer-photo">
                <img src={imageUri(photo)} alt="Selected photo" />
                <IconButton icon="close" label="Remove photo" onClick={() => setPhoto(undefined)} />
              </div>
            )}
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <div className="add-post">
              <strong>Add to your post</strong>
              <IconButton
                icon="photo"
                label="Add photo"
                className="green"
                onClick={() => void choosePhoto()}
              />
              <IconButton
                icon="feeling"
                label="Add feeling"
                className="yellow"
                onClick={() => setFeeling(!feeling)}
              />
            </div>
            <button className="button primary full" disabled={!text.trim()} onClick={post}>
              Post
            </button>
          </div>
        </Modal>
      )}
      {info && (
        <Modal title="Live video" onClose={() => setInfo('')}>
          <div className="dialog-body">
            <p>{info}</p>
            <button
              className="button primary full"
              onClick={() => {
                setInfo('');
                show();
              }}
            >
              Create a post
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
const reactions: [Reaction, string][] = [
  ['Like', '👍'],
  ['Love', '❤️'],
  ['Care', '🥰'],
  ['Haha', '😆'],
  ['Wow', '😮'],
  ['Sad', '😢'],
  ['Angry', '😡'],
];
export function PostCard({
  post,
  expanded = false,
  readOnly = false,
}: {
  post: Post;
  expanded?: boolean;
  readOnly?: boolean;
}) {
  const demo = useDemo();
  const { person, seed, state, actions } = demo;
  const author = person(post.authorId),
    viewer = person(seed.viewerId),
    reaction = state.reactions[post.id];
  const [comments, setComments] = useState(expanded),
    [comment, setComment] = useState(''),
    [picker, setPicker] = useState(false),
    [menu, setMenu] = useState(false),
    [menuAbove, setMenuAbove] = useState(false),
    [pickerBelow, setPickerBelow] = useState(false),
    [share, setShare] = useState(false),
    [copied, setCopied] = useState(false);
  const commentInput = useRef<HTMLInputElement>(null),
    menuRef = useRef<HTMLDivElement>(null),
    reactionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu && !picker) return;
    function closeOutside(event: MouseEvent) {
      if (menu && !menuRef.current?.contains(event.target as Node)) setMenu(false);
      if (picker && !reactionRef.current?.contains(event.target as Node)) setPicker(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenu(false);
        setPicker(false);
        (menu ? menuRef : reactionRef).current?.querySelector('button')?.focus();
      }
    }
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menu, picker]);
  const href = `/posts/${post.id}`;
  return (
    <article className="card post-card" data-testid="post-card" data-post-id={post.id}>
      <header className="post-header">
        <Nav href={`/profile/${author.id}`}>
          <Avatar person={author} />
        </Nav>
        <div className="post-author">
          <Nav href={`/profile/${author.id}`} className="author-name">
            {author.name}
          </Nav>
          <Nav href={href} className="metadata">
            {post.time}
            <span>·</span>
            <span title={post.audience}>
              <AudienceIcon audience={post.audience} />
            </span>
            <span className="sr-only">{post.audience}</span>
          </Nav>
        </div>
        {!readOnly && (
          <div className="post-menu-wrap" ref={menuRef}>
            <IconButton
              icon="more"
              label={`Options for ${author.name}'s post`}
              onClick={() => {
                const bottom = menuRef.current?.getBoundingClientRect().bottom ?? 0;
                const clearance = window.innerWidth < 768 ? 72 : 12;
                setMenuAbove(
                  bottom + postActions.length * 44 + 16 > window.innerHeight - clearance,
                );
                setMenu(!menu);
              }}
            />
            {menu && (
              <div className={`mini-menu ${menuAbove ? 'open-above' : ''}`}>
                {postActions.map((action) => {
                  const context = {
                    demo,
                    navigate: (target: string) => router.push(target as Href),
                    notify: (message: string) => window.alert(message),
                  };
                  return (
                    <button
                      key={action.id}
                      onClick={() => {
                        action.run(context, post);
                        setMenu(false);
                      }}
                    >
                      <Icon name={action.icon} />
                      {action.label(context, post)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </header>
      <p className="post-copy">{post.text}</p>
      {post.photos.length > 0 && (
        <Nav href={href} className={`post-photos photo-count-${Math.min(post.photos.length, 3)}`}>
          {post.photos.map((photo, index) => (
            <img
              key={`${photo}-${index}`}
              src={imageUri(photo)}
              alt={`${author.name}'s photo ${index + 1}`}
              loading="lazy"
            />
          ))}
        </Nav>
      )}
      {post.link && (
        <Nav href={href} className="link-preview">
          <img src={imageUri(post.link.image)} alt={post.link.title} loading="lazy" />
          <div>
            <span>{post.link.domain}</span>
            <h3>{post.link.title}</h3>
            <p>{post.link.description}</p>
          </div>
        </Nav>
      )}
      <div className="post-stats">
        <span className="reactions-summary">
          <span className="reaction-circle like-circle">👍</span>
          <span className="reaction-circle love-circle">♥</span>
          <span>
            {reaction
              ? post.reactionCount === 1
                ? 'You'
                : `You and ${post.reactionCount - 1} others`
              : post.reactionCount}
          </span>
        </span>
        {readOnly ? (
          <span>{post.comments.length} comments</span>
        ) : (
          <button onClick={() => setComments(!comments)}>
            {post.comments.length} {post.comments.length === 1 ? 'comment' : 'comments'}
          </button>
        )}
      </div>
      {!readOnly && (
        <>
          <div className="post-actions">
            <div className="reaction-action" ref={reactionRef}>
              <button
                className={reaction ? 'reacted' : ''}
                aria-label={`React to ${author.name}'s post`}
                onClick={() => {
                  setPickerBelow((reactionRef.current?.getBoundingClientRect().top ?? 0) < 124);
                  setPicker(!picker);
                }}
              >
                <Icon name="like" />
                {reaction || 'Like'}
              </button>
              {picker && (
                <div
                  className={`reaction-picker ${pickerBelow ? 'open-below' : ''}`}
                  aria-label="Choose reaction"
                >
                  {reactions.map(([name, emoji]) => (
                    <button
                      key={name}
                      aria-label={name}
                      title={name}
                      className={reaction === name ? 'selected' : ''}
                      onClick={() => {
                        actions.toggleReaction(post.id, name);
                        setPicker(false);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                setComments(true);
                setTimeout(() => commentInput.current?.focus(), 0);
              }}
            >
              <Icon name="comment" />
              Comment
            </button>
            <button onClick={() => setShare(true)}>
              <Icon name="share" />
              Share
            </button>
          </div>
          {comments && (
            <div className="comments">
              {post.comments.map((item) => (
                <div className="comment-row" key={item.id}>
                  <Nav href={`/profile/${item.authorId}`}>
                    <Avatar person={person(item.authorId)} size={32} />
                  </Nav>
                  <div>
                    <div className="comment-bubble">
                      <Nav href={`/profile/${item.authorId}`}>
                        <strong>{person(item.authorId).name}</strong>
                      </Nav>
                      <p>{item.text}</p>
                    </div>
                    <small>{item.time}</small>
                  </div>
                </div>
              ))}
              <form
                className="comment-entry"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (comment.trim()) {
                    actions.addComment(post.id, comment);
                    setComment('');
                  }
                }}
              >
                <Avatar person={viewer} size={32} />
                <input
                  ref={commentInput}
                  aria-label={`Comment on ${author.name}'s post`}
                  placeholder="Write a comment…"
                  value={comment}
                  maxLength={2000}
                  onChange={(e) => setComment(e.target.value)}
                />
                <button type="submit" disabled={!comment.trim()} aria-label="Send comment">
                  <Icon name="send" size={20} />
                </button>
              </form>
            </div>
          )}
        </>
      )}
      {share && (
        <Modal title="Share post" onClose={() => setShare(false)}>
          <div className="dialog-body">
            <p>Share a link to this post within your local demo.</p>
            <input
              aria-label="Post link"
              readOnly
              value={`${typeof window !== 'undefined' ? window.location.origin : ''}${href}`}
            />
            <button
              className="button primary full"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${window.location.origin}${href}`);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? 'Link copied' : 'Copy link'}
            </button>
            <Nav href={href} className="button neutral full">
              Open post
            </Nav>
          </div>
        </Modal>
      )}
    </article>
  );
}
export function Stories() {
  const { stories, person, seed, actions, state } = useDemo();
  const viewer = person(seed.viewerId);
  const [create, setCreate] = useState(false),
    [photo, setPhoto] = useState<string>(),
    [caption, setCaption] = useState(''),
    [error, setError] = useState('');
  async function choose() {
    try {
      const selected = await pickPhoto();
      if (selected) setPhoto(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Photo unavailable.');
    }
  }
  return (
    <>
      <section className="stories" aria-label="Stories">
        <button className="story create-story" onClick={() => setCreate(true)}>
          <img src={imageUri(viewer.avatar)} alt="" />
          <span className="create-story-plus">
            <Icon name="plus" size={24} />
          </span>
          <strong>Create story</strong>
        </button>
        {stories
          .filter(
            (s) => s.authorId !== seed.viewerId || state.stories.some((local) => local.id === s.id),
          )
          .map((story) => (
            <Nav className="story" href={`/stories/${story.id}`} key={story.id}>
              <img
                className="story-image"
                src={imageUri(story.image)}
                alt={`${person(story.authorId).name}'s story`}
              />
              <span className="story-person">
                <Avatar person={person(story.authorId)} size={32} />
              </span>
              <strong>{person(story.authorId).name}</strong>
            </Nav>
          ))}
      </section>
      {create && (
        <Modal title="Create story" onClose={() => setCreate(false)}>
          <div className="dialog-body">
            <p>Share a moment with your friends.</p>
            {photo ? (
              <img className="story-preview" src={imageUri(photo)} alt="Story preview" />
            ) : (
              <button className="photo-pick" onClick={() => void choose()}>
                <Icon name="photo" size={36} />
                Choose a photo
              </button>
            )}
            <input
              aria-label="Story caption"
              placeholder="Add a caption…"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={200}
            />
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <button
              className="button primary full"
              disabled={!photo}
              onClick={() => {
                if (photo) {
                  const id = actions.createStory({ image: photo, text: caption });
                  setCreate(false);
                  router.push(`/stories/${id}` as Href);
                }
              }}
            >
              Share to story
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
