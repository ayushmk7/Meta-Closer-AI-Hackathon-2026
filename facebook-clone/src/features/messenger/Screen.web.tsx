import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useDemo } from '../../core/store';
import { Avatar, Empty, Icon, IconButton, Nav, PageTitle } from '../../ui/Controls.web';
export function ConversationList({ onSelect }: { onSelect?: (id: string) => void }) {
  const { seed, person, messages, friends, conversationFor } = useDemo();
  const [query, setQuery] = useState('');
  const conversations = [
    ...new Set([
      ...seed.conversations.map((c) => c.personId),
      ...seed.contacts,
      ...friends.map((p) => p.id),
      ...seed.listings.map((l) => l.sellerId),
    ]),
  ].map((personId) => ({ id: conversationFor(personId), personId }));
  return (
    <>
      <div className="panel-heading">
        <h2>Chats</h2>
        <Nav href="/search" aria-label="Find people">
          <Icon name="edit" />
        </Nav>
      </div>
      <label className="search-input">
        <Icon name="search" size={18} />
        <input
          aria-label="Search Messenger"
          placeholder="Search Messenger"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="chip-row">
        <span className="chip active">Inbox</span>
      </div>
      {conversations
        .filter((c) => person(c.personId).name.toLowerCase().includes(query.toLowerCase()))
        .map((conversation) => {
          const contact = person(conversation.personId);
          const recent = messages(conversation.id).at(-1);
          const content = (
            <>
              <Avatar person={contact} size={52} online={contact.online} />
              <span className="chat-preview">
                <strong>{contact.name}</strong>
                <small>
                  {recent?.authorId === seed.viewerId ? 'You: ' : ''}
                  {recent?.text || 'Start a conversation'}
                </small>
              </span>
            </>
          );
          return onSelect ? (
            <button
              key={conversation.id}
              className="conversation-row"
              onClick={() => onSelect(conversation.id)}
            >
              {content}
            </button>
          ) : (
            <Nav
              href={`/messages/${conversation.id}`}
              key={conversation.id}
              className="conversation-row"
            >
              {content}
            </Nav>
          );
        })}
    </>
  );
}
export function ChatPanel({
  id,
  onClose,
  listingId,
}: {
  id: string;
  onClose?: () => void;
  listingId?: string;
}) {
  const { seed, person, messages, actions, conversationFor } = useDemo();
  const contactId = seed.people.find((p) => conversationFor(p.id) === id)?.id;
  const contact = contactId ? person(contactId) : undefined;
  const listing = seed.listings.find((item) => item.id === listingId);
  const [text, setText] = useState('');
  const scroll = useRef<HTMLDivElement>(null);
  const history = messages(id);
  useEffect(() => {
    setText(listing ? `Hi, is ${listing.title.toLowerCase()} still available?` : '');
  }, [id, listing]);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [history.length, id]);
  if (!contact)
    return (
      <Empty
        title="Conversation not found"
        text="Choose someone from your contacts to start a conversation."
      />
    );
  return (
    <div className="chat-panel">
      <header className="chat-header">
        <Avatar person={contact} online={contact.online} />
        <Nav href={`/profile/${contact.id}`}>
          <strong>{contact.name}</strong>
          <small>{contact.online ? 'Active now' : 'Messenger'}</small>
        </Nav>
        {onClose && <IconButton icon="close" label="Close conversation" onClick={onClose} />}
      </header>
      {listing && (
        <div className="chat-listing-context">
          <Icon name="marketplace" size={17} />
          {listing.title} · ${listing.price}
        </div>
      )}
      <div className="chat-messages" ref={scroll}>
        <div className="chat-intro">
          <Avatar person={contact} size={64} />
          <strong>{contact.name}</strong>
          <small>You’re connected on this local demo.</small>
        </div>
        {history.map((message) => (
          <div
            key={message.id}
            className={`message ${message.authorId === seed.viewerId ? 'outgoing' : 'incoming'}`}
          >
            {message.authorId !== seed.viewerId && (
              <Avatar person={person(message.authorId)} size={26} />
            )}
            <div>
              <p>{message.text}</p>
              <small>{message.time}</small>
            </div>
          </div>
        ))}
      </div>
      <form
        className="chat-send"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) {
            actions.sendMessage(id, text);
            setText('');
          }
        }}
      >
        <input
          aria-label="Message"
          placeholder="Aa"
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className="icon-button blue"
          aria-label="Send message"
          type="submit"
          disabled={!text.trim()}
        >
          <Icon name="send" />
        </button>
      </form>
    </div>
  );
}
export default function MessengerScreen() {
  const { id, listing } = useLocalSearchParams<{ id?: string; listing?: string }>();
  return (
    <div className="messenger-page">
      <aside className={id ? 'conversation-sidebar has-chat' : 'conversation-sidebar'}>
        <ConversationList />
      </aside>
      <section className={`messenger-main ${id ? 'has-chat' : ''}`}>
        {id ? (
          <>
            <PageTitle title="Messenger" back />
            <ChatPanel key={id} id={id} listingId={listing} />
          </>
        ) : (
          <Empty
            title="Your messages"
            text="Choose a conversation to catch up with your friends."
            icon="messenger"
          />
        )}
      </section>
    </div>
  );
}
